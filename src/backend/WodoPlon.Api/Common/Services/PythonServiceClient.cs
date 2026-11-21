using System.Text.Json;
using System.Text.Json.Serialization;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO.Converters;
using WodoPlon.Api.Common.Interface;
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

            return await response.Content.ReadFromJsonAsync<GeoMetrics>(JsonOptions, cancellationToken);
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or TaskCanceledException
                                  && !cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(e, "Geo-worker request failed for {ParcelId}", parcelId.Value);
            return null;
        }
    }

    private sealed record ExtractGeoRequest(string DzialkaId, DateOnly TargetDate, bool NeedTerrain, Geometry Geometry);
}
