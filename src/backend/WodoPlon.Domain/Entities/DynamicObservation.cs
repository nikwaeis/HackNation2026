using WodoPlon.Domain.Enums;
using WodoPlon.Domain.Results;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Domain.Entities;

/// <summary>
/// Weather aggregates (Open-Meteo, 10 years) and Sentinel-2 indices for a (parcel, target date) pair.
/// First request goes live, repeated ones read this cache
/// </summary>
public sealed class DynamicObservation
{
    public const int HistoryYears = 10;
    public const int SatelliteWindowDays = 15;

    /// <summary> Database generated id </summary>
    public long Id { get; private set; }

    /// <summary> Parcel id [unique together with TargetDate] </summary>
    public ParcelIdVo ParcelId { get; private set; }

    /// <summary> Analysis date chosen by the user </summary>
    public DateOnly TargetDate { get; private set; }

    #region Meteorology

    /// <summary> Precipitation sum for 30 days before target date, mm </summary>
    public decimal? Precip30dMm { get; private set; }

    /// <summary> Precipitation sum for 90 days before target date, mm </summary>
    public decimal? Precip90dMm { get; private set; }

    /// <summary> 10-year climatic norm for the same 90-day period, mm </summary>
    public decimal? Precip10yrAvg90dMm { get; private set; }

    /// <summary> Reference evapotranspiration sum for 90 days, mm </summary>
    public decimal? Et090dMm { get; private set; }

    /// <summary> Longest run of days with precipitation below 1 mm </summary>
    public int? DrySpellDays { get; private set; }

    /// <summary>
    /// P and ET0 per calendar month inside the 90-day window, for this year and each of the 10 previous ones.
    /// Kc depends only on the month, so crop water need is computed from these for any crop without refetching
    /// </summary>
    public IReadOnlyList<WeatherMonth> WindowMonths { get; private set; } = [];

    #endregion

    #region Satellite

    /// <summary> Mean NDVI over the parcel polygon (-1..1) </summary>
    public decimal? NdviMean { get; private set; }

    /// <summary> Mean NDWI over the parcel polygon (-1..1) </summary>
    public decimal? NdwiMean { get; private set; }

    /// <summary> Date of the used Sentinel-2 scene </summary>
    public DateOnly? SatelliteSceneDate { get; private set; }

    /// <summary> Cloud cover over the parcel, % </summary>
    public PercentVo? CloudCoverPct { get; private set; }

    /// <summary> Satellite data quality; shown in the report limitations block </summary>
    public SatelliteStatus SatelliteStatus { get; private set; }

    #endregion

    /// <summary> When data was fetched from external APIs </summary>
    public DateTimeOffset FetchedAt { get; private set; }

    #region References

    public Parcel Parcel { get; private set; } = null!;

    #endregion

    private DynamicObservation() { }

    public static Result<DynamicObservation> Create(ParcelIdVo parcelId, DateOnly targetDate, MeteoData meteo,
        SatelliteData satellite, DateTimeOffset fetchedAt)
    {
        if (new[] { meteo.Precip30dMm, meteo.Precip90dMm, meteo.Precip10yrAvg90dMm, meteo.Et090dMm }.Any(v => v < 0)
            || meteo.DrySpellDays < 0)
            return ResultError.Validation(DomainErrorCodes.Entities.DynamicObservation.NegativeValue);
        if (meteo.WindowMonths.Any(m => m.PrecipMm < 0 || m.Et0Mm < 0))
            return ResultError.Validation(DomainErrorCodes.Entities.DynamicObservation.NegativeValue);
        if (meteo.WindowMonths.Any(m => m.YearsBack is < 0 or > HistoryYears || m.Month is < 1 or > 12))
            return ResultError.Validation(DomainErrorCodes.Entities.DynamicObservation.InvalidWeatherMonth, 0, HistoryYears);

        var observation = new DynamicObservation
        {
            ParcelId = parcelId,
            TargetDate = targetDate,
            Precip30dMm = meteo.Precip30dMm,
            Precip90dMm = meteo.Precip90dMm,
            Precip10yrAvg90dMm = meteo.Precip10yrAvg90dMm,
            Et090dMm = meteo.Et090dMm,
            DrySpellDays = meteo.DrySpellDays,
            WindowMonths = meteo.WindowMonths,
            FetchedAt = fetchedAt
        };

        var satelliteResult = observation.UpdateSatellite(satellite, fetchedAt);
        if (satelliteResult.IsFailure)
            return satelliteResult.Errors;

        return observation;
    }

