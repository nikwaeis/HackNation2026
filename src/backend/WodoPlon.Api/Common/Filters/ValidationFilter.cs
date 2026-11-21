using System.Text.Json;
using FluentValidation;
using Microsoft.Extensions.Localization;
using WodoPlon.Api.Resources;

namespace WodoPlon.Api.Common.Filters;

/// <summary>Validates every endpoint argument that has a registered IValidator; endpoints with nothing to validate pass.</summary>
public sealed class ValidationFilter(IStringLocalizer<SharedResources> localizer) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var services = context.HttpContext.RequestServices;
        foreach (var argument in context.Arguments)
        {
            if (argument is null)
                continue;

            var validatorType = typeof(IValidator<>).MakeGenericType(argument.GetType());
            if (services.GetService(validatorType) is not IValidator validator)
                continue;

            var validationResult = await validator.ValidateAsync(
                new ValidationContext<object>(argument), context.HttpContext.RequestAborted);
            if (validationResult.IsValid)
                continue;

            Dictionary<string, string[]> errorCodesByProperty = validationResult.Errors
                // same casing as the JSON request fields (dzialkaId, not DzialkaId)
                .GroupBy(failure => JsonNamingPolicy.CamelCase.ConvertName(failure.PropertyName))
                .ToDictionary(
                    group => group.Key,
                    group => group.Select(failure => localizer[failure.ErrorCode].Value).ToArray());
            return TypedResults.ValidationProblem(errorCodesByProperty);
        }

        return await next(context);
    }
}
