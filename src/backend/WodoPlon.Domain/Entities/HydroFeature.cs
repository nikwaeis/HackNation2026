using NetTopologySuite.Geometries;
using WodoPlon.Domain.Enums;
using WodoPlon.Domain.Results;

namespace WodoPlon.Domain.Entities;

/// <summary>
/// Preloaded water object (river, ditch, lake, wetland) for nearest-water lookup in PostGIS
/// </summary>
public sealed class HydroFeature
{
    public const int NameMaxLength = 150;

    /// <summary> Database generated id </summary>
    public long Id { get; private set; }

    /// <summary> OpenStreetMap way id; dedupes objects fetched again for neighbouring parcels </summary>
    public long? OsmId { get; private set; }

    /// <summary> Kind of water object </summary>
    public HydroFeatureType Type { get; private set; }

    /// <summary> Optional object name </summary>
    public string? Name { get; private set; }

    /// <summary> Line or polygon geometry in WGS 84 (SRID 4326) </summary>
    public Geometry Geom { get; private set; } = null!;

    private HydroFeature() { }

    public static Result<HydroFeature> Create(HydroFeatureType type, string? name, Geometry geom, long? osmId = null)
    {
        name = string.IsNullOrWhiteSpace(name) ? null : name.Trim();
        if (name?.Length > NameMaxLength)
            return ResultError.Validation(DomainErrorCodes.Entities.HydroFeature.NameMaxLength, NameMaxLength);

        if (geom is null || geom.IsEmpty)
            return ResultError.Validation(DomainErrorCodes.Entities.HydroFeature.EmptyGeometry);
        if (geom.SRID != Parcel.Srid)
            return ResultError.Validation(DomainErrorCodes.Entities.HydroFeature.InvalidSrid, Parcel.Srid);

        return new HydroFeature
        {
            OsmId = osmId,
            Type = type,
            Name = name,
            Geom = geom
        };
    }
}
