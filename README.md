# WodoPlon

**Digital water assistant for farmers** — KOWR track *"Zatrzymaj wodę, chroń plony"*, HackNation 2026.

A farmer picks an agricultural parcel (by Polish TERYT cadastral ID or a click on the map), selects a crop and an
analysis date (today or up to 10 years back). WodoPlon combines open spatial, meteorological, satellite, soil and
hydrological data and computes a plain-language report (Polish / English): current water situation and 10-year
drought history, causes and prioritized retention recommendations, last-resort irrigation advice, and full data
provenance with uncertainty and limitations. No login, no personal data (PII), no paid API keys, no extra software
required.

## Key features

- **Zero-GIS parcel selection** — enter a cadastral ID (e.g. `141611_2.0018.103`) or click a field on the map of
  Poland. The parcel polygon is outlined automatically via ULDK GUGiK, and an EGiB / TERYT land-use check warns
  when a non-agricultural plot (built-up area, forest, road, water) is selected.
- **Crop & historical date analysis** — supports 5 main Polish crops (*Pszenica ozima*, *Kukurydza*, *Rzepak ozimy*,
  *Burak cukrowy*, *Ziemniak*) with FAO-56 coefficients across any date from today up to 10 years back.
- **4-stage KOWR causal report** (strict sequence):
  1. **Water situation assessment** — 90-day FAO-56 water balance (`P − Kc·ET₀`) compared against the parcel's own
     10-year median, precipitation vs 10-year norm, longest dry spell, 10-year drought frequency, Sentinel-2
     NDVI/NDWI, soil/slope/water indicators, and an input-completeness uncertainty badge (*"Wiarygodność oceny"*).
  2. **Causes & retention recommendations** — landscape retention first (drainage ditch weirs, contour tillage,
     buffer zones), followed by soil/agronomic measures (mulching, crop residues, cover crops, reduced tillage),
     each explicitly justified by parcel data.
  3. **Irrigation advice (last resort)** — recommended only when risk is `HIGH` or `CRITICAL` during critical crop
     growth months (or severe canopy stress `NDWI < −0.15`), with a calculated single dose (`15–35 mm`,
     `150–350 m³/ha`).
  4. **Sources & limitations** — exact data sources, fetch/scene dates, cloud cover, uncertainty breakdown, and
     explicit limitations; missing metrics are shown as *"Brak danych"* with no fake precision.
- **Farmer-friendly delivery** — shareable report permalink (`/report/{reportUuid}`), print / Save to PDF
  (`@media print`), mobile-friendly map and report layout, PL/EN language switch (UI and backend report text), and
  dark high-contrast theme (*Kontrast*).
- **Interactive map overlays** — OpenStreetMap, Geoportal orthophoto WMS, GUGiK KIEG parcel boundaries WMS,
  Copernicus EDO drought (CDI) WMS, nearby OSM ditches/fields, and slope runoff-direction arrows.

## Architecture

```
React frontend ──/api──► ASP.NET Core API ──► PostgreSQL 17 + PostGIS 3.5 (cache, crops, hydro, reports)
 (Leaflet map)  ──/uldk─► (orchestrator)  ──► Redis 7 (rate limiting, HybridCache request coalescing)
                                          ──► Python Geo-Worker (terrain + Sentinel-2 rasters)
                                          ──► ULDK, Open-Meteo, SoilGrids, Overpass OSM (fallback)
```

| Component | Path | Stack | Role |
|---|---|---|---|
| Frontend | `src/frontend/` | React 19, TypeScript, Vite, Tailwind 4, Leaflet | Interactive map, parcel lookup & land-use check, 4-stage report view, share link, print/PDF, PL/EN, high-contrast mode |
| Backend API | `src/backend/` | .NET 10 Minimal API, EF Core, NetTopologySuite, CQRS | Orchestrates data sources, manages PostGIS cache & request coalescing, runs deterministic FAO-56 decision engine, renders PL/EN reports |
| Geo-Worker | `src/python-service/` | Python 3.11, FastAPI, rasterio, shapely, pyproj | Stateless raster processor: slope from GUGiK NMT WCS and NDVI/NDWI from Sentinel-2 L2A COGs |
| OSM Water Importer | `scripts/import-osm-water.sh` | GDAL (`ogr2ogr`) | One-shot / monthly job importing Geofabrik Poland waterways & water bodies (~1.3M features) into PostGIS |
| Database | — | PostgreSQL 17 + PostGIS 3.5 | Crops, local OSM hydrography, parcel static profiles, dynamic observations, saved reports |
| Cache / limits | — | Redis 7 | Sliding-window rate limiting & HybridCache request coalescing |
| Reverse proxy | `src/frontend/nginx.conf` | nginx (production) | Serves static SPA and proxies `/api` to backend and `/uldk` to ULDK GUGiK |

