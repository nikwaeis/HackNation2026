using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Localization;
using WodoPlon.Domain.Results;

namespace WodoPlon.Api.Extensions;

public static class ProblemExtension
{
    public static ProblemHttpResult ToProblemDetails(this Result result, IStringLocalizer localizer) =>
        result.Errors[0].ToProblemDetails(localizer);

    public static ProblemHttpResult ToProblemDetails(this ResultError error, IStringLocalizer localizer)
    {
        int status = error.Type switch
        {
            ErrorType.Validation => StatusCodes.Status400BadRequest,
            ErrorType.Unauthorized => StatusCodes.Status401Unauthorized,
            ErrorType.Forbidden => StatusCodes.Status403Forbidden,
            ErrorType.NotFound => StatusCodes.Status404NotFound,
            ErrorType.Conflict => StatusCodes.Status409Conflict,
            ErrorType.TooManyRequests => StatusCodes.Status429TooManyRequests,
            _ => StatusCodes.Status500InternalServerError
        };

        var localizedDetail = localizer[error.Code, error.Args].Value;

        return TypedResults.Problem(
            statusCode: status,
            title: GetProblemTitle(status),
            detail: localizedDetail);
    }

    private static string GetProblemTitle(int statusCode) => statusCode switch
    {
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        409 => "Conflict",
        429 => "Too Many Requests",
        _ => "An error occurred"
    };
}
