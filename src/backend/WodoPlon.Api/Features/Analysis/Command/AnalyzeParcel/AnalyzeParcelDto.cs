using System.Text.Json.Serialization;

namespace WodoPlon.Api.Features.Analysis.Command.AnalyzeParcel;

/// <summary> Either dzialkaId or a map click (lat, lon in WGS 84) </summary>
public record AnalyzeParcelDto
(
    [property: JsonPropertyName("dzialkaId")] string? DzialkaId,
    [property: JsonPropertyName("lat")] double? Lat,
    [property: JsonPropertyName("lon")] double? Lon,
    [property: JsonPropertyName("cropId")] string? CropId,
    [property: JsonPropertyName("targetDate")] DateOnly? TargetDate
);
