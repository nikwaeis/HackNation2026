# WodoPlon

**Digital water assistant for farmers** — KOWR track *"Zatrzymaj wodę, chroń plony"*, HackNation 2026.

A farmer picks a parcel (cadastral ID or a click on the map of Poland), a crop and a date. WodoPlon combines open
spatial, weather, satellite, soil and hydrology data and returns a plain-language report (Polish / English):
current water situation, causes and retention potential, irrigation advice, and data sources with limitations.
No login, no personal data, no paid API keys.

## Architecture

```
React frontend ──/api──► ASP.NET Core API ──► PostgreSQL + PostGIS (cache, crops, reports)
   (Leaflet map)          (orchestrator)  ──► Redis (rate limiting)
                                          ──► Python Geo-Worker (terrain + Sentinel-2)
                                          ──► ULDK, Open-Meteo, SoilGrids, Overpass OSM
```

| Component | Path | Stack | Role |
|---|---|---|---|
| Frontend | `src/frontend/` | React 19, TypeScript, Vite, Tailwind 4, Leaflet | Parcel selection, map layers (OSM, Geoportal orthophoto, GUGiK parcels, Copernicus EDO drought), report view, share link, print/PDF, PL/EN, high-contrast mode |
| Backend API | `src/backend/` | .NET 10 Minimal API, EF Core, CQRS | Orchestrates data sources, caches parcel data, runs the analysis, stores reports |
| Geo-Worker | `src/python-service/` | FastAPI, rasterio, shapely, pyproj | Stateless: slope from GUGiK NMT, NDVI/NDWI from Sentinel-2 L2A for a parcel polygon |
| Database | — | PostgreSQL 17 + PostGIS 3.5 | Crops, parcel static profiles, observations, hydro features, saved reports |
| Cache / limits | — | Redis 7 | Per-client rate limiting |

### Data sources

| Category | Source |
|---|---|
| Parcel boundaries | ULDK GUGiK |
| Terrain (slope) | Geoportal NMT (via Geo-Worker) |
| Weather (P, ET₀, Tmax, 10-year history) | Open-Meteo Archive |
| Satellite (NDVI, NDWI) | Sentinel-2 L2A, Earth Search (via Geo-Worker) |
| Soil (sand, clay, silt, SOC) | ISRIC SoilGrids v2.0 |
| Hydrography (distance to rivers, ditches, lakes) | Overpass OSM, stored in PostGIS |

The browser also calls a few public, key-less services directly — for the map only, never for the analysis result:

| Purpose in the UI | Service |
|---|---|
| Parcel outline after a click / typed ID | ULDK GUGiK (via the `/uldk` proxy) |
| Land-use check of the clicked spot (warns on built-up land, forest, roads, water) | GUGiK KIEG WMS `GetFeatureInfo` — EGiB land-use class |
| Highlighted farm fields and ditches around the parcel | OpenStreetMap Overpass API |
| Runoff-direction arrows on sloped parcels | Open-Meteo Elevation API (Copernicus DEM 90 m) |
| Base maps and overlays | OSM tiles, Geoportal orthophoto WMS, GUGiK KIEG parcels WMS, Copernicus EDO drought WMS |

### How the analysis works

1. **Static profile** (computed once per parcel, cached forever): boundary, area, slope, soil texture, distance to water.
2. **Dynamic observation** (cached per parcel + date): weather window and satellite indices, fetched in parallel.
3. **Assessment**: FAO-56 water balance (`P − Kc·ET₀`) for the selected crop, dry spells, NDWI, soil sand content
   and number of drought years in the last 10 years → water deficit level.
4. **Report**: deterministic Polish/English text templates (no LLM) with recommendations and sources.

If the Geo-Worker is unavailable, the analysis still runs and marks satellite data as `NO_DATA`.

## API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/crops` | Supported crops with FAO-56 coefficients |
| `POST` | `/api/analyze` | Analyze a parcel: `{ dzialkaId \| lat+lon, cropId, targetDate }` |
| `GET` | `/api/reports/{reportUuid}` | Fetch a saved report (shareable link) |

Geo-Worker (internal): `GET /health`, `POST /extract-geo`. Full contracts: [`docs/api.md`](docs/api.md),
data model: [`docs/data.md`](docs/data.md), implementation plan: [`docs/plan/`](docs/plan/00-overview.md).

## Getting started

### Requirements

- Docker with Docker Compose v2
- Optional, for running parts without Docker: .NET 10 SDK, Node.js 22, Python 3.11

### Run everything (development)

```bash
# 1. Create the environment file
cp .env.example .env

# 2. First run: set DATABASE_RUNSEED=true in .env to load the crop list
#    (safe to leave on — the seeder only inserts missing crops)

# 3. Build and start all services
docker compose -f docker-compose.dev.yml up -d --build
```

Database migrations run automatically on API start in Development. Hot reload is enabled for the API, the frontend
and the Geo-Worker (source folders are mounted into the containers).

| Service | URL |
|---|---|
| Web app | http://localhost:5173 |
| API | http://localhost:5254/api/health |
| OpenAPI spec | http://localhost:5254/openapi/v1.json |
| Geo-Worker | http://localhost:8000/health |