    /// <summary> Replaces satellite part, e.g. when a cloud-free scene appears later </summary>
    public Result UpdateSatellite(SatelliteData satellite, DateTimeOffset fetchedAt)
    {
        var hasAnyData = satellite.NdviMean is not null || satellite.NdwiMean is not null
            || satellite.SceneDate is not null || satellite.CloudCoverPct is not null;

        if (satellite.Status is SatelliteStatus.NoData or SatelliteStatus.Error)
        {
            // no scene → no indices, otherwise report would show numbers without a source
            if (hasAnyData)
                return ResultError.Validation(DomainErrorCodes.Entities.DynamicObservation.UnexpectedSatelliteData);
        }
        else
        {
            if (satellite.NdviMean is null || satellite.NdwiMean is null || satellite.SceneDate is null)
                return ResultError.Validation(DomainErrorCodes.Entities.DynamicObservation.MissingSatelliteData);
            if (satellite.NdviMean is < -1 or > 1 || satellite.NdwiMean is < -1 or > 1)
                return ResultError.Validation(DomainErrorCodes.Entities.DynamicObservation.IndexOutOfRange, -1, 1);
            var shiftDays = Math.Abs(satellite.SceneDate.Value.DayNumber - TargetDate.DayNumber);
            if (shiftDays > SatelliteWindowDays)
                return ResultError.Validation(DomainErrorCodes.Entities.DynamicObservation.SceneOutOfWindow, SatelliteWindowDays);
        }

        var cloudResult = PercentVo.CreateOptional(satellite.CloudCoverPct);
        if (cloudResult.IsFailure)
            return cloudResult.Errors;

        NdviMean = satellite.NdviMean;
        NdwiMean = satellite.NdwiMean;
        SatelliteSceneDate = satellite.SceneDate;
        CloudCoverPct = cloudResult.Value;
        SatelliteStatus = satellite.Status;
        FetchedAt = fetchedAt;
        return Result.Success();
    }

    /// <summary> Climatic water balance for 90 days (P − ET0), mm; negative = deficit </summary>
    public decimal? ClimaticWaterBalance90dMm => Precip90dMm - Et090dMm;

    /// <summary> 90-day precipitation vs 10-year norm, %; 100 = normal </summary>
    public decimal? Precip90dOfNormPct =>
        Precip90dMm is not null && Precip10yrAvg90dMm is > 0
            ? Math.Round(Precip90dMm.Value / Precip10yrAvg90dMm.Value * 100, 1)
            : null;
}

/// <summary> Open-Meteo aggregates </summary>
public sealed record MeteoData(decimal? Precip30dMm, decimal? Precip90dMm, decimal? Precip10yrAvg90dMm,
    decimal? Et090dMm, int? DrySpellDays, IReadOnlyList<WeatherMonth> WindowMonths);

/// <summary> Sums for one calendar month inside a 90-day window; YearsBack 0 = target year </summary>
public sealed record WeatherMonth(int YearsBack, int Month, decimal PrecipMm, decimal Et0Mm);

/// <summary> Sentinel-2 L2A result from the Python worker </summary>
public sealed record SatelliteData(SatelliteStatus Status, decimal? NdviMean = null, decimal? NdwiMean = null,
    DateOnly? SceneDate = null, decimal? CloudCoverPct = null);
