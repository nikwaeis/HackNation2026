using NetTopologySuite.Geometries;
using WodoPlon.Domain.Enums;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Api.Common.Interface;

public interface IPythonServiceClient
{
    Task<bool> IsHealthyAsync(CancellationToken cancellationToken = default);

    /// <summary> Terrain and Sentinel-2 metrics for the parcel; null when the geo-worker is down </summary>
    Task<GeoMetrics?> ExtractGeoAsync(ParcelIdVo parcelId, DateOnly targetDate, bool needTerrain, MultiPolygon geometry,
        CancellationToken cancellationToken = default);
}

public sealed record GeoMetrics
(
    decimal? MeanSlopeDeg,
    decimal? MaxSlopeDeg,
    decimal? SteepAreaPct,
    decimal? NdviMean,
    decimal? NdwiMean,
    DateOnly? SatelliteSceneDate,
    decimal? CloudCoverPct,
    SatelliteStatus SatelliteStatus
);
