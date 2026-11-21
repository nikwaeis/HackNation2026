using FluentValidation;

namespace WodoPlon.Api.Common.Options;

public sealed class CorsSettings
{
    public const string SectionName = "Cors";

    // Frontend origin, e.g. https://wodoplon.example.com (no trailing slash)
    public string WebOrigin { get; set; } = null!;
}

public sealed class CorsSettingsValidation : AbstractValidator<CorsSettings>
{
    public CorsSettingsValidation()
    {
        RuleFor(x => x.WebOrigin)
            .NotEmpty().WithMessage("Web origin is required.")
            .Must(o => Uri.TryCreate(o, UriKind.Absolute, out var u)
                       && (u.Scheme == Uri.UriSchemeHttp || u.Scheme == Uri.UriSchemeHttps)
                       && !o.EndsWith('/'))
            .WithMessage("Web origin must be an absolute http(s) URL without trailing slash.");
    }
}
