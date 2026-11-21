using System.Text.Json;
using System.Text.Json.Serialization;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO.Converters;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Domain.Enums;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Api.Common.Services;

public sealed class PythonServiceClient(HttpClient httpClient, ILogger<PythonServiceClient> logger)
    : IPythonServiceClient
{
    // geo-worker contract is snake_case with "OK" / "NO_DATA" statuses
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseUpper), new GeoJsonConverterFactory() }
    };

    public async Task<bool> IsHealthyAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            using var response = await httpClient.GetAsync("/health", cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Python service health check failed");
            return false;
        }
    }

    public async Task<GeoMetrics?> ExtractGeoAsync(ParcelIdVo parcelId, DateOnly targetDate, bool needTerrain,
        MultiPolygon geometry, CancellationToken cancellationToken = default)
    {
        var request = new ExtractGeoRequest(parcelId.Value, targetDate, needTerrain, geometry);

        try
        {
            using var response = await httpClient.PostAsJsonAsync("/extract-geo", request, JsonOptions, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Geo-worker returned {StatusCode} for {ParcelId}", (int)response.StatusCode, parcelId.Value);
                return null;
            }

            var wire = await response.Content.ReadFromJsonAsync<ExtractGeoResponse>(JsonOptions, cancellationToken);
            return wire is null ? null : ToMetrics(wire);
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or TaskCanceledException
                                  && !cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(e, "Geo-worker request failed for {ParcelId}", parcelId.Value);
            return null;
        }
    }

    // terrain counts only when OK; satellite "ERROR" (worker-side failure) is retried by ObservationService
    private static GeoMetrics ToMetrics(ExtractGeoResponse wire)
    {
        var terrain = wire.Terrain?.Status == "OK" ? wire.Terrain : null;
        var satellite = wire.Satellite;
        var status = satellite?.Status switch
        {
            "OK" => SatelliteStatus.Ok,
            "CLOUDY_FALLBACK" => SatelliteStatus.CloudyFallback,
            "NO_DATA" => SatelliteStatus.NoData,
            _ => SatelliteStatus.Error
        };
        return new GeoMetrics(terrain?.MeanSlopeDeg, terrain?.MaxSlopeDeg, terrain?.SteepAreaPct,
            satellite?.NdviMean, satellite?.NdwiMean, satellite?.SceneDate, satellite?.CloudCoverPct, status);
    }

    private sealed record ExtractGeoRequest(string DzialkaId, DateOnly TargetDate, bool IncludeTerrain, Geometry Geometry);

    private sealed record ExtractGeoResponse(TerrainSection? Terrain, SatelliteSection? Satellite);

    private sealed record TerrainSection(string? Status, decimal? MeanSlopeDeg, decimal? MaxSlopeDeg, decimal? SteepAreaPct);

    private sealed record SatelliteSection(string? Status, decimal? NdviMean, decimal? NdwiMean, DateOnly? SceneDate,
        decimal? CloudCoverPct);
}