## Data sources, scopes & freshness

All diagnoses, water balances, causes, and recommendations are **computed dynamically at runtime** from retrieved
open data — the application never returns pre-computed or hardcoded recommendations for real parcels. (An optional
*"Zobacz przykładowy raport"* button opens a clearly labelled demo fixture solely for offline UI preview when the
backend is unreachable.)

### Analysis pipeline data (Backend & Geo-Worker)

| Category | Source / Service | Scope & resolution | Freshness & caching mode | Licence / terms |
|---|---|---|---|---|
| **Crop parameters** | FAO-56 (*Irrigation and Drainage Paper 56*) | `Kc` (initial/mid/late), critical months, root depth for 5 Polish crops | **Preloaded** on DB startup (`CropSeeder`) | Public scientific methodology |
| **Hydrography (primary)** | OpenStreetMap via Geofabrik Poland extract (`poland-latest.osm.pbf`) | Waterways (rivers, streams, canals, ditches, drains), lakes & wetlands across Poland (~1.3M rows) | **Preloaded** into PostGIS via `osm-import` (extract date tracked in `data_imports`, refreshed monthly); **Overpass API** live background fallback if import not loaded | ODbL 1.0 (`© OpenStreetMap`) |
| **Parcel boundaries** | ULDK GUGiK (`uldk.gugik.gov.pl`) | Cadastral polygon (EPSG:4326), area (ha), voivodeship | **Live** on first parcel query, then **cached** in PostGIS (`parcels.fetched_at`) | GUGiK open public data (free re-use, attribution) |
| **Terrain (slope)** | Geoportal NMT WCS (`DTM_PL-EVRF2007-NH`, via Geo-Worker) | 1 m DTM: mean slope, max slope, % parcel area with slope `> 3°` | **Live** on first parcel analysis, then **cached** in PostGIS (`parcel_static_profiles.fetched_at`); retried on later request if failed | GUGiK open public data (free re-use, attribution) |
| **Soil properties** | ISRIC SoilGrids v2.0 (`rest.isric.org`) | 0–30 cm topsoil: sand, clay, silt (%), organic carbon (`g/kg`) at 250 m | **Live** on first parcel query, then **cached** in PostGIS (`parcel_static_profiles.fetched_at`) | CC BY 4.0 (attribution) |
| **Weather (10-year + current)** | Open-Meteo Archive API (`archive-api.open-meteo.com`) | Daily precipitation (`P`), `ET₀`, `Tmax` for 90-day windows across 10 years | **Live** on first `(parcel, date)` query, then **cached** in PostGIS (`dynamic_observations.fetched_at`) | CC BY 4.0 (free non-commercial API) |
| **Satellite indices** | Sentinel-2 L2A via Element 84 Earth Search STAC (via Geo-Worker) | B04, B08, B11, SCL cloud mask within `±15 days` of `targetDate` → NDVI, NDWI | **Live** on first `(parcel, date)` query, then **cached** with scene date & cloud %; `ERROR` retried on later request | Copernicus Sentinel Data (free, full & open, attribution) |

### Browser-only map services (visual context, never used in report calculations)

| Purpose in the UI | Service | Licence / terms | Attribution in the UI |
|---|---|---|---|
| Parcel outline after click / typed ID | ULDK GUGiK (via `/uldk` proxy) | GUGiK open public data | `"GUGiK KIEG"` |
| Land-use check (warns on built-up, forest, road, water) | GUGiK KIEG WMS `GetFeatureInfo` (EGiB class) | GUGiK open public data | `"GUGiK KIEG"` |
| Highlighted farm fields & ditches around the parcel | OpenStreetMap Overpass API | ODbL 1.0 | `"© OpenStreetMap"` (also over aerial photo) |
| Runoff-direction arrows on sloped parcels | Open-Meteo Elevation API (Copernicus DEM 90 m) | CC BY 4.0 (non-commercial) | `"Open-Meteo (CC BY 4.0)"` when drawn |
| Base maps & overlays | OSM tiles, Geoportal orthophoto WMS, GUGiK KIEG parcels WMS, Copernicus EDO drought WMS (`cdiad`) | ODbL 1.0 / GUGiK open data / Copernicus open data | `"© OpenStreetMap"`, `"Geoportal.gov.pl (GUGiK)"`, `"GUGiK KIEG"`, `"Copernicus EDO"` |

