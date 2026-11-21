using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using WodoPlon.Api.Common.Interface;

namespace WodoPlon.Api.Common.Services;

public sealed class SoilGridsClient(HttpClient httpClient, ILogger<SoilGridsClient> logger) : ISoilGridsClient
{
    public async Task<SoilSample?> GetTopsoilAsync(double lat, double lon, CancellationToken cancellationToken = default)
    {
        string query = string.Create(CultureInfo.InvariantCulture,
            $"soilgrids/v2.0/properties/query?lon={lon}&lat={lat}&property=sand&property=clay&property=silt&property=soc&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean");

        try
        {
            using var response = await httpClient.GetAsync(query, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("SoilGrids returned {StatusCode}", (int)response.StatusCode);
                return null;
            }

            var body = await response.Content.ReadFromJsonAsync<SoilGridsResponse>(cancellationToken);
            var layers = body?.Properties?.Layers ?? [];

            var sample = new SoilSample(Mean(layers, "sand"), Mean(layers, "clay"), Mean(layers, "silt"), Mean(layers, "soc"));
            return sample is { SandPct: null, ClayPct: null, SiltPct: null, SocGKg: null } ? null : sample;
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or TaskCanceledException
                                  && !cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(e, "SoilGrids request failed");
            return null;
        }
    }

    // thickness-weighted mean over the depths that have data, converted from mapped to target units
    private static decimal? Mean(Layer[] layers, string name)
    {
        var layer = layers.FirstOrDefault(l => l.Name == name);
        var depths = layer?.Depths.Where(d => d.Values.Mean is not null).ToArray() ?? [];
        if (depths.Length == 0)
            return null;

        decimal thickness = depths.Sum(d => d.Range.Bottom - d.Range.Top);
        decimal weighted = depths.Sum(d => d.Values.Mean!.Value * (d.Range.Bottom - d.Range.Top));
        return Math.Round(weighted / thickness / layer!.UnitMeasure.DFactor, 1);
    }

    private sealed record SoilGridsResponse([property: JsonPropertyName("properties")] Properties? Properties);
    private sealed record Properties([property: JsonPropertyName("layers")] Layer[] Layers);

    private sealed record Layer
    (
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("unit_measure")] UnitMeasure UnitMeasure,
        [property: JsonPropertyName("depths")] Depth[] Depths
    );

    private sealed record UnitMeasure([property: JsonPropertyName("d_factor")] decimal DFactor);

    private sealed record Depth
    (
        [property: JsonPropertyName("range")] DepthRange Range,
        [property: JsonPropertyName("values")] DepthValues Values
    );

    private sealed record DepthRange
    (
        [property: JsonPropertyName("top_depth")] decimal Top,
        [property: JsonPropertyName("bottom_depth")] decimal Bottom
    );

    private sealed record DepthValues([property: JsonPropertyName("mean")] decimal? Mean);
}
