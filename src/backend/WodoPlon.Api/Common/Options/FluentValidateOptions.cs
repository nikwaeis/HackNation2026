using FluentValidation;
using Microsoft.Extensions.Options;

namespace WodoPlon.Api.Common.Options;

// Runs the FluentValidation validator of TOptions when options are built (and on start with ValidateOnStart).
public sealed class FluentValidateOptions<TOptions>(IServiceProvider services, string? name)
    : IValidateOptions<TOptions> where TOptions : class
{
    public ValidateOptionsResult Validate(string? optionsName, TOptions options)
    {
        if (name is not null && name != optionsName)
            return ValidateOptionsResult.Skip;

        // Validators are registered scoped, options validation runs from the root provider.
        using var scope = services.CreateScope();
        var result = scope.ServiceProvider.GetRequiredService<IValidator<TOptions>>().Validate(options);
        return result.IsValid
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(result.Errors.Select(e =>
                $"{typeof(TOptions).Name}.{e.PropertyName}: {e.ErrorMessage}"));
    }
}

public static class FluentValidateOptionsExtensions
{
    public static OptionsBuilder<TOptions> ValidateFluently<TOptions>(this OptionsBuilder<TOptions> builder)
        where TOptions : class
    {
        builder.Services.AddSingleton<IValidateOptions<TOptions>>(sp =>
            new FluentValidateOptions<TOptions>(sp, builder.Name));
        return builder;
    }
}
