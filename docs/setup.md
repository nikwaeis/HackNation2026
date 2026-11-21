# Running WodoPlon

Step-by-step guide to start the whole stack, warm up the database and check that everything works.
For the API contract see [api.md](api.md), for the data model [data.md](data.md).

## 1. What you need

| | |
|---|---|
| Docker | Docker Desktop / Engine with Compose v2 (`docker compose version`) |
| Disk | ~6 GB free: images ~2 GB, OSM extract 2.1 GB, database ~0.7 GB after the water import |
| Network | Outbound HTTPS to the public data services (see section 7). A fresh, non-shared IP is best: Open-Meteo and Overpass rate-limit per IP |
| Optional | .NET 10 SDK (backend tests, production migration script), Python 3.11+ (Geo-Worker tests), Node.js 22 (frontend outside Docker) |

No API keys or accounts are needed.

## 2. First start (development)

```bash
# 1. Environment file
cp .env.example .env
#    set DATABASE_RUNSEED=true (loads the crop list; safe to leave on, it only inserts missing crops)

# 2. Build and start everything
docker compose -f docker-compose.dev.yml up -d --build

# 3. Wait until the API is up (first build takes a few minutes)
curl http://localhost:5254/api/health          # {"status":"ok"}
```

In Development the API applies the EF Core migrations on start, so the schema is ready as soon as `/api/health`
answers. Check the log once: `docker compose -f docker-compose.dev.yml logs api | grep "Applying migration"`.

| Service | URL |
|---|---|
| Web app | http://localhost:5173 |
| API | http://localhost:5254/api/health |
| OpenAPI spec | http://localhost:5254/openapi/v1.json |
| Geo-Worker | http://localhost:8000/health |

Ports can be changed in `.env` (`API_PORT`, `FRONTEND_PORT`, `POSTGRES_PORT`, `REDIS_PORT`, `PYTHON_SERVICE_PORT`).

## 3. Warm up the database: Polish water network (OSM import)

The report uses the distance to the nearest river, ditch, lake or wetland. These come from OpenStreetMap. Without a
local copy the API asks the public Overpass API in the background, which is often overloaded: the first report of a
parcel then says *"water data is still loading"*. **Run the import once before a demo**, and refresh it monthly:

```bash
docker compose -f docker-compose.dev.yml run --rm osm-import
```

What it does (`scripts/import-osm-water.sh`, GDAL container):
1. Downloads the Geofabrik Poland extract (`poland-latest.osm.pbf`, ~2.1 GB) into the Docker volume `osm`. On later runs it
   downloads only if Geofabrik has a newer file.
2. Extracts waterways (`river`, `stream`, `canal`, `ditch`, `drain`) and areas (`natural=water`, `natural=wetland`) with
   `ogr2ogr`.
3. Upserts them into `hydro_features` (~1.3 million rows), drops the staging tables, records the extract date in
   `data_imports` and marks existing parcel profiles for a water re-check.

It takes about 8–10 minutes after the download. The API picks the import up on the next request; no restart is needed.

Check:
```bash
docker compose -f docker-compose.dev.yml exec postgres \
  psql -U postgres -d wodoplon -c "select feature_type, count(*) from hydro_features group by 1" \
                               -c "select * from data_imports"
```
Expected: four types (`Ditch` ≈ 540k, `River` ≈ 370k, `Lake` ≈ 320k, `Wetland` ≈ 78k) and one `osm_water` row.

## 4. Smoke test

```bash
# crops (5 items)
curl http://localhost:5254/api/crops

# analysis by cadastral parcel id
curl -X POST http://localhost:5254/api/analyze -H "Content-Type: application/json" \
  -d '{"dzialkaId":"041509_2.0004.437/3","cropId":"winter_wheat","targetDate":"2026-06-15"}'

# analysis by map click, English texts
curl -X POST http://localhost:5254/api/analyze -H "Content-Type: application/json" -H "Accept-Language: en" \
  -d '{"lat":53.0605,"lon":18.4410,"cropId":"winter_wheat","targetDate":"2026-06-15"}'

# saved report by link (use reportUuid from the answer)
curl http://localhost:5254/api/reports/<reportUuid>
```

