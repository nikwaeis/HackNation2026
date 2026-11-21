using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;
using NetTopologySuite.Geometries;
using Npgsql;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Data;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Enums;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Api.Features.Analysis.Shared;

/// <summary>
/// Nearest river / ditch / lake for a parcel by ST_Distance over hydro_features. Primary source: all Polish OSM water
/// imported once (scripts/import-osm-water.sh) → synchronous, in the first report. Without the import Overpass is
/// asked in the background (<see cref="HydroBackgroundService"/>)
/// </summary>
public sealed class WaterLookupService(
    AppDbContext db,
    IOverpassClient overpass,
    HybridCache cache,
    TimeProvider timeProvider,
    ILogger<WaterLookupService> logger)
{
    public const int HydroSearchRadiusM = 1000;
    /// <summary> data_imports row written by scripts/import-osm-water.sh </summary>
    public const string LocalImportName = "osm_water";

    private static readonly HybridCacheEntryOptions ImportCacheOptions = new()
    {
        Expiration = TimeSpan.FromMinutes(2),
        LocalCacheExpiration = TimeSpan.FromMinutes(2)
    };
    /// <summary> Bounding box margin (≈1.3 km at Polish latitudes) so the GIST index prefilters before geography math </summary>
    private const double HydroSearchBoxDeg = 0.02;

    private readonly AppDbContext _db = db;
    private readonly IOverpassClient _overpass = overpass;
    private readonly HybridCache _cache = cache;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly ILogger<WaterLookupService> _logger = logger;

    /// <summary> OSM data date of the local import; null when the import was never run </summary>
    public async Task<DateOnly?> LocalWaterDateAsync(CancellationToken cancellationToken = default)
    {
        string key = $"data_imports:{LocalImportName}";
        var date = await _cache.GetOrCreateAsync(key, async token =>
            await _db.Database
                .SqlQuery<DateOnly>($"SELECT source_date AS \"Value\" FROM data_imports WHERE name = {LocalImportName}")
                .Select(d => (DateOnly?)d)
                .FirstOrDefaultAsync(token),
            ImportCacheOptions, cancellationToken: cancellationToken);

        // "no import yet" is not cached: a finished import is picked up by the very next request
        if (date is null)
            await _cache.RemoveAsync(key, CancellationToken.None);
        return date;
    }

    /// <summary> Sets nearest water from the local import (milliseconds); caller saves the profile </summary>
    public async Task ApplyLocalAsync(ParcelStaticProfile profile, MultiPolygon geom, DateOnly dataDate,
        CancellationToken cancellationToken = default)
    {
        var result = profile.UpdateWater(await NearestWaterAsync(geom, cancellationToken), _timeProvider.GetUtcNow(), dataDate);
        if (result.IsFailure)
            _logger.LogWarning("Nearest water rejected for {ParcelId}: {Code}", profile.ParcelId.Value, result.Errors[0].Code);
    }

    /// <summary> Fills nearest water of a profile not checked yet; Overpass down leaves it unchecked for a later retry </summary>
    public async Task FillAsync(ParcelIdVo parcelId, CancellationToken cancellationToken = default)
    {
        var profile = await _db.ParcelStaticProfiles
            .Include(p => p.Parcel)
            .FirstOrDefaultAsync(p => p.ParcelId == parcelId, cancellationToken);
        if (profile is null || profile.WaterCheckedAt is not null)
            return;

        var centroid = profile.Parcel.Centroid;
        var features = await _overpass.GetHydroAroundAsync(centroid.Y, centroid.X, HydroSearchRadiusM, cancellationToken);
        if (features is null)
        {
            _logger.LogWarning("Overpass unavailable, water of {ParcelId} stays unchecked until the next analysis", parcelId.Value);
            return;
        }

        if (features.Length > 0)
            await SaveHydroAsync(features, cancellationToken);

        var water = await NearestWaterAsync(profile.Parcel.Geom, cancellationToken);
        var now = _timeProvider.GetUtcNow();
        var result = profile.UpdateWater(water, now, DateOnly.FromDateTime(now.UtcDateTime));
        if (result.IsFailure)
        {
            _logger.LogWarning("Nearest water rejected for {ParcelId}: {Code}", parcelId.Value, result.Errors[0].Code);
            return;
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

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
            foreach (var entry in _db.ChangeTracker.Entries<HydroFeature>().ToList())
                entry.State = EntityState.Detached;
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