Useful commands:

```bash
docker compose -f docker-compose.dev.yml logs -f api   # follow API logs
docker compose -f docker-compose.dev.yml down          # stop
docker compose -f docker-compose.dev.yml down -v       # stop and wipe the database
```

Ports can be changed in `.env` (`API_PORT`, `FRONTEND_PORT`, `POSTGRES_PORT`, `REDIS_PORT`, `PYTHON_SERVICE_PORT`).

### Frontend only (no backend)

```bash
cd src/frontend
npm install
npm run dev
```

Use the **"Załaduj przykład (demo)"** button for a mock report, or set `VITE_USE_MOCK=true` to always use mock data.
`/api` is proxied to `http://localhost:5254` (change with `VITE_API_PROXY_TARGET`).

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
```

The frontend is served by nginx on port `80` and proxies `/api` to the backend; the Geo-Worker is internal only.
Set `Cors__WebOrigin` in `.env.prod` to your domain. Note: migrations are applied automatically only in Development —
apply them to the production database before the first start.

## Tests

```bash
# Backend
dotnet test src/backend/WodoPlon.slnx

# Geo-Worker (unit + contract tests, all external APIs mocked)
cd src/python-service
pip install -r requirements-dev.txt
pytest
# same in Docker, no local Python needed:
docker build -f Dockerfile.dev -t wodoplon-geo . && docker run --rm -v "$PWD:/app" wodoplon-geo sh -c "pip install -q pytest && pytest -q"

# Geo-Worker live smoke test against the real GUGiK NMT + Sentinel-2 (needs network)
docker run --rm -e PYTHONPATH=/app -v "$PWD:/app" wodoplon-geo python tests/live_smoke.py

# Frontend (Vitest + Testing Library, all external services mocked)
cd src/frontend
npm install
npm test

# Frontend end-to-end: real clicks on the real map in the local Google Chrome,
# live ULDK / GUGiK services, only our /api/* stubbed. Screenshots land in e2e-results/screens/
npm run test:e2e
```

What the tests verify:

- **Parcel selection** — exact click coordinates sent to ULDK (`xy=lon,lat,4326`), WKT `Polygon`/`MultiPolygon` parsing,
  "not found" message, land-use warning with confirmation for built-up plots, unchanged `POST /api/analyze` payload.
- **Report** — the four KOWR stages in order, causes and data-based recommendations, sources with dates, limitations,
  missing data shown as "Brak danych" (no fake precision), PDF / print and share link.
- **Geo-Worker ↔ backend contract** — the exact JSON the C# client sends (`need_terrain`) and binds (flat
  `mean_slope_deg`, `ndvi_mean`, `satellite_status` …), timeouts within the backend's 18 s budget, graceful degradation.

## Frontend components and licences

| Component | Licence | Use |
|---|---|---|
| React, React DOM, React Router | MIT | UI, routing |
| Leaflet | BSD-2-Clause | Map |
| react-leaflet, @react-leaflet/core | Hippocratic License 2.1 | React bindings for Leaflet (permissive, with human-rights conditions; not OSI-approved) |
| lucide-react | ISC | Icons |
| Tailwind CSS, Vite, TypeScript | MIT / MIT / Apache-2.0 | Build & styling |
| Plus Jakarta Sans, JetBrains Mono (Google Fonts) | SIL OFL 1.1 | Fonts |
| Vitest, Testing Library, Playwright | MIT / MIT / Apache-2.0 | Tests (dev only) |

Data shown or queried by the browser, with the attribution the UI displays:

| Data | Licence / terms | Attribution in the UI |
|---|---|---|
| OpenStreetMap tiles; ditches and fields via Overpass | ODbL 1.0 | "© OpenStreetMap", also over the aerial photo when OSM overlays are drawn |
| Geoportal orthophoto, ULDK, KIEG (parcels, EGiB land-use class) | GUGiK open data (free re-use) | "Geoportal.gov.pl (GUGiK)", "GUGiK KIEG" |
| Copernicus EDO drought (CDI) | Copernicus open data, free use with attribution | "Copernicus EDO" |
| Open-Meteo Elevation (runoff arrows) | CC BY 4.0, free non-commercial API | "Open-Meteo (CC BY 4.0)" when arrows are drawn |

On phones the map credits are behind an "i" button on the map; on desktop they are always visible.

## Use of AI tools

- **At runtime:** none in the frontend. The report texts come from the backend's deterministic templates;
  the frontend only displays them and derives the "Wiarygodność oceny" indicator from data completeness.
- **During development:** the frontend UI, tests and the geo-worker fixes were written with the help of
  Claude Code (Anthropic), reviewed and run by the team.

## Known frontend limitations

- Land-use check after a map click uses the EGiB class from GUGiK KIEG; some counties do not publish it —
  then the app falls back to OSM farmland or shows "not verified" and never blocks the selection.
- GUGiK draws parcel boundaries only from map zoom 17; the Copernicus EDO grid is ~5 km, so at field zoom
  the drought layer is a single cell (the legend says so).
- Public Overpass / EDO servers can be slow or rate-limited; overlays then degrade with a clear status.
- "Wiarygodność oceny" measures input completeness, not a statistical confidence interval.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
