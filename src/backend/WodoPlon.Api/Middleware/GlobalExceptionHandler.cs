using System.Globalization;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Localization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Localization;
using WodoPlon.Api.Common.Models;
using WodoPlon.Api.Resources;

namespace WodoPlon.Api.Middleware;

public sealed class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _logger;
    private readonly IStringLocalizer<SharedResources> _localizer;

    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger, IStringLocalizer<SharedResources> localizer)
    {
        _logger = logger;
        _localizer = localizer;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        // malformed client input (empty body, broken JSON, wrong date format): a client error, not a server failure
        if (exception is BadHttpRequestException badRequest)
        {
            _logger.LogWarning("Malformed request to {Path}: {Message}", httpContext.Request.Path, exception.Message);
            // UseExceptionHandler runs outside UseRequestLocalization: the culture it set does not flow back here
            if (httpContext.Features.Get<IRequestCultureFeature>() is { } requestCulture)
                CultureInfo.CurrentUICulture = requestCulture.RequestCulture.UICulture;
            await WriteProblemAsync(httpContext, badRequest.StatusCode, "Bad Request",
                _localizer[CommonErrorCodes.MalformedRequest].Value, cancellationToken);
            return true;
        }

        _logger.LogError(
            exception,
            "Unhandled exception occurred: {Message}",
            exception.Message
        );

        var (statusCode, title) = exception switch
        {
            UnauthorizedAccessException =>
                (StatusCodes.Status401Unauthorized, "Unauthorized"),
            KeyNotFoundException =>
                (StatusCodes.Status404NotFound, "Resource Not Found"),
            _ =>
                (StatusCodes.Status500InternalServerError, "Internal Server Error")
        };

        await WriteProblemAsync(httpContext, statusCode, title,
            statusCode == StatusCodes.Status500InternalServerError
                ? "An unexpected error occurred. Please try again later."
                : exception.Message,
            cancellationToken);

        return true;
    }

    private static Task WriteProblemAsync(HttpContext httpContext, int statusCode, string title, string detail,
        CancellationToken cancellationToken)
    {
        var problemDetails = new ProblemDetails
        {
            Status = statusCode,
            Title = title,
            Detail = detail,
            Instance = httpContext.Request.Path
        };

        problemDetails.Extensions["traceId"] = httpContext.TraceIdentifier;

        httpContext.Response.StatusCode = statusCode;

        return httpContext.Response.WriteAsJsonAsync(problemDetails, (System.Text.Json.JsonSerializerOptions?)null,
            "application/problem+json", cancellationToken);
    }
}
