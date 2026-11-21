using System.Globalization;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using WodoPlon.Api.Features.Analysis.Shared;
using WodoPlon.Api.Resources;

namespace WodoPlon.UnitTests.Analysis;

/// <summary> Report texts from the real resx files, in the given UI culture </summary>
internal static class TestTexts
{
    public static ReportText Use(string culture)
    {
        CultureInfo.CurrentUICulture = CultureInfo.GetCultureInfo(culture);
        var factory = new ResourceManagerStringLocalizerFactory(
            Options.Create(new LocalizationOptions { ResourcesPath = "" }), NullLoggerFactory.Instance);
        return new ReportText(new StringLocalizer<SharedResources>(factory));
    }
}
