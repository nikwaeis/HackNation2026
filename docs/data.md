# Database Architecture and Caching Strategy (PostgreSQL + PostGIS)

This document describes how data is stored, the caching policy and the split of work between **ASP.NET Core**
(orchestrator and storage owner) and the **Python Geo-Worker** (raster processing). The design keeps one parcel analysis
under **30 seconds** and keeps every data source traceable in the report.

The schema is owned by **EF Core migrations** (`src/backend/WodoPlon.Api/Data/Migrations`); in Development they are
applied automatically on API start. Enum columns are stored as their C# names (`River`, `Ok`, `NoData`, `High`, …);
the API converts them to `UPPER_SNAKE_CASE` on the wire.

---

## 1. Caching strategy: live data vs cache

| Level | Data | Sources | Lifetime | Handled by |
| :--- | :--- | :--- | :--- | :--- |
| **1. Preloaded** | Crop catalogue (Kc coefficients); Polish hydrography (rivers, ditches, lakes, wetlands) | FAO-56; OpenStreetMap (Geofabrik extract) | Crops: seeded on start (`DATABASE_RUNSEED`). Hydrography: bulk import, refreshed monthly ([setup.md](setup.md)) | PostgreSQL / PostGIS (`ST_Distance`) |
| **2. Forever cache** | Parcel boundaries (*działki*), terrain (slope), soil texture, nearest water | ULDK GUGiK, Geoportal NMT WCS, ISRIC SoilGrids, PostGIS | Forever after the first request per `dzialka_id`; missing terrain and unchecked water are filled on later requests | ASP.NET Core + Python (`rasterio`) |
| **3. Date-bound cache** | Weather aggregates for the 90-day window and the same window in 10 past years; satellite indices (NDVI, NDWI) | Open-Meteo Archive, Sentinel-2 Earth Search | Per `(dzialka_id, target_date)`: first request is live, later ones read the DB; satellite `Error` is retried | ASP.NET Core (weather) + Python (satellite) |
| **4. Reports** | Generated reports with conclusions, numbers and limitations | Internal decision engine | Forever, by `report_uuid` (shareable link, no account) | ASP.NET Core |
| **5. Request coalescing** | Outcome markers of in-flight fetches (`parcel:{id}`, `obs:{id}:{date}`, `point:{lat}:{lon}`) | — | 1 minute, HybridCache (memory + Redis) | ASP.NET Core |

---

## 2. Tables

### 2.1. Reference data and preloaded layers

#### `crops` — crop catalogue
Used for crop evapotranspiration (ETc = ET₀ × Kc) and the drought-sensitive periods.
* `id` (`varchar(50)`, PK) — crop code (`winter_wheat`, `maize`, `rapeseed`, `sugar_beet`, `potato`).
* `name_pl` (`varchar(100)`) — Polish name (*Pszenica ozima*, *Kukurydza*, …). English names live in the API resources.
* `kc_initial`, `kc_mid`, `kc_late` (`numeric(4,2)`) — crop coefficient before, in and after the critical months.
* `critical_months` (`int[]`) — months most sensitive to water shortage (e.g. `{5,6}`).
* `root_depth_cm` (`int`) — root zone depth.

Seed values: `winter_wheat` 0.40 / 1.15 / 0.30, `{5,6}`, 120 cm; `maize` 0.30 / 1.20 / 0.50, `{6,7,8}`, 130 cm;
`rapeseed` 0.40 / 1.15 / 0.35, `{4,5,6}`, 110 cm; `sugar_beet` 0.35 / 1.20 / 0.70, `{6,7,8}`, 100 cm;
`potato` 0.50 / 1.15 / 0.75, `{6,7}`, 60 cm. The seeder only inserts missing crops, so it is safe to leave on.

#### `hydro_features` — hydrography
Water objects for fast nearest-water search in PostGIS. ~1.3 million rows after the Poland import
(≈540k ditches, 370k rivers/streams/canals, 320k lakes, 78k wetlands; ~550 MB with indexes).
* `id` (`bigint` identity, PK)
* `osm_id` (`bigint`, unique, nullable) — OSM way id (positive) or relation id (negative, so they never clash).
* `feature_type` (`varchar(30)`) — `River` (river, stream, canal), `Ditch` (ditch, drain), `Lake` (natural=water),
  `Wetland`.
* `name` (`varchar(150)`, nullable).
* `geom` (`geometry(Geometry, 4326)`, GIST index) — line or polygon.

Filled by `scripts/import-osm-water.sh` (bulk) and, without the import, by the Overpass background lookup.

#### `data_imports` — bulk dataset versions (not an EF entity)
* `name` (`varchar(50)`, PK) — `osm_water`.
* `imported_at` (`timestamptz`) — when the import ran.
* `source_date` (`date`) — date of the OSM extract; shown in the report sources.

---

### 2.2. Parcel spatial cache

#### `parcels` — cadastral parcel boundaries
Geometry from **ULDK GUGiK**.
* `dzialka_id` (`varchar(64)`, PK) — official TERYT parcel id (e.g. `040101_1.0001.123/4`).
* `voivodeship` (`varchar(64)`, nullable).
* `area_ha` (`numeric(10,4)`) — area in hectares (`ST_Area(geom::geography)`).
* `centroid` (`geometry(Point, 4326)`) — point used for weather and soil queries.
* `geom` (`geometry(MultiPolygon, 4326)`, GIST index) — parcel polygon.
* `fetched_at` (`timestamptz`) — when ULDK was queried.

