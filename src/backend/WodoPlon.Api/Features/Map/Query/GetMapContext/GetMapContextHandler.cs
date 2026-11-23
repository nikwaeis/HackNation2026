using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Data;
using WodoPlon.Api.Features.Analysis.Shared;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Enums;
using WodoPlon.Domain.Results;

namespace WodoPlon.Api.Features.Map.Query.GetMapContext;

/// <summary> WGS 84 bounding box, degrees </summary>
public sealed record GeoBox(double South, double West, double North, double East);

/// <summary> Waterway line: Kind is river (rivers, streams, canals) or ditch (ditches, drains); points are [lat, lon] </summary>
public sealed record MapWaterLine(long Id, string Kind, string? Name, double[][] Line);

/// <summary>
/// WaterSource is "osm-import" when the lines come from the local import; null when there is no import yet, and the
/// map then asks OpenStreetMap itself
/// </summary>
public sealed record MapContextResponse(MapWaterLine[] Water, string? WaterSource);

/// <summary>
/// Ditches and streams for the visible map area from the local OSM import in PostGIS: milliseconds, no rate limits,
/// so the browser does not have to query the public Overpass API for them
/// </summary>
public sealed class GetMapContextHandler(AppDbContext db, WaterLookupService waterLookup)
    : IQueryHandler<GetMapContextQuery, MapContextResponse>
{
    public const string SourceLocalImport = "osm-import";
    private const int MaxWaterLines = 4000;

    private static readonly GeometryFactory Factory = new(new PrecisionModel(), Parcel.Srid);

    private readonly AppDbContext _db = db;
    private readonly WaterLookupService _waterLookup = waterLookup;

    public async Task<Result<MapContextResponse>> HandleAsync(GetMapContextQuery query,
        CancellationToken cancellationToken = default)
    {
        if (await _waterLookup.LocalWaterDateAsync(cancellationToken) is null)
            return new MapContextResponse([], null);

        var box = ClampToPoland(new GeoBox(query.South!.Value, query.West!.Value, query.North!.Value, query.East!.Value));
        return new MapContextResponse(await LocalWaterAsync(box, cancellationToken), SourceLocalImport);
    }

    public static GeoBox ClampToPoland(GeoBox box) => new(
        Math.Max(box.South, GetMapContextQueryValidator.MinLat),
        Math.Max(box.West, GetMapContextQueryValidator.MinLon),
        Math.Min(box.North, GetMapContextQueryValidator.MaxLat),
        Math.Min(box.East, GetMapContextQueryValidator.MaxLon));

    private async Task<MapWaterLine[]> LocalWaterAsync(GeoBox box, CancellationToken cancellationToken)
    {
        var area = Factory.ToGeometry(new Envelope(box.West, box.East, box.South, box.North));
        var rows = await _db.HydroFeatures
            .AsNoTracking()
            .Where(h => (h.Type == HydroFeatureType.River || h.Type == HydroFeatureType.Ditch) && h.Geom.Intersects(area))
            .OrderBy(h => h.Id)
            .Take(MaxWaterLines)
            .Select(h => new { h.Id, h.OsmId, h.Type, h.Name, h.Geom })
            .ToListAsync(cancellationToken);

        return rows
            .SelectMany(r =>
            {
                var lines = Lines(r.Geom);
                long id = r.OsmId ?? -r.Id;
                string kind = r.Type == HydroFeatureType.River ? "river" : "ditch";
                return lines.Select((line, i) => new MapWaterLine(lines.Length == 1 ? id : id * 100 + i, kind, r.Name,
                    line.Coordinates.Select(c => new[] { Math.Round(c.Y, 6), Math.Round(c.X, 6) }).ToArray()));
            })
            .ToArray();
    }

    private static LineString[] Lines(Geometry geom) => geom switch
    {
        LineString line => [line],
        MultiLineString multi => multi.Geometries.OfType<LineString>().ToArray(),
        _ => []
    };
}
