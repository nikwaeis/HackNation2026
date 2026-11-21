using System.Globalization;
using Microsoft.Extensions.Localization;
using WodoPlon.Api.Resources;
using WodoPlon.Domain.Entities;

namespace WodoPlon.Api.Features.Analysis.Shared;

/// <summary>
/// Report sentences from SharedResources (Report.*), in the request language (Accept-Language, default pl).
/// Numbers always use a dot, as in the api.md contract
/// </summary>
public sealed class ReportText(IStringLocalizer<SharedResources> localizer)
{
    private readonly IStringLocalizer<SharedResources> _localizer = localizer;

    public string this[string key, params object?[] args] =>
        string.Format(CultureInfo.InvariantCulture, _localizer[key].Value, args);

    /// <summary> Localized crop name; the Polish name from the DB when the resource has none </summary>
    public string CropName(Crop crop) =>
        _localizer[$"Crop.{crop.Id.Value}"] is { ResourceNotFound: false } name ? name.Value : crop.NamePl;

    /// <summary> Month names, 1-based </summary>
    public string Month(int month) => this["Report.Months"].Split(',')[month - 1];
}
