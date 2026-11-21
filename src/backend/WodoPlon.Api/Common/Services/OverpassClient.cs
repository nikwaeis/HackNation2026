using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using NetTopologySuite.Geometries;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Enums;

namespace WodoPlon.Api.Common.Services;

public sealed class OverpassClient(HttpClient httpClient, ILogger<OverpassClient> logger) : IOverpassClient
{
    private static readonly GeometryFactory Factory = new(new PrecisionModel(), Parcel.Srid);

    public async Task<HydroFeatureData[]?> GetHydroAroundAsync(double lat, double lon, int radiusM,
        CancellationToken cancellationToken = default)
    {
        // shortcut: only ways, relations (big multipolygon lakes) are skipped; add `relation` + `out geom` members if nearest water is often missed
        string around = string.Create(CultureInfo.InvariantCulture, $"around:{radiusM},{lat},{lon}");
        string query = $"""
            [out:json][timeout:{(int)httpClient.Timeout.TotalSeconds}];
            (
              way({around})["waterway"~"^(river|stream|canal|ditch|drain)$"];
              way({around})["natural"~"^(water|wetland)$"];
            );
            out tags geom;
            """;

        try
        {
            using var content = new FormUrlEncodedContent([new("data", query)]);
            using var response = await httpClient.PostAsync("api/interpreter", content, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Overpass returned {StatusCode}", (int)response.StatusCode);
                return null;
            }

            var body = await response.Content.ReadFromJsonAsync<OverpassResponse>(cancellationToken);
            return (body?.Elements ?? [])
                .Select(ToFeature)
                .OfType<HydroFeatureData>()
                .ToArray();
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or TaskCanceledException
                                  && !cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(e, "Overpass request failed");
            return null;
        }
    }

    private static HydroFeatureData? ToFeature(Element element)
    {
        var tags = element.Tags ?? [];
        HydroFeatureType? type = (tags.GetValueOrDefault("waterway"), tags.GetValueOrDefault("natural")) switch
        {
            ("river" or "stream" or "canal", _) => HydroFeatureType.River,
            ("ditch" or "drain", _) => HydroFeatureType.Ditch,
            (_, "water") => HydroFeatureType.Lake,
            (_, "wetland") => HydroFeatureType.Wetland,
            _ => null
        };

        var coords = (element.Geometry ?? []).Select(p => new Coordinate(p.Lon, p.Lat)).ToArray();
        if (type is null || coords.Length < 2)
            return null;

        bool isArea = type is HydroFeatureType.Lake or HydroFeatureType.Wetland
                      && coords.Length >= 4 && coords[0].Equals2D(coords[^1]);
        Geometry geom = isArea ? Factory.CreatePolygon(coords) : Factory.CreateLineString(coords);

        return new HydroFeatureData(type.Value, tags.GetValueOrDefault("name"), geom);
    }

    private sealed record OverpassResponse([property: JsonPropertyName("elements")] Element[]? Elements);

    private sealed record Element
    (
        [property: JsonPropertyName("tags")] Dictionary<string, string>? Tags,
        [property: JsonPropertyName("geometry")] LatLon[]? Geometry
    );

    private sealed record LatLon
    (
        [property: JsonPropertyName("lat")] double Lat,
        [property: JsonPropertyName("lon")] double Lon
    );
}