On phones the map credits sit behind an `"i"` button on the map; on desktop they are always visible.

### How the analysis works

1. **Static profile** (computed once per parcel, cached in PostGIS): ULDK boundary/area, SoilGrids texture and AWC,
   nearest water feature from the local OSM PostGIS table (milliseconds; Overpass background fallback if not
   imported), and GUGiK NMT slope.
2. **Dynamic observation** (cached per `(parcel, targetDate)`): 10-year Open-Meteo weather window and Sentinel-2 L2A
   indices fetched in parallel; concurrent first requests for the same parcel share one set of external calls
   (`FetchCoalescer` via HybridCache).
3. **Deterministic assessment (`AnalysisEngine`)**: hybrid FAO-56 water balance (`P − Kc·ET₀`) compared with the
   parcel's own 10-year median (`CRITICAL` absolute threshold `< −180 mm`; `HIGH`/`MODERATE` and drought-year count
   relative to local median), dry spells, NDWI canopy stress, soil sand/humus, slope, and ditch proximity → water
   deficit level, causes, retention priority, and optional irrigation dose.
4. **Report**: deterministic Polish/English templates (`Accept-Language`, no LLM at runtime) with exact source dates,
   limitations, and completeness-based confidence indicator.

If the Geo-Worker is unavailable, the analysis still runs and marks satellite data as `ERROR` (retried on a later
request); if SoilGrids is unavailable, medium-loam defaults are used and transparently disclosed in Step 4.

## API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/crops` | Supported crops with FAO-56 coefficients (`Kc`, critical months, root depth) |
| `POST` | `/api/analyze` | Analyze a parcel: `{ dzialkaId \| lat+lon, cropId, targetDate }` (`Accept-Language: pl \| en`) |
| `GET` | `/api/reports/{reportUuid}` | Fetch a saved report by UUID (shareable link) |

Geo-Worker (internal): `GET /health`, `POST /extract-geo`. Full API & algorithm specification:
[`docs/api.md`](docs/api.md), database & caching model: [`docs/data.md`](docs/data.md), implementation plan:
[`docs/plan/`](docs/plan/00-overview.md).

## Getting started

**Full guide (database warm-up, production migrations, smoke test, troubleshooting): [`docs/setup.md`](docs/setup.md).**

### Requirements

- Docker with Docker Compose v2
- Optional, for running components locally without Docker: .NET 10 SDK, Node.js 22, Python 3.11

### Run everything (development)

```bash
# 1. Create the environment file
cp .env.example .env

# 2. First run: set DATABASE_RUNSEED=true in .env to load the crop list
#    (safe to leave on — the seeder only inserts missing crops)

# 3. Build and start all services
docker compose -f docker-compose.dev.yml up -d --build

# 4. Once (and monthly): import Polish OSM water for nearest-water lookups (~2 GB download)
docker compose -f docker-compose.dev.yml run --rm osm-import
```

Database migrations run automatically on API start in `Development`. Hot reload is enabled for the API, the frontend,
and the Geo-Worker (source folders are mounted into the containers).

| Service | URL |
|---|---|
| Web app | http://localhost:5173 |
| API health | http://localhost:5254/api/health |
| OpenAPI spec | http://localhost:5254/openapi/v1.json |
| Geo-Worker | http://localhost:8000/health |

Useful commands:

```bash
docker compose -f docker-compose.dev.yml logs -f api   # follow API logs
docker compose -f docker-compose.dev.yml down          # stop
docker compose -f docker-compose.dev.yml down -v       # stop and wipe the database + OSM volume
```

Ports can be overridden in `.env` (`API_PORT`, `FRONTEND_PORT`, `POSTGRES_PORT`, `REDIS_PORT`, `PYTHON_SERVICE_PORT`).

### Frontend only (without backend)

```bash
cd src/frontend
npm install
npm run dev
```

