using System.Globalization;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using Npgsql;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Data;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Results;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Api.Features.Analysis.Shared;

/// <summary>
/// Step 0: finds the parcel with its static profile; first use fetches ULDK and SoilGrids and caches them forever.
/// Nearest water comes from the local OSM import right away, or later from <see cref="HydroBackgroundService"/> without it
/// </summary>
public sealed class ParcelProfileService(
    AppDbContext db,
    IUldkClient uldk,
    ISoilGridsClient soilGrids,
    FetchCoalescer coalescer,
    HydroLookupQueue hydroQueue,
    WaterLookupService water,
    TimeProvider timeProvider)
{
    // relief comes from the geo-worker together with satellite data, water from WaterLookupService
    private static readonly ReliefData NoRelief = new(null, null, null);
    private static readonly WaterData NoWater = new(null, null);

    private readonly AppDbContext _db = db;
    private readonly IUldkClient _uldk = uldk;
    private readonly ISoilGridsClient _soilGrids = soilGrids;
    private readonly FetchCoalescer _coalescer = coalescer;
    private readonly HydroLookupQueue _hydroQueue = hydroQueue;
    private readonly WaterLookupService _water = water;
    private readonly TimeProvider _timeProvider = timeProvider;

    public async Task<Result<Parcel>> ResolveByIdAsync(string dzialkaId, CancellationToken cancellationToken = default)
    {
        var idResult = ParcelIdVo.Create(dzialkaId);
        if (idResult.IsFailure)
            return idResult.Errors;

        return await ResolveAsync(idResult.Value, source: null, cancellationToken);
    }

    public async Task<Result<Parcel>> ResolveByPointAsync(double lat, double lon, CancellationToken cancellationToken = default)
    {
        // the point has to go through ULDK to learn the parcel id; clicks on the same spot (≈1 m) share one lookup
        var key = string.Create(CultureInfo.InvariantCulture, $"point:{lat:F5}:{lon:F5}");
        var located = await _coalescer.RunForValueAsync(key,
            (services, token) => services.GetRequiredService<ParcelProfileService>().LocateAsync(lat, lon, token),
            cancellationToken);
        if (located.IsFailure)
            return located.Errors;

        return await ResolveAsync(ParcelIdVo.Create(located.Value!).Value, source: null, cancellationToken);
    }

    /// <summary> ULDK point lookup, stores the parcel when new; returns its id </summary>
    private async Task<Result<string>> LocateAsync(double lat, double lon, CancellationToken cancellationToken)
    {
        var uldkResult = await _uldk.GetByPointAsync(lat, lon, cancellationToken);
        if (uldkResult.IsFailure)
            return uldkResult.Errors;

        var source = uldkResult.Value!;
        var created = await CreateAsync(source.ParcelId, source, cancellationToken);
        return created.IsFailure ? created.Errors : source.ParcelId.Value;
    }

    private async Task<Result<Parcel>> ResolveAsync(ParcelIdVo id, UldkParcel? source, CancellationToken cancellationToken)
    {
        if (await FindAsync(id, cancellationToken) is not { } parcel)
        {
            var created = await _coalescer.RunAsync($"parcel:{id.Value}",
                (services, token) => services.GetRequiredService<ParcelProfileService>().CreateAsync(id, source, token),
                cancellationToken);
            if (created.IsFailure)
                return created.Errors;

            parcel = (await FindAsync(id, cancellationToken))!;
        }

        // not looked up yet (old profile, import added later) or Overpass failed last time
        if (parcel.StaticProfile is { WaterCheckedAt: null } profile)
        {
            if (await _water.LocalWaterDateAsync(cancellationToken) is { } dataDate)
            {
                await _water.ApplyLocalAsync(profile, parcel.Geom, dataDate, cancellationToken);
                await _db.SaveChangesAsync(cancellationToken);
            }
            else
                _hydroQueue.Enqueue(parcel.Id);
        }

        return parcel;
    }

    private Task<Parcel?> FindAsync(ParcelIdVo id, CancellationToken cancellationToken) =>
        _db.Parcels
            .Include(p => p.StaticProfile)
            .FirstOrDefaultAsync(p => p.Id == id, cancellationToken);

    /// <summary> Fetches and stores parcel + profile; runs once per parcel id at a time (<see cref="FetchCoalescer"/>) </summary>
    private async Task<Result> CreateAsync(ParcelIdVo id, UldkParcel? source, CancellationToken cancellationToken)
    {
        // another API instance may have stored it meanwhile
        if (await _db.Parcels.AnyAsync(p => p.Id == id, cancellationToken))
            return Result.Success();

        if (source is null)
        {
            var uldkResult = await _uldk.GetByIdAsync(id, cancellationToken);
            if (uldkResult.IsFailure)
                return uldkResult.Errors;
            source = uldkResult.Value!;
        }

        DateTimeOffset now = _timeProvider.GetUtcNow();

        decimal areaHa = await AreaHaAsync(source.Geom, cancellationToken);
        var parcelResult = Parcel.Create(source.ParcelId.Value, source.Voivodeship, areaHa, source.Geom, now);
        if (parcelResult.IsFailure)
            return parcelResult.Errors;
        var parcel = parcelResult.Value!;

        var soil = await _soilGrids.GetTopsoilAsync(parcel.Centroid.Y, parcel.Centroid.X, cancellationToken);

        var profileResult = ParcelStaticProfile.Create(parcel.Id, NoRelief, SoilAwc.From(soil), NoWater, now);
        if (profileResult.IsFailure)
            return profileResult.Errors;

        // local OSM import: nearest water is ready for the first report
        if (await _water.LocalWaterDateAsync(cancellationToken) is { } dataDate)
            await _water.ApplyLocalAsync(profileResult.Value!, parcel.Geom, dataDate, cancellationToken);

        _db.Parcels.Add(parcel);
        _db.ParcelStaticProfiles.Add(profileResult.Value!);
        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        // another API instance stored the same parcel at the same moment
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            _db.ChangeTracker.Clear();
        }

        return Result.Success();
    }

    private Task<decimal> AreaHaAsync(MultiPolygon geom, CancellationToken cancellationToken) =>
        _db.Database
            .SqlQuery<decimal>($"""SELECT (ST_Area({geom}::geography) / 10000)::numeric(10,4) AS "Value" """)
            .SingleAsync(cancellationToken);
}
