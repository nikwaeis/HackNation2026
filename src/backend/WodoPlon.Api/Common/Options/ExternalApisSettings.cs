using FluentValidation;

namespace WodoPlon.Api.Common.Options;

public sealed class ExternalApisSettings
{
    public const string SectionName = "ExternalApis";

    public string UldkBaseUrl { get; set; } = "https://uldk.gugik.gov.pl/";
    public string OpenMeteoBaseUrl { get; set; } = "https://archive-api.open-meteo.com/";
    public string SoilGridsBaseUrl { get; set; } = "https://rest.isric.org/";
    public string OverpassBaseUrl { get; set; } = "https://overpass-api.de/";
    /// <summary> Tried in order when the main Overpass instance fails (it is often overloaded) </summary>
    public string[] OverpassMirrorUrls { get; set; } = ["https://overpass.private.coffee/", "https://overpass.kumi.systems/"];
    public int TimeoutSeconds { get; set; } = 8;
    /// <summary> Overpass runs in the background (HydroBackgroundService), so it may take long </summary>
    public int OverpassTimeoutSeconds { get; set; } = 30;
}

public sealed class ExternalApisSettingsValidation : AbstractValidator<ExternalApisSettings>
{
    public ExternalApisSettingsValidation()
    {
        RuleFor(x => x.UldkBaseUrl).Must(IsHttpUrl).WithMessage("ULDK BaseUrl must be an absolute http(s) URL.");
        RuleFor(x => x.OpenMeteoBaseUrl).Must(IsHttpUrl).WithMessage("Open-Meteo BaseUrl must be an absolute http(s) URL.");
        RuleFor(x => x.SoilGridsBaseUrl).Must(IsHttpUrl).WithMessage("SoilGrids BaseUrl must be an absolute http(s) URL.");
        RuleFor(x => x.OverpassBaseUrl).Must(IsHttpUrl).WithMessage("Overpass BaseUrl must be an absolute http(s) URL.");

        RuleForEach(x => x.OverpassMirrorUrls).Must(IsHttpUrl).WithMessage("Overpass mirror URLs must be absolute http(s) URLs.");

        RuleFor(x => x.TimeoutSeconds)
            .GreaterThan(0).WithMessage("External APIs TimeoutSeconds must be positive.");
        RuleFor(x => x.OverpassTimeoutSeconds)
            .GreaterThan(5).WithMessage("Overpass timeout must be above 5 seconds (server-side query budget is 5 s less).");
    }

    private static bool IsHttpUrl(string url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
}
