using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using Npgsql;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Data;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Enums;
using WodoPlon.Domain.Results;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Api.Features.Analysis.Shared;

/// <summary>
/// Step 0: finds the parcel with its static profile; first use fetches ULDK, SoilGrids and Overpass and caches them forever
/// </summary>
public sealed class ParcelProfileService(
    AppDbContext db,
    IUldkClient uldk,
    ISoilGridsClient soilGrids,
    IOverpassClient overpass,
    TimeProvider timeProvider)
{
    public const int HydroSearchRadiusM = 1000;
    /// <summary> Bounding box margin (≈1.3 km at Polish latitudes) so the GIST index prefilters before geography math </summary>
    private const double HydroSearchBoxDeg = 0.02;

    // relief comes from the geo-worker together with satellite data (part 3)
    private static readonly ReliefData NoRelief = new(null, null, null);

    private readonly AppDbContext _db = db;
    private readonly IUldkClient _uldk = uldk;
    private readonly ISoilGridsClient _soilGrids = soilGrids;
    private readonly IOverpassClient _overpass = overpass;
    private readonly TimeProvider _timeProvider = timeProvider;

    public async Task<Result<Parcel>> ResolveByIdAsync(string dzialkaId, CancellationToken cancellationToken = default)
    {
        var idResult = ParcelIdVo.Create(dzialkaId);
        if (idResult.IsFailure)
            return idResult.Errors;

        if (await FindAsync(idResult.Value, cancellationToken) is { } cached)
            return cached;

        var uldkResult = await _uldk.GetByIdAsync(idResult.Value, cancellationToken);
        if (uldkResult.IsFailure)
            return uldkResult.Errors;

        return await CreateAsync(uldkResult.Value!, cancellationToken);
    }

    public async Task<Result<Parcel>> ResolveByPointAsync(double lat, double lon, CancellationToken cancellationToken = default)
    {
        // the point has to go through ULDK anyway to learn the parcel id
        var uldkResult = await _uldk.GetByPointAsync(lat, lon, cancellationToken);
        if (uldkResult.IsFailure)
            return uldkResult.Errors;

        if (await FindAsync(uldkResult.Value!.ParcelId, cancellationToken) is { } cached)
            return cached;

        return await CreateAsync(uldkResult.Value, cancellationToken);
    }

    private Task<Parcel?> FindAsync(ParcelIdVo id, CancellationToken cancellationToken) =>
        _db.Parcels
            .Include(p => p.StaticProfile)
            .FirstOrDefaultAsync(p => p.Id == id, cancellationToken);

    private async Task<Result<Parcel>> CreateAsync(UldkParcel source, CancellationToken cancellationToken)
    {
        DateTimeOffset now = _timeProvider.GetUtcNow();

        decimal areaHa = await AreaHaAsync(source.Geom, cancellationToken);
        var parcelResult = Parcel.Create(source.ParcelId.Value, source.Voivodeship, areaHa, source.Geom, now);
        if (parcelResult.IsFailure)
            return parcelResult.Errors;
        var parcel = parcelResult.Value!;

        double lat = parcel.Centroid.Y, lon = parcel.Centroid.X;
        var soilTask = _soilGrids.GetTopsoilAsync(lat, lon, cancellationToken);
        var hydroTask = _overpass.GetHydroAroundAsync(lat, lon, HydroSearchRadiusM, cancellationToken);
        await Task.WhenAll(soilTask, hydroTask);

        // shortcut: Overpass down means water stays unknown in the forever cache, add a refresh if that shows up on tests
        if (hydroTask.Result is { Length: > 0 } features)
            await SaveHydroAsync(features, cancellationToken);
        var water = await NearestWaterAsync(parcel.Geom, cancellationToken);

        var profileResult = ParcelStaticProfile.Create(parcel.Id, NoRelief, SoilAwc.From(soilTask.Result), water, now);
        if (profileResult.IsFailure)
            return profileResult.Errors;

        _db.Parcels.Add(parcel);
        _db.ParcelStaticProfiles.Add(profileResult.Value!);
        try
        {
            await _db.SaveChangesAsync(cancellationToken);
            return parcel;
        }
        // two first requests for the same parcel raced, the other one has already cached it
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            _db.ChangeTracker.Clear();
            return (await FindAsync(parcel.Id, cancellationToken))!;
        }
    }

    private Task<decimal> AreaHaAsync(MultiPolygon geom, CancellationToken cancellationToken) =>
        _db.Database
            .SqlQuery<decimal>($"""SELECT (ST_Area({geom}::geography) / 10000)::numeric(10,4) AS "Value" """)
            .SingleAsync(cancellationToken);

    /// <summary> Stores Overpass ways not yet known by OSM id; neighbouring parcels share most of them </summary>
    private async Task SaveHydroAsync(HydroFeatureData[] features, CancellationToken cancellationToken)
    {
        var osmIds = features.Select(f => f.OsmId).ToArray();
        var known = await _db.HydroFeatures
            .Where(h => h.OsmId != null && osmIds.Contains(h.OsmId.Value))
            .Select(h => h.OsmId!.Value)
            .ToListAsync(cancellationToken);

        var fresh = features
            .Where(f => !known.Contains(f.OsmId))
            .DistinctBy(f => f.OsmId)
            .Select(f => HydroFeature.Create(f.Type, f.Name, f.Geom, f.OsmId))
            .Where(r => r.IsSuccess)
            .Select(r => r.Value!)
            .ToList();
        if (fresh.Count == 0)
            return;

        _db.HydroFeatures.AddRange(fresh);
        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        // a neighbouring parcel stored the same ways at the same moment, theirs are just as good
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            _db.ChangeTracker.Clear();
        }
    }

    private async Task<WaterData> NearestWaterAsync(MultiPolygon geom, CancellationToken cancellationToken)
    {
        var nearest = await _db.Database
            .SqlQuery<NearestWaterRow>($"""
                SELECT h.feature_type AS "Type",
                       ST_Distance(h.geom::geography, {geom}::geography)::numeric(10,2) AS "DistM"
                FROM hydro_features h
                WHERE h.geom && ST_Expand({geom}, {HydroSearchBoxDeg})
                  AND ST_DWithin(h.geom::geography, {geom}::geography, {HydroSearchRadiusM})
                ORDER BY 2
                LIMIT 1
                """)
            .FirstOrDefaultAsync(cancellationToken);

        return nearest is null
            ? new WaterData(null, null)
            : new WaterData(nearest.DistM, Enum.Parse<HydroFeatureType>(nearest.Type));
    }

    private sealed class NearestWaterRow
    {
        public string Type { get; init; } = null!;
        public decimal DistM { get; init; }
    }
}