What to expect:
* The first analysis of a new parcel takes about 10–20 s (live data from 5 sources); repeating it takes < 1 s.
* `step1_diagnosis.metrics` has `ndviMean`, `slopeDeg`, `sandPct`, `nearestWaterDistM` and `waterBalance10yrMedianMm`.
  A `null` there is honest missing data and is explained in `step4_sourcesAndLimitations.limitationsPl`.
* `satelliteStatus` is `OK` / `CLOUDY_FALLBACK` / `NO_DATA` (clouds) / `ERROR` (service down, retried on a later request).

## 5. Tests

```bash
# Backend unit tests
dotnet test src/backend/WodoPlon.slnx

# Geo-Worker tests (no network; external services are mocked)
cd src/python-service
pip install -r requirements-dev.txt
pytest
```

## 6. Production

```bash
cp .env.prod.example .env.prod          # set POSTGRES_DB, POSTGRES_USER, Cors__WebOrigin
mkdir secrets
# one value per file, no trailing newline:
#   secrets/db_password       <password>
#   secrets/db_connection     Host=postgres;Database=<POSTGRES_DB>;Username=<POSTGRES_USER>;Password=<password>
#   secrets/redis_password    <password>
#   secrets/redis_connection  redis:6379,password=<password>
```

Migrations are applied automatically **only in Development**. In production, apply them before the first start:

```bash
# 1. Start the database alone
docker compose -f docker-compose.prod.yml up -d postgres

# 2. Generate an idempotent SQL script (needs the .NET SDK and `dotnet tool install --global dotnet-ef`)
dotnet ef migrations script --idempotent --project src/backend/WodoPlon.Api -o migrate.sql

# 3. Apply it (safe to re-run after every update: applied migrations are skipped)
docker compose -f docker-compose.prod.yml exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < migrate.sql

# 4. Warm up the water network (once, then monthly)
docker compose -f docker-compose.prod.yml run --rm osm-import

# 5. Seed crops on the first start: add Database__RunSeed=true to .env.prod, then start everything
docker compose -f docker-compose.prod.yml up -d --build
```

The frontend is served by nginx on port `80` and proxies `/api` to the backend. The Geo-Worker is internal only.
The API trusts `X-Forwarded-For` only from loopback and private networks (Docker, LAN). Behind another proxy (e.g. a
cloud load balancer with a public address), list every trusted network in `.env.prod` — the list replaces the default:
`ForwardedHeaders__KnownNetworks__0=172.16.0.0/12`, `ForwardedHeaders__KnownNetworks__1=<proxy CIDR>`, …

Monthly refresh (cron or by hand): `docker compose -f docker-compose.prod.yml run --rm osm-import`.

## 7. External services

| Service | Used for | Without it |
|---|---|---|
| ULDK GUGiK | Parcel boundaries | No analysis (`404` / `500`) |
| Open-Meteo Archive | 10 years of weather | No analysis (`500`) |
| ISRIC SoilGrids | Soil texture | Average soil assumed, stated in the report |
| Geoportal NMT WCS | Slope | Runoff risk not assessed, retried on the next analysis |
| Sentinel-2 / Earth Search | NDVI, NDWI | Assessment without satellite correction (`NO_DATA` / `ERROR`) |
| Geofabrik (import) / Overpass (fallback) | Nearest water | "Water data still loading", retried |

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Report says water data is still loading | The OSM import was not run (section 3) and Overpass is overloaded. Run the import. |
| `429 Too Many Requests` | API rate limit: 10 analyses/min per client, 30/min per IP. Wait for `Retry-After`. Invalid requests do not count. |
| `500` with a weather message | Open-Meteo is down or the daily per-IP quota is used up (shared IPs at events). Try later or from another network. |
| `slopeDeg` is `null` | GUGiK NMT did not answer in time; the next analysis of the parcel asks again. |
| `satelliteStatus: ERROR` | Geo-Worker or Earth Search unavailable; check `docker compose logs python-service`. The next request (after ~1 min) retries. |
| API container stops after a code change in dev | `dotnet watch` hot reload failed; `docker compose -f docker-compose.dev.yml restart api`. |
| Start over with an empty database | `docker compose -f docker-compose.dev.yml down`, then `docker volume rm wodoplon-dev_pgdata`, then `up -d` and the import again. `down -v` also deletes the 2.1 GB OSM download. |
