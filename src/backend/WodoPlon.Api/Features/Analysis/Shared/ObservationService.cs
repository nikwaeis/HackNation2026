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
/// Also fills the parcel relief on its first analysis
/// </summary>
public sealed class ObservationService(
    AppDbContext db,
    IOpenMeteoClient openMeteo,
    IPythonServiceClient geoWorker,
    TimeProvider timeProvider,
    ILogger<ObservationService> logger)
{
    private const int IndexDecimals = 4;
    private static readonly SatelliteData NoSatellite = new(SatelliteStatus.NoData);

    private readonly AppDbContext _db = db;
    private readonly IOpenMeteoClient _openMeteo = openMeteo;
    private readonly IPythonServiceClient _geoWorker = geoWorker;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly ILogger<ObservationService> _logger = logger;

    /// <param name="parcel"> Tracked parcel with its static profile, as returned by <see cref="ParcelProfileService"/> </param>
    public async Task<Result<DynamicObservation>> GetOrCreateAsync(Parcel parcel, DateOnly targetDate,
        CancellationToken cancellationToken = default)
    {
        if (await FindAsync(parcel.Id, targetDate, cancellationToken) is { } cached)
            return cached;

        DateTimeOffset now = _timeProvider.GetUtcNow();
        var today = DateOnly.FromDateTime(now.UtcDateTime);
        var profile = parcel.StaticProfile;
        bool needTerrain = profile?.MeanSlopeDeg is null;

        // archive rejects end dates in the future
        var weatherTask = _openMeteo.GetDailyAsync(parcel.Centroid.Y, parcel.Centroid.X,
            WeatherAggregates.FetchFrom(targetDate), targetDate < today ? targetDate : today, cancellationToken);
        var geoTask = _geoWorker.ExtractGeoAsync(parcel.Id, targetDate, needTerrain, parcel.Geom, cancellationToken);
        await Task.WhenAll(weatherTask, geoTask);

        var weatherResult = weatherTask.Result;
        if (weatherResult.IsFailure)
            return weatherResult.Errors;
        if (WeatherAggregates.From(weatherResult.Value!, targetDate) is not { } meteo)
            return ResultError.Failure(ExternalApiErrorCodes.WeatherUnavailable);

        var geo = geoTask.Result;
        if (needTerrain && profile is not null && geo?.MeanSlopeDeg is not null)
        {
            var reliefResult = profile.UpdateRelief(new ReliefData(geo.MeanSlopeDeg, geo.MaxSlopeDeg, geo.SteepAreaPct), now);
            if (reliefResult.IsFailure)
                _logger.LogWarning("Geo-worker relief rejected for {ParcelId}: {Code}", parcel.Id.Value, reliefResult.Errors[0].Code);
        }

        var observationResult = DynamicObservation.Create(parcel.Id, targetDate, meteo, ToSatellite(geo), now);
        if (observationResult.IsFailure)
        {
            // inconsistent satellite answer must not block the analysis, weather and soil are enough
            _logger.LogWarning("Geo-worker satellite data rejected for {ParcelId}: {Code}",
                parcel.Id.Value, observationResult.Errors[0].Code);
            observationResult = DynamicObservation.Create(parcel.Id, targetDate, meteo, NoSatellite, now);
            if (observationResult.IsFailure)
                return observationResult.Errors;
        }

        _db.DynamicObservations.Add(observationResult.Value!);
        try
        {
            await _db.SaveChangesAsync(cancellationToken);
            return observationResult.Value!;
        }
        // the same parcel and date was analysed twice at once, the other request has cached it
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            _db.ChangeTracker.Clear();
            return (await FindAsync(parcel.Id, targetDate, cancellationToken))!;
        }
    }

    private Task<DynamicObservation?> FindAsync(ParcelIdVo parcelId, DateOnly targetDate, CancellationToken cancellationToken) =>
        _db.DynamicObservations.FirstOrDefaultAsync(o => o.ParcelId == parcelId && o.TargetDate == targetDate, cancellationToken);

    private static SatelliteData ToSatellite(GeoMetrics? geo) =>
        geo is null || geo.SatelliteStatus == SatelliteStatus.NoData
            ? NoSatellite
            : new SatelliteData(geo.SatelliteStatus, Round(geo.NdviMean), Round(geo.NdwiMean), geo.SatelliteSceneDate, geo.CloudCoverPct);

    private static decimal? Round(decimal? index) => index is null ? null : Math.Round(index.Value, IndexDecimals);
}
