# Part 1. External API clients

Every client follows the same layout:
- a typed `HttpClient`;
- the interface in `Common/Interface/`, response records next to it;
- the implementation in `Common/Services/`;
- registration in `Extensions/ExternalApiExtension.cs`.

URLs and the timeout (8 s) come from the `ExternalApis` section (`ExternalApisSettings`). The Python worker timeout is 18 s.

| Client | Request | Response | On failure |
|---|---|---|---|
| `IUldkClient` | `GetParcelById` / `GetParcelByXY`, `result=id,voivodeship,geom_wkt&srid=4326` | `Result<UldkParcel>` | `-1` → `NotFound` (`External.ParcelNotFound`), otherwise `Failure` |
| `IOpenMeteoClient` | `/v1/archive`, daily `precipitation_sum, et0_fao_evapotranspiration, temperature_2m_max` | `Result<DailyWeather[]>`, days with `null` are skipped | `Failure` (`External.WeatherUnavailable`) |
| `ISoilGridsClient` | `/soilgrids/v2.0/properties/query`, `sand, clay, silt, soc`, layers 0–30 cm | `SoilSample?`: divided by `d_factor`, averaged weighted by layer thickness | `null` |
| `IOverpassClient` | ways `waterway=river\|stream\|canal\|ditch\|drain`, `natural=water\|wetland` within a radius | `HydroFeatureData[]?` | `null` |
| `IPythonServiceClient.ExtractGeoAsync` | `POST /extract-geo`, snake_case | `GeoMetrics?` | `null` |

Checked with live requests (2026-11-21):
- With `srid=4326`, ULDK returns WKT like `SRID=4326;POLYGON((lon lat, ...))`. The first response line is a status:
  `0` means success, `-1 brak wyników` means nothing found.
- SoilGrids returns `mean: null` for urban points. `sand` comes in g/kg (d_factor 10 → %), `soc` in dg/kg
  (d_factor 10 → g/kg).
- Open-Meteo answered `429 Daily API request limit exceeded` on the shared hackathon IP. **Risk:** the free tier counts a
  10-year request as hundreds of calls, roughly 35–40 analyses per day from one IP. If that becomes a problem, an API key
  (customer archive) is needed. Coalescing and the per-date cache (part 6) keep the number of calls low.
- Overpass was unreachable from the hackathon network (timeout), so its format was taken from the documentation.

Geometry is sent to the Python worker as a GeoJSON `MultiPolygon` (that is how parcels are stored). The worker accepts
both `Polygon` and `MultiPolygon` (`shapely.geometry.shape` handles both).

**Later changes (part 6):** the Geo-Worker client was rewritten to the real nested response (`terrain` / `satellite`) and
the `include_terrain` field; Overpass got a 30 s timeout, mirrors and runs in the background.
