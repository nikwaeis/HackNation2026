using Microsoft.EntityFrameworkCore;
using Npgsql;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Common.Models;
using WodoPlon.Api.Data;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Enums;
using WodoPlon.Domain.Results;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Api.Features.Analysis.Shared;

/// <summary>
/// Weather and satellite data for (parcel, target date): first request goes live in parallel, repeated ones read the cache.
/// Satellite failures (<see cref="SatelliteStatus.Error"/>) and missing relief are asked again on later requests
/// </summary>
public sealed class ObservationService(
    AppDbContext db,
    IOpenMeteoClient openMeteo,
    IPythonServiceClient geoWorker,
    FetchCoalescer coalescer,
    TimeProvider timeProvider,
    ILogger<ObservationService> logger)
{
    private const int IndexDecimals = 4;
    private static readonly SatelliteData NoSatellite = new(SatelliteStatus.NoData);
    private static readonly SatelliteData SatelliteFailed = new(SatelliteStatus.Error);

    private readonly AppDbContext _db = db;
    private readonly IOpenMeteoClient _openMeteo = openMeteo;
    private readonly IPythonServiceClient _geoWorker = geoWorker;
    private readonly FetchCoalescer _coalescer = coalescer;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly ILogger<ObservationService> _logger = logger;

    /// <param name="parcel"> Tracked parcel with its static profile, as returned by <see cref="ParcelProfileService"/> </param>
    public async Task<Result<DynamicObservation>> GetOrCreateAsync(Parcel parcel, DateOnly targetDate,
        CancellationToken cancellationToken = default)
    {
        var cached = await FindAsync(parcel.Id, targetDate, cancellationToken);
        if (cached is not null && !NeedsGeo(parcel, cached))
            return cached;

        // one live fetch per (parcel, date); a success marker also throttles geo retries to one per minute
        var fetched = await _coalescer.RunAsync($"obs:{parcel.Id.Value}:{targetDate:yyyy-MM-dd}",
            (services, token) => services.GetRequiredService<ObservationService>().FetchAsync(parcel.Id, targetDate, token),
            cancellationToken);
        if (fetched.IsFailure)
            return cached is not null ? cached : fetched.Errors;

        // the fetch ran in its own scope: pick up what it wrote
        if (parcel.StaticProfile is { } profile)
            await _db.Entry(profile).ReloadAsync(cancellationToken);
        if (cached is not null)
        {
            await _db.Entry(cached).ReloadAsync(cancellationToken);
            return cached;
        }

        return (await FindAsync(parcel.Id, targetDate, cancellationToken))!;
    }

    private static bool NeedsGeo(Parcel parcel, DynamicObservation observation) =>
        observation.SatelliteStatus == SatelliteStatus.Error || parcel.StaticProfile?.MeanSlopeDeg is null;

    /// <summary> Live part, runs once per (parcel, date) at a time (<see cref="FetchCoalescer"/>) </summary>
    private async Task<Result> FetchAsync(ParcelIdVo parcelId, DateOnly targetDate, CancellationToken cancellationToken)
    {
        var parcel = await _db.Parcels.Include(p => p.StaticProfile).FirstAsync(p => p.Id == parcelId, cancellationToken);
        var existing = await FindAsync(parcelId, targetDate, cancellationToken);

        DateTimeOffset now = _timeProvider.GetUtcNow();
        var today = DateOnly.FromDateTime(now.UtcDateTime);
        var profile = parcel.StaticProfile;
        bool needTerrain = profile?.MeanSlopeDeg is null;

        // weather is cached for good once fetched; archive rejects end dates in the future
        var weatherTask = existing is null
            ? _openMeteo.GetDailyAsync(parcel.Centroid.Y, parcel.Centroid.X,
                WeatherAggregates.FetchFrom(targetDate), targetDate < today ? targetDate : today, cancellationToken)
            : null;
        var geoTask = _geoWorker.ExtractGeoAsync(parcel.Id, targetDate, needTerrain, parcel.Geom, cancellationToken);
        await Task.WhenAll(weatherTask ?? Task.CompletedTask, geoTask);

        MeteoData? meteo = null;
        if (weatherTask is not null)
        {
            var weatherResult = weatherTask.Result;
            if (weatherResult.IsFailure)
                return weatherResult.Errors;
            meteo = WeatherAggregates.From(weatherResult.Value!, targetDate);
            if (meteo is null)
                return ResultError.Failure(ExternalApiErrorCodes.WeatherUnavailable);
        }

        var geo = geoTask.Result;
        if (needTerrain && profile is not null && geo?.MeanSlopeDeg is not null)
        {
            var reliefResult = profile.UpdateRelief(new ReliefData(geo.MeanSlopeDeg, geo.MaxSlopeDeg, geo.SteepAreaPct), now);
            if (reliefResult.IsFailure)
                _logger.LogWarning("Geo-worker relief rejected for {ParcelId}: {Code}", parcelId.Value, reliefResult.Errors[0].Code);
        }

        var satellite = ToSatellite(geo);
        if (existing is not null)
        {
            // never trade a good cached scene for a failed retry
            if (existing.SatelliteStatus == SatelliteStatus.Error && satellite.Status != SatelliteStatus.Error)
                UpdateSatellite(existing, satellite, now);
            await _db.SaveChangesAsync(cancellationToken);
            return Result.Success();
        }

        var observationResult = DynamicObservation.Create(parcelId, targetDate, meteo!, satellite, now);
        if (observationResult.IsFailure)
        {
            // inconsistent satellite answer must not block the analysis, weather and soil are enough
            _logger.LogWarning("Geo-worker satellite data rejected for {ParcelId}: {Code}",
                parcelId.Value, observationResult.Errors[0].Code);
            observationResult = DynamicObservation.Create(parcelId, targetDate, meteo!, NoSatellite, now);
            if (observationResult.IsFailure)
                return observationResult.Errors;
        }

        _db.DynamicObservations.Add(observationResult.Value!);
        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        // another API instance cached the same parcel and date at the same moment
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            _db.ChangeTracker.Clear();
        }

        return Result.Success();
    }

    private void UpdateSatellite(DynamicObservation observation, SatelliteData satellite, DateTimeOffset now)
    {
        var result = observation.UpdateSatellite(satellite, now);
        if (result.IsFailure)
        {
            _logger.LogWarning("Geo-worker satellite data rejected for {ParcelId}: {Code}",
                observation.ParcelId.Value, result.Errors[0].Code);
            observation.UpdateSatellite(NoSatellite, now);
        }
    }

    private Task<DynamicObservation?> FindAsync(ParcelIdVo parcelId, DateOnly targetDate, CancellationToken cancellationToken) =>
        _db.DynamicObservations.FirstOrDefaultAsync(o => o.ParcelId == parcelId && o.TargetDate == targetDate, cancellationToken);

    private static SatelliteData ToSatellite(GeoMetrics? geo) => geo switch
    {
        null or { SatelliteStatus: SatelliteStatus.Error } => SatelliteFailed,
        { SatelliteStatus: SatelliteStatus.NoData } => NoSatellite,
        _ => new SatelliteData(geo.SatelliteStatus, Round(geo.NdviMean), Round(geo.NdwiMean), geo.SatelliteSceneDate, geo.CloudCoverPct)
    };

    private static decimal? Round(decimal? index) => index is null ? null : Math.Round(index.Value, IndexDecimals);
}