When the backend is offline, click **"Zobacz przykładowy raport"** in the form to inspect a sample report layout.
By default `/api` is proxied to `http://localhost:5254` (override via `VITE_API_PROXY_TARGET` or set
`VITE_API_BASE_URL`).

### Production

```bash
cp .env.prod.example .env.prod
mkdir secrets
# create one-value files (no trailing newline):
#   secrets/db_password       <password>
#   secrets/db_connection     Host=postgres;Database=WodoPlon;Username=wodoplon;Password=<password>
#   secrets/redis_password    <password>
#   secrets/redis_connection  redis:6379,password=<password>
docker compose -f docker-compose.prod.yml up -d --build
# after migrations are applied (see docs/setup.md), once and monthly:
docker compose -f docker-compose.prod.yml run --rm osm-import
```

In production, nginx serves the frontend on port `80` (`FRONTEND_PORT`) and proxies `/api` to the backend and `/uldk`
to ULDK GUGiK; the Geo-Worker stays on the internal Docker network with no published port. Set `Cors__WebOrigin` in
`.env.prod` to your domain. Note: EF Core migrations run automatically only in `Development` — see
[`docs/setup.md`](docs/setup.md) for applying production migrations and seeding crops.

## Verification & tests

```bash
# Backend unit tests (FAO-56 math, rules, request coalescing, API clients, endpoints — mocked externals)
dotnet test src/backend/WodoPlon.slnx

# Geo-Worker unit + contract tests (no network; all external APIs mocked)
cd src/python-service
pip install -r requirements-dev.txt
pytest

# Frontend unit & component tests (Vitest + Testing Library, externals mocked)
cd src/frontend
npm install
npm test

# Frontend end-to-end tests: real clicks on the live map (live ULDK/GUGiK, /api/* stubbed)
# Screenshots land in src/frontend/e2e-results/screens/; set E2E_ALL_BROWSERS=1 for Firefox/WebKit
npm run test:e2e
```

### How results and recommendations are verified

- **Agronomic & engine logic (Backend xUnit):** verifies FAO-56 `ETc` and 90-day water balance math, 10-year median
  anomaly and drought-year counting, `LOW`/`MODERATE`/`HIGH`/`CRITICAL` thresholds, all 4 retention triggers
  (weather deficit, sandy/low-humus soil, slope runoff, ditch proximity), landscape-before-soil ordering, irrigation
  gating and dose clamping (`15–35 mm`), request coalescing (`CoalescingTests`), bilingual PL/EN texts, and graceful
  degradation on external API failures.
- **Raster pipeline (Geo-Worker pytest):** verifies `GET /health`, `POST /extract-geo` request/response contracts,
  terrain slope calculation, Sentinel-2 cloud filtering and NDVI/NDWI math, and error-to-`NO_DATA`/`ERROR` handling.
- **UI & KOWR compliance (Vitest + Playwright E2E):** verifies exact click coordinates sent to ULDK (`xy=lon,lat,4326`),
  WKT `Polygon`/`MultiPolygon` parsing, land-use warning and confirmation flow (including TERYT urban fallback for
  Warsaw centre), strict 4-stage report order, uncertainty score breakdown, honest *"Brak danych"* rendering,
  mobile responsiveness, print/PDF view, and shareable links.
- **Live end-to-end smoke checks:** documented in [`docs/setup.md`](docs/setup.md) against real Polish cadastral
  parcels (e.g. `041509_2.0004.437/3` and map coordinates), verifying `< 30 s` cold response and `< 1 s` cached
  response.

## Components, models & licences

### Backend (.NET 10 / NuGet)

| Component | Licence | Use |
|---|---|---|
| .NET 10 / ASP.NET Core / EF Core / OpenAPI | MIT | Web API, ORM, OpenAPI spec |
| Npgsql / Npgsql.EntityFrameworkCore.PostgreSQL | PostgreSQL License | PostgreSQL + PostGIS driver |
| NetTopologySuite / NetTopologySuite.IO.GeoJSON4STJ | BSD-3-Clause | Spatial geometries & GeoJSON serialization |
| FluentValidation | Apache-2.0 | Request & configuration validation |
| Microsoft.Extensions.Caching.Hybrid / StackExchangeRedis | MIT | Request coalescing & caching abstractions |
| StackExchange.Redis | MIT | Redis client for rate limiting & cache |
| xUnit / NSubstitute / coverlet.collector | Apache-2.0 / BSD-3-Clause / MIT | Unit tests (dev/test only) |
| FluentAssertions (v8) | Xceed Community License (free for non-commercial / OSS) | Test assertions (dev/test only) |

