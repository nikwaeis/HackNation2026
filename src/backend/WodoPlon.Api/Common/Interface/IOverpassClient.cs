using NetTopologySuite.Geometries;
using WodoPlon.Domain.Enums;

namespace WodoPlon.Api.Common.Interface;

/// <summary> Rivers, ditches, lakes and wetlands around a point from OpenStreetMap (Overpass API) </summary>
public interface IOverpassClient
{
    /// <summary> Null when Overpass is down; empty array when there is no water nearby </summary>
    Task<HydroFeatureData[]?> GetHydroAroundAsync(double lat, double lon, int radiusM,
        CancellationToken cancellationToken = default);
}

public sealed record HydroFeatureData(long OsmId, HydroFeatureType Type, string? Name, Geometry Geom);
