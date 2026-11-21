using FluentValidation;

namespace WodoPlon.Api.Common.Options;

public sealed class ExternalApisSettings
{
    public const string SectionName = "ExternalApis";

    public string UldkBaseUrl { get; set; } = "https://uldk.gugik.gov.pl/";
    public string OpenMeteoBaseUrl { get; set; } = "https://archive-api.open-meteo.com/";
    public string SoilGridsBaseUrl { get; set; } = "https://rest.isric.org/";
    public string OverpassBaseUrl { get; set; } = "https://overpass-api.de/";
    public int TimeoutSeconds { get; set; } = 8;
}

public sealed class ExternalApisSettingsValidation : AbstractValidator<ExternalApisSettings>
{
    public ExternalApisSettingsValidation()
    {
        RuleFor(x => x.UldkBaseUrl).Must(IsHttpUrl).WithMessage("ULDK BaseUrl must be an absolute http(s) URL.");
        RuleFor(x => x.OpenMeteoBaseUrl).Must(IsHttpUrl).WithMessage("Open-Meteo BaseUrl must be an absolute http(s) URL.");
        RuleFor(x => x.SoilGridsBaseUrl).Must(IsHttpUrl).WithMessage("SoilGrids BaseUrl must be an absolute http(s) URL.");
        RuleFor(x => x.OverpassBaseUrl).Must(IsHttpUrl).WithMessage("Overpass BaseUrl must be an absolute http(s) URL.");

        RuleFor(x => x.TimeoutSeconds)
            .GreaterThan(0).WithMessage("External APIs TimeoutSeconds must be positive.");
    }

    private static bool IsHttpUrl(string url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
}