### Geo-Worker (Python 3.11 / PyPI)

| Component | Licence | Use |
|---|---|---|
| FastAPI / pydantic-settings | MIT | HTTP API & configuration |
| Uvicorn | BSD-3-Clause | ASGI server |
| httpx | BSD-3-Clause | Async HTTP client for WCS & STAC |
| NumPy | BSD-3-Clause | Raster & spectral index math |
| rasterio (bundles GDAL / PROJ) | BSD-3-Clause (GDAL/PROJ: MIT) | Cloud-Optimized GeoTIFF window reads |
| Shapely | BSD-3-Clause | Polygon geometry operations |
| pyproj | MIT | CRS reprojection (EPSG:4326 ↔ EPSG:2180 / UTM) |
| pytest | MIT | Tests (dev/test only) |

### Frontend (Node 22 / npm)

| Component | Licence | Use |
|---|---|---|
| React, React DOM, React Router | MIT | UI, routing |
| Leaflet | BSD-2-Clause | Interactive map |
| react-leaflet, @react-leaflet/core | Hippocratic License 2.1 | React bindings for Leaflet (permissive, with human-rights conditions; not OSI-approved) |
| lucide-react | ISC | Icons |
| Tailwind CSS, Vite, TypeScript | MIT / MIT / Apache-2.0 | Build & styling |
| Plus Jakarta Sans, JetBrains Mono (Google Fonts) | SIL OFL 1.1 | Fonts |
| Vitest, Testing Library, Playwright | MIT / MIT / Apache-2.0 | Tests (dev/test only) |

### Infrastructure & runtime containers

| Component | Licence | Role |
|---|---|---|
| PostgreSQL 17 | PostgreSQL License | Relational database |
| PostGIS 3.5 | GPL-2.0+ | Spatial database extension (separate container) |
| Redis 7 | RSALv2 / SSPLv1 | In-memory store for rate limiting & cache (separate container) |
| GDAL (`ghcr.io/osgeo/gdal`) | MIT | One-shot `osm-import` job (`ogr2ogr`) |
| nginx | BSD-2-Clause | Production static file server & reverse proxy |

### Agronomic models

- **FAO-56 crop evapotranspiration** (`ETc = ET₀ × Kc`) for monthly crop water demand, 90-day climatic water balance,
  and hybrid comparison against the parcel's 10-year local median.
- **Sentinel-2 spectral indices**: `NDVI = (B08 − B04) / (B08 + B04)` and Gao `NDWI = (B08 − B11) / (B08 + B11)`,
  filtered by Scene Classification Layer (SCL) cloud mask.
- **Deterministic rule-based decision engine** — no statistical ML or LLM inference at runtime.

## Use of AI tools

- **At runtime:** none. All agronomic calculations, recommendations, and PL/EN report texts are generated
  deterministically on the backend; the frontend displays them and computes *"Wiarygodność oceny"* from input
  completeness.
- **During development:** AI coding assistants (Claude Code by Anthropic and Antigravity by Google) were used during
  the hackathon to help develop the frontend UI, automated test suites, hardening fixes, and documentation. All
  generated code and documentation were reviewed, executed, and verified by the team.

## Known technical limitations

### Data & analytical model

- **SoilGrids 250 m resolution:** global gridded soil data may miss within-field variability or recent agronomic
  practices; when SoilGrids is unavailable, the engine falls back to medium loam (`130 mm/m` AWC) and reports this
  explicitly in Step 4.
- **Optical satellite clouds:** prolonged cloud cover across the `±15-day` window yields `NO_DATA`; assessment then
  relies on meteorological, soil, terrain, and hydrological inputs (reflected in limitations and lowered confidence).
- **Open-Meteo archive lag & grid:** reanalysis data has an approximate 5-day lag for the most recent days (flagged
  automatically when `targetDate` falls inside this lag window) and gridded spatial resolution (~9–11 km).
- **No local groundwater telemetry or legal checks:** the system does not read local piezometers or field moisture
  sensors and does not verify water-law permits required for abstraction.
- **OSM hydrography coverage:** drainage ditch proximity (`≤ 1000 m`) depends on OpenStreetMap completeness; small
  unmapped ditches may not be detected.
