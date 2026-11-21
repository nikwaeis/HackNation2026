using System.Text.Json.Serialization;

namespace WodoPlon.Api.Features.Crops.Query.GetCrops;

public record CropResponse
(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("namePl")] string NamePl,
    [property: JsonPropertyName("kcMid")] decimal KcMid,
    [property: JsonPropertyName("criticalMonths")] int[] CriticalMonths,
    [property: JsonPropertyName("rootDepthCm")] int RootDepthCm
);
