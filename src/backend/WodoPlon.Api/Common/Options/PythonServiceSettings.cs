using FluentValidation;

namespace WodoPlon.Api.Common.Options;

public sealed class PythonServiceSettings
{
    public const string SectionName = "PythonService";

    public string BaseUrl { get; set; } = "http://python-service:8000";
    public int TimeoutSeconds { get; set; } = 30;
}

public sealed class PythonServiceSettingsValidation : AbstractValidator<PythonServiceSettings>
{
    public PythonServiceSettingsValidation()
    {
        RuleFor(x => x.BaseUrl)
            .NotEmpty().WithMessage("Python service BaseUrl is required.")
            .Must(u => Uri.TryCreate(u, UriKind.Absolute, out var uri)
                       && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
            .WithMessage("Python service BaseUrl must be an absolute http(s) URL.");

        RuleFor(x => x.TimeoutSeconds)
            .GreaterThan(0).WithMessage("Python service TimeoutSeconds must be positive.");
    }
}