- **Crop model scope:** covers 5 seeded Polish crops using monthly FAO-56 `Kc` stages rather than custom sowing dates
  or cultivar-specific phenology.

### Frontend & map overlays

- **EGiB land-use coverage:** some counties do not expose EGiB classes via GUGiK KIEG; the UI falls back to OSM
  farmland polygons or TERYT urban gmina detection, or reports *"not verified"*, and never blocks analysis.
- **Zoom & grid scale:** GUGiK draws parcel boundaries only from map zoom 17; the Copernicus EDO drought grid is
  ~5 km, so at parcel zoom the drought overlay appears as a uniform cell (explained in the map legend).
- **Public upstream availability:** public Overpass and EDO servers can be slow or rate-limited; map overlays degrade
  gracefully with a visible status banner without blocking the form.
- **Uncertainty indicator:** *"Wiarygodność oceny"* measures input data completeness, not a statistical confidence
  interval.

## Scalability & security

### Handling external limits & availability

- **Local hydrography + multi-tier PostGIS caching:** Poland-wide OSM hydrography (~1.3M rows) is pre-imported into
  PostGIS (eliminating Overpass on the hot path); static parcel profiles (geometry, slope, soil, nearest water) are
  cached indefinitely; dynamic observations are cached per `(dzialka_id, target_date)`; generated reports are stored
  permanently by `report_uuid`.
- **Request coalescing, rate limiting & timeouts:** `FetchCoalescer` (HybridCache) deduplicates concurrent first
  requests for the same parcel; Redis sliding-window rate limiting enforces `10 analyses/min` per client and `30/min`
  per IP after FluentValidation (so invalid requests never spend quota); strict outbound timeouts prevent cascading
  hangs, and failed terrain/satellite lookups (`ERROR`) automatically retry on subsequent requests.
- **Graceful degradation:** upstream failures (NMT, Sentinel-2, SoilGrids, Overpass) never crash the request with HTTP
  500; missing layers are recorded transparently.

### Scaling nationwide (data updates & response times)

To serve thousands of concurrent farmers across Poland:
1. **Expand pre-loaded national static layers in PostGIS** — alongside the existing monthly `osm-import` (~1.3M
   waterways), pre-import Poland-wide BDOT10k / Hydroportal (ISOK), GUGiK EGiB/NMT archives, and IUNG-PIB soil
   drought vulnerability maps so cold parcel lookups require zero live upstream calls.
2. **Scheduled background ingestion** — run periodic batch jobs for daily meteorological grids (IMGW-PIB / weather
   archive) and pre-computed Sentinel-2 NDVI/NDWI composites, keeping API latency consistently under `200 ms`.
3. **Horizontal scaling** — both the ASP.NET Core API and the Python Geo-Worker are stateless and scale horizontally
   behind a load balancer alongside a CDN for static assets and PostgreSQL read replicas.

### Projected infrastructure costs at scale

The hackathon prototype runs at **zero paid API cost** on public open-data endpoints. Moving to nationwide production
would involve:
- **Cloud infrastructure:** managed PostgreSQL + PostGIS (100–300 GB SSD + backups), managed Redis, autoscaled
  containers for API and Geo-Worker, and CDN/egress — roughly **EUR 200–600 / month** for moderate national traffic.
- **External data tiers:** Open-Meteo's free tier is non-commercial, so production deployment would either use
  Open-Meteo's commercial plan, self-host open ERA5/IMGW-PIB meteorological feeds, or integrate IMGW-PIB open APIs;
  satellite ingestion would use dedicated Copernicus Data Space Ecosystem (CDSE) credentials alongside the existing
  monthly Geofabrik/BDOT10k local import.

### Security & privacy

- **Zero PII:** no accounts, names, emails, or phone numbers are collected or stored. Parcels are identified solely by
  public TERYT cadastral IDs and reports by random UUIDs.
- **Hardening:** strict input validation (FluentValidation), explicit CORS origin (`Cors__WebOrigin`), trusted
  `X-Forwarded-For` restricted to loopback/private proxy networks (configurable via `ForwardedHeaders__KnownNetworks`),
  Geo-Worker isolated on the internal Docker network in production, and production credentials mounted exclusively
  via Docker secrets (`/run/secrets`, never committed to git).

## License

Apache License 2.0 — see [LICENSE](LICENSE).