#### `parcel_static_profiles` — soil, terrain and water surroundings
Static natural characteristics from three sources: terrain (Python + Geoportal NMT), soil (ASP.NET + SoilGrids),
hydrology (PostGIS).
* `dzialka_id` (`varchar(64)`, PK, FK → `parcels.dzialka_id`, cascade delete)
* **Terrain (Geoportal NMT WCS)** — `null` until the Geo-Worker returns it; retried on later analyses:
  * `mean_slope_deg`, `max_slope_deg` (`numeric(5,2)`) — mean and max slope in degrees.
  * `steep_area_pct` (`numeric(5,2)`) — share of the area with slope > 3° (runoff risk).
* **Soil (ISRIC SoilGrids, 0–30 cm):**
  * `sand_pct`, `clay_pct`, `silt_pct` (`numeric(5,2)`) — texture (%).
  * `organic_carbon_g_kg` (`numeric(6,2)`) — soil organic carbon.
  * `awc_mm_per_m` (`numeric(6,2)`) — available water capacity (mm/m).
  * `soil_drought_vulnerability` (`varchar(20)`) — `Low`, `Medium`, `High`.
* **Hydrology (PostGIS `ST_Distance`, within 1000 m):**
  * `nearest_water_dist_m` (`numeric(10,2)`) — distance to the nearest water object.
  * `nearest_water_type` (`varchar(30)`) — `River`, `Ditch`, `Lake`, `Wetland`.
  * `water_checked_at` (`timestamptz`, nullable) — when the lookup ran; `null` = not looked up yet, the next analysis
    computes it (local import) or queues it (Overpass). The import script resets it so profiles pick up new data.
  * `water_data_date` (`date`, nullable) — date of the OSM data used.
* `fetched_at` (`timestamptz`) — when the profile was built.

---

### 2.3. Date-bound observations

#### `dynamic_observations` — 10 years of weather + satellite
Results of the live fetch for one `(parcel, analysis date)` pair.
* `id` (`bigint` identity, PK)
* `dzialka_id` (`varchar(64)`, FK → `parcels.dzialka_id`)
* `target_date` (`date`) — analysis date chosen by the user.
* *(unique index on `(dzialka_id, target_date)`)*
* **Weather (Open-Meteo archive):**
  * `precip_30d_mm`, `precip_90d_mm` (`numeric(7,2)`) — precipitation sums for 30 / 90 days before `target_date`.
  * `precip_10yr_avg_90d_mm` (`numeric(7,2)`) — 10-year mean precipitation for the same 90-day window.
  * `et0_90d_mm` (`numeric(7,2)`) — reference evapotranspiration sum for 90 days.
  * `dry_spell_days` (`int`) — longest run of days with < 1 mm of rain.
  * `window_months` (`jsonb`) — P and ET₀ per calendar month inside the 90-day window, for the target year and each of
    the 10 past years (`[{YearsBack, Month, PrecipMm, Et0Mm}]`). Kc depends only on the month, so ETc, the 10-year median
    balance and `historicalDroughtYears` are computed for any crop without a new Open-Meteo request.
* **Satellite (Sentinel-2 L2A Earth Search, ±15 days):**
  * `ndvi_mean`, `ndwi_mean` (`numeric(5,4)`, nullable) — mean indices over the polygon.
  * `satellite_scene_date` (`date`, nullable) — date of the scene used.
  * `cloud_cover_pct` (`numeric(5,2)`, nullable) — cloud cover over the parcel.
  * `satellite_status` (`varchar(30)`) — `Ok`, `CloudyFallback`, `NoData` (no usable scene), `Error` (service failed,
    retried on a later request).
* `fetched_at` (`timestamptz`) — when the external APIs were queried.

---

### 2.4. Reports (no accounts)

#### `saved_reports` — reports behind a public link
Lets a farmer open or forward a report without an account or any personal data.
* `report_uuid` (`uuid`, PK, UUID v7 generated by the API) — public id for `GET /api/reports/{uuid}`.
* `dzialka_id` (`varchar(64)`, FK → `parcels.dzialka_id`, restrict delete)
* `crop_id` (`varchar(50)`, FK → `crops.id`, restrict delete)
* `target_date` (`date`)
* `water_deficit_level` (`varchar(20)`) — `Low`, `Moderate`, `High`, `Critical`.
* `report_payload` (`json`) — the full report exactly as returned by `POST /api/analyze` (steps 1–4), in the language it
  was created in. `json` rather than `jsonb` keeps the text as written, so the report is returned byte for byte.
* `created_at` (`timestamptz`)

---

## 3. Migrations

| Migration | Content |
|---|---|
| `InitialCreate` | All tables above except later additions |
| `HydroFeatureOsmId` | `hydro_features.osm_id` + unique index (dedupe of shared OSM ways) |
| `ObservationWindowMonths` | `dynamic_observations.window_months` |
| `WaterCheckedAtAndReportJson` | `water_checked_at`; `report_payload` `jsonb` → `json`; resets satellite data stored before the Geo-Worker contract and NDVI fixes to `Error` so it is recomputed |
| `LocalWaterImport` | `water_data_date`; `data_imports` table |

Production: migrations are not applied automatically outside Development — apply them before the first start
(see [setup.md](setup.md)).

---

## 4. Security and privacy

* **No personal data (PII):** no names, phone numbers, e-mails or accounts are stored. A report is identified only by the
  public cadastral parcel number (*działka ewidencyjna*) and the generated `report_uuid`.
* **Honest uncertainty:** `satellite_status`, `water_checked_at` and the nullable terrain / soil columns record missing
  data, so the report states it in its limitations instead of showing false precision.
