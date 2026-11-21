using WodoPlon.Domain.Enums;
using WodoPlon.Domain.Results;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Domain.Entities;

/// <summary>
/// Static natural profile of a parcel: relief (Geoportal NMT), soil 0–30 cm (SoilGrids), nearest water (PostGIS).
/// Cached forever, one row per parcel
/// </summary>
public sealed class ParcelStaticProfile
{
    public const decimal SlopeLimitDeg = 90m;
    /// <summary> SoilGrids fractions are rounded, allow small overflow </summary>
    public const decimal SoilFractionsTolerance = 100.5m;
    /// <summary> Steep share above which surface runoff becomes a real risk </summary>
    public const decimal RunoffRiskSteepPct = 20m;

    /// <summary> Parcel id [primary key, FK → parcels] </summary>
    public ParcelIdVo ParcelId { get; private set; }

    /// <summary> Mean surface slope, degrees </summary>
    public decimal? MeanSlopeDeg { get; private set; }

    /// <summary> Max surface slope, degrees </summary>
    public decimal? MaxSlopeDeg { get; private set; }

    /// <summary> Share of parcel area with slope above 3° </summary>
    public PercentVo? SteepAreaPct { get; private set; }

    /// <summary> Sand content, % </summary>
    public PercentVo? SandPct { get; private set; }

    /// <summary> Clay content, % </summary>
    public PercentVo? ClayPct { get; private set; }

    /// <summary> Silt content, % </summary>
    public PercentVo? SiltPct { get; private set; }

    /// <summary> Organic carbon, g/kg </summary>
    public decimal? OrganicCarbonGKg { get; private set; }

    /// <summary> Available water capacity, mm per meter of soil </summary>
    public decimal? AwcMmPerM { get; private set; }

    /// <summary> Soil drought vulnerability category </summary>
    public SoilDroughtVulnerability? SoilDroughtVulnerability { get; private set; }

    /// <summary> Distance to the nearest water object, meters </summary>
    public decimal? NearestWaterDistM { get; private set; }

    /// <summary> Type of the nearest water object </summary>
    public HydroFeatureType? NearestWaterType { get; private set; }

    /// <summary> When the profile was built </summary>
    public DateTimeOffset FetchedAt { get; private set; }

    #region References

    public Parcel Parcel { get; private set; } = null!;

    #endregion

    private ParcelStaticProfile() { }

    public static Result<ParcelStaticProfile> Create(ParcelIdVo parcelId, ReliefData relief, SoilData soil,
        WaterData water, DateTimeOffset fetchedAt)
    {
        var profile = new ParcelStaticProfile { ParcelId = parcelId };
        var refreshResult = profile.Refresh(relief, soil, water, fetchedAt);
        if (refreshResult.IsFailure)
            return refreshResult.Errors;

        return profile;
    }

    /// <summary> Overwrites all characteristics with freshly fetched data </summary>
    public Result Refresh(ReliefData relief, SoilData soil, WaterData water, DateTimeOffset fetchedAt)
    {
        if (IsOutOfSlopeRange(relief.MeanSlopeDeg) || IsOutOfSlopeRange(relief.MaxSlopeDeg))
            return ResultError.Validation(DomainErrorCodes.Entities.ParcelStaticProfile.SlopeOutOfRange, 0, SlopeLimitDeg);
        if (relief.MeanSlopeDeg > relief.MaxSlopeDeg)
            return ResultError.Validation(DomainErrorCodes.Entities.ParcelStaticProfile.MeanSlopeExceedsMax);

        var steep = PercentVo.CreateOptional(relief.SteepAreaPct);
        var sand = PercentVo.CreateOptional(soil.SandPct);
        var clay = PercentVo.CreateOptional(soil.ClayPct);
        var silt = PercentVo.CreateOptional(soil.SiltPct);
        foreach (var result in new[] { steep, sand, clay, silt })
            if (result.IsFailure)
                return result.Errors;

        if ((soil.SandPct ?? 0) + (soil.ClayPct ?? 0) + (soil.SiltPct ?? 0) > SoilFractionsTolerance)
            return ResultError.Validation(DomainErrorCodes.Entities.ParcelStaticProfile.SoilFractionsExceedTotal);

        if (soil.OrganicCarbonGKg < 0 || soil.AwcMmPerM < 0 || water.NearestDistM < 0)
            return ResultError.Validation(DomainErrorCodes.Entities.ParcelStaticProfile.NegativeValue);

        MeanSlopeDeg = relief.MeanSlopeDeg;
        MaxSlopeDeg = relief.MaxSlopeDeg;
        SteepAreaPct = steep.Value;
        SandPct = sand.Value;
        ClayPct = clay.Value;
        SiltPct = silt.Value;
        OrganicCarbonGKg = soil.OrganicCarbonGKg;
        AwcMmPerM = soil.AwcMmPerM;
        SoilDroughtVulnerability = soil.Vulnerability;
        NearestWaterDistM = water.NearestDistM;
        NearestWaterType = water.NearestType;
        FetchedAt = fetchedAt;
        return Result.Success();
    }

    /// <summary> Large steep share means rain runs off instead of soaking in </summary>
    public bool HasRunoffRisk => SteepAreaPct?.Value > RunoffRiskSteepPct;

    private static bool IsOutOfSlopeRange(decimal? slope) => slope is < 0 or > SlopeLimitDeg;
}

/// <summary> Relief metrics from Geoportal NMT (Python worker) </summary>
public sealed record ReliefData(decimal? MeanSlopeDeg, decimal? MaxSlopeDeg, decimal? SteepAreaPct);

/// <summary> Soil metrics from ISRIC SoilGrids, layer 0–30 cm </summary>
public sealed record SoilData(decimal? SandPct, decimal? ClayPct, decimal? SiltPct, decimal? OrganicCarbonGKg,
    decimal? AwcMmPerM, SoilDroughtVulnerability? Vulnerability);

/// <summary> Nearest water object from PostGIS ST_Distance </summary>
public sealed record WaterData(decimal? NearestDistM, HydroFeatureType? NearestType);
