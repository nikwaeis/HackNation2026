using NetTopologySuite.Geometries;
using WodoPlon.Domain.Results;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Domain.Entities;

/// <summary>
/// Cadastral parcel boundaries cached forever from ULDK GUGiK (by TERYT id)
/// </summary>
public sealed class Parcel
{
    public const int Srid = 4326;
    public const int VoivodeshipMaxLength = 64;

    /// <summary> Official TERYT parcel id [primary key] </summary>
    public ParcelIdVo Id { get; private set; }

    /// <summary> Voivodeship name, if ULDK returned it </summary>
    public string? Voivodeship { get; private set; }

    /// <summary> Parcel area in hectares </summary>
    public decimal AreaHa { get; private set; }

    /// <summary> Centroid for point-based weather and soil requests </summary>
    public Point Centroid { get; private set; } = null!;

    /// <summary> Parcel boundaries polygon (SRID 4326) </summary>
    public MultiPolygon Geom { get; private set; } = null!;

    /// <summary> When the geometry was fetched from ULDK </summary>
    public DateTimeOffset FetchedAt { get; private set; }

    #region References

    public ParcelStaticProfile? StaticProfile { get; private set; }
    public ICollection<DynamicObservation> Observations { get; private set; } = new List<DynamicObservation>();
    public ICollection<SavedReport> Reports { get; private set; } = new List<SavedReport>();

    #endregion

    private Parcel() { }

    public static Result<Parcel> Create(string id, string? voivodeship, decimal areaHa, MultiPolygon geom,
        DateTimeOffset fetchedAt)
    {
        var idResult = ParcelIdVo.Create(id);
        if (idResult.IsFailure)
            return idResult.Errors;

        var parcel = new Parcel { Id = idResult.Value };
        var updateResult = parcel.UpdateGeometry(voivodeship, areaHa, geom, fetchedAt);
        if (updateResult.IsFailure)
            return updateResult.Errors;

        return parcel;
    }

    /// <summary> Replaces boundaries after a fresh ULDK fetch; centroid is recalculated </summary>
    public Result UpdateGeometry(string? voivodeship, decimal areaHa, MultiPolygon geom, DateTimeOffset fetchedAt)
    {
        voivodeship = string.IsNullOrWhiteSpace(voivodeship) ? null : voivodeship.Trim();
        if (voivodeship?.Length > VoivodeshipMaxLength)
            return ResultError.Validation(DomainErrorCodes.Entities.Parcel.VoivodeshipMaxLength, VoivodeshipMaxLength);

        if (areaHa <= 0)
            return ResultError.Validation(DomainErrorCodes.Entities.Parcel.InvalidArea);

        if (geom is null || geom.IsEmpty)
            return ResultError.Validation(DomainErrorCodes.Entities.Parcel.EmptyGeometry);
        if (geom.SRID != Srid)
            return ResultError.Validation(DomainErrorCodes.Entities.Parcel.InvalidSrid, Srid);

        var centroid = geom.Centroid;
        centroid.SRID = Srid;

        Voivodeship = voivodeship;
        AreaHa = areaHa;
        Geom = geom;
        Centroid = centroid;
        FetchedAt = fetchedAt;
        return Result.Success();
    }
}
