# Service Contracts: Frontend ↔ ASP.NET Core ↔ Python Geo-Worker

This document fixes the data exchange between the services. The contracts follow the cause-and-effect order of the KOWR
task: **water situation (current + 10 years) → causes and retention → irrigation advice → sources and limitations**.

---

## 1. Frontend (React) ↔ Backend (ASP.NET Core)

The public API (`GET /api/crops`, `POST /api/analyze`, `GET /api/reports/{reportUuid}`, `GET /api/health`) is specified in
[api.md](api.md), section 3, with full request / response examples, error codes and rate limits. That file is the single
source of truth for the frontend contract; the TypeScript types live in `src/frontend/src/types/api.ts`.

---

## 2. Internal: ASP.NET Core → Python Geo-Worker

The Python service is reachable only inside the Docker network (`http://python-service:8000`) and handles raster data only
(Cloud Optimized GeoTIFF reads). It is stateless and has no database.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | `{"status":"ok"}` |
| `POST` | `/extract-geo` | Terrain and Sentinel-2 metrics for one parcel polygon |

### 2.1. Extract terrain and satellite metrics
`POST /extract-geo`

**Request (ASP.NET → Python):**
```json
{
  "dzialka_id": "040101_1.0001.123/4",
  "target_date": "2026-06-15",
  "include_terrain": true,
  "geometry": {
    "type": "MultiPolygon",
    "coordinates": [[[[18.001, 53.121], [18.005, 53.121], [18.005, 53.124], [18.001, 53.124], [18.001, 53.121]]]]
  }
}
```
* `geometry` — GeoJSON `Polygon` or `MultiPolygon` in WGS 84 (EPSG:4326), `[lon, lat]` order.
* `include_terrain` — ASP.NET sends `false` when the terrain of this parcel is already cached in `parcel_static_profiles`;
  this saves 2–3 seconds on requests for other dates.

**Response `200 OK` (Python → ASP.NET):**
```json
{
  "dzialka_id": "040101_1.0001.123/4",
  "terrain": {
    "status": "OK",
    "mean_slope_deg": 3.82,
    "max_slope_deg": 7.45,
    "steep_area_pct": 42.0,
    "source": "Geoportal NMT WCS",
    "elevation_min_m": 37.04,
    "elevation_max_m": 38.64,
    "elevation_diff_m": 1.6,
    "error_reason": null
  },
  "satellite": {
    "status": "OK",
    "ndvi_mean": 0.8223,
    "ndwi_mean": 0.3432,
    "scene_date": "2026-06-12",
    "cloud_cover_pct": 0.0,
    "source": "Sentinel-2 L2A (Earth Search)",
    "error_reason": null
  }
}
```
* `terrain` is `null` when `include_terrain=false`.
* `steep_area_pct` — share of the parcel with slope above 3°.
* `elevation_*` and `error_reason` are additive fields outside the original contract; the C# client ignores them.

**`terrain.status`:** `OK` | `NO_DATA` (no NMT coverage, e.g. outside Poland) | `ERROR` (GUGiK NMT failed or timed out;
the API asks again on the next analysis).

**`satellite.status`:**
* `OK` — a scene with < 20% cloud cover over the polygon within the 30 days before `target_date` (never after it).
* `CLOUDY_FALLBACK` — only scenes with 20–50% cloud cover; the least cloudy one is used and ASP.NET adds a warning to
  `limitationsPl`.
* `NO_DATA` — the field was covered by clouds for the whole window or the date is outside the archive (`ndvi_mean`,
  `ndwi_mean` are `null`). ASP.NET assesses the parcel from weather, soil and terrain only and says so.
* `ERROR` — the catalogue or the image reads failed (upstream problem, not "cloudy field"). ASP.NET stores it as
  `Error` and asks the worker again on a later request (at most once a minute).

### 2.2. Processing rules
* **Upstream failures never produce HTTP 5xx:** the affected section comes back with `NO_DATA` / `ERROR` and an
  `error_reason`.
* **Time budget:** each module (terrain, satellite) runs under a hard 12 s budget (`MODULE_TIMEOUT_S`); the API waits
  18 s for the whole call. GUGiK NMT gets two 5 s attempts (`NMT_ATTEMPTS`, `NMT_ATTEMPT_TIMEOUT_S`) because it sometimes
  hangs a single request.
* **Reflectance:** Earth Search COGs are already harmonized, so only the band `scale` (0.0001) is applied; the advertised
  `offset` of −0.1 is ignored (applying it makes red reflectance negative and pins NDVI at 1.0).
* **Scene selection:** newest first; for each acquisition the latest reprocessing is used, and once the clouds of an
  overpass are measured, other tiles of the same date are skipped.
* **Indices:** averaged over clean SCL pixels (classes 4, 5, 6); cloud cover counts SCL 3, 8, 9, 10.

### 2.3. Errors
* `400 Bad Request` — malformed input: invalid date (`2026-02-30`), unsupported geometry type (`Point`), empty,
  zero-area or self-intersecting polygon, coordinates outside WGS 84, missing fields, invalid JSON.

---

## 3. Source of the models

The models are not duplicated here to avoid drift; see the code:
* Python (Pydantic): `src/python-service/app/schemas.py`
* C# client and DTOs: `src/backend/WodoPlon.Api/Common/Services/PythonServiceClient.cs`,
  `src/backend/WodoPlon.Api/Common/Interface/IPythonServiceClient.cs`
* Contract tests: `src/python-service/tests/test_extract_geo.py`,
  `src/backend/WodoPlon.UnitTests/ExternalApis/ExternalApiClientsTests.cs`
