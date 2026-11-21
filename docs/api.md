# API, Data Flow and Algorithm Specification

**Project:** Digital water assistant for farmers (*Zatrzymaj wodę, chroń plony*)  
**Track:** KOWR — HackNation 2026  
**Stack:** ASP.NET Core (core API and orchestrator) + Python FastAPI (Geo-Worker) + PostgreSQL/PostGIS + Redis + React/TypeScript

How to run the project: [setup.md](setup.md). Geo-Worker contract: [api_asp_net_core_python_fastapi.md](api_asp_net_core_python_fastapi.md).
Data model: [data.md](data.md).

---

## 1. Architecture

The system is a small set of services in one Docker Compose file. It is public: no user accounts and no personal data (PII).

### Responsibilities
1. **Frontend (React + TypeScript):** takes the user input (cadastral parcel id or a click on the map, crop, analysis date),
   shows an interactive map with the EDO drought WMS layer and renders the report with PDF export.
2. **Core backend (ASP.NET Core):** the orchestrator. Receives frontend requests, manages the PostgreSQL/PostGIS cache,
   calls the text/JSON APIs (ULDK, Open-Meteo, SoilGrids) in parallel, delegates raster work to the Python Geo-Worker,
   runs the agronomic algorithm and stores finished reports.
3. **Geo-Worker (Python FastAPI):** stateless service without its own database. Receives the parcel polygon (GeoJSON) and
   the target date from ASP.NET Core, reads only the needed part of the rasters (Sentinel-2 scenes and the NMT terrain model)
   and returns aggregated numbers.
4. **Database (PostgreSQL 17 + PostGIS 3.5):** crop catalogue, Polish hydrography (OSM import), forever cache of static
   parcel characteristics, per-date cache of dynamic observations, generated reports.
5. **Redis 7:** per-client rate limiting and the shared layer of HybridCache (request coalescing). Optional: without it the
   API keeps working (rate limiting fails open, HybridCache falls back to memory).

### Time budget (≤ 30 seconds, KOWR requirement)
* A repeated request for the same `(dzialka_id, target_date)` is served from PostGIS in **< 1 s**.
* On the first request for a new parcel, static data (boundary, terrain, soil, distance to water) is computed once and
  cached forever; external calls (Open-Meteo, SoilGrids, Geo-Worker) run **in parallel**. A full first analysis measured
  **11–17 s**.
* Concurrent first requests for the same parcel (or parcel + date, or the same map point) are coalesced through
  HybridCache: each external API is called once.

---

## 2. Data and external sources

The system combines **5 mandatory categories** of open data at request time (no hard-coded stubs):

| Category | Source / service | Handled by | Extracted parameters | Refresh |
| :--- | :--- | :--- | :--- | :--- |
| **1. Spatial (boundaries and terrain)** | **ULDK GUGiK** (`uldk.gugik.gov.pl`) and **Geoportal.gov.pl** (NMT WCS) | ASP.NET (boundaries) + Python (terrain) | Parcel polygon, voivodeship, area (ha), mean and max slope (°), share of area with slope > 3°. | Static cache in PostGIS (forever) |
| **2. Weather** | **Open-Meteo Archive API** (`archive-api.open-meteo.com`) | ASP.NET Core | Daily precipitation (P, mm) and reference evapotranspiration (ET₀, mm) for the 90-day window and the same window in each of the **10 previous years**. | Live on first request, then cached per `(dzialka_id, target_date)` |
| **3. Satellite** | **Sentinel-2 L2A, Earth Search** (`earth-search.aws.element84.com/v1`) | Python FastAPI | Bands B04 (red), B08 (NIR), B11 (SWIR1) and the SCL cloud mask within ±15 days of `targetDate`; mean **NDVI** and **NDWI**. | Live on first request, then cached per `(dzialka_id, target_date)`; failed fetches are retried |
| **4. Soil** | **ISRIC SoilGrids v2.0** (`rest.isric.org/soilgrids/v2.0`) | ASP.NET Core | Sand, clay, silt and soil organic carbon (SOC, g/kg) in the 0–30 cm layer. | Static cache in PostGIS (forever) |
| **5. Hydrology** | **OpenStreetMap** (Geofabrik Poland extract imported into PostGIS; Overpass API as fallback) + **Copernicus EDO WMS** | PostGIS + frontend | Distance (`ST_Distance`, m) to the nearest river, drainage ditch, lake or wetland; EDO drought background layer on the map. | Monthly import into PostGIS + live WMS on the map |

The official hydrography of Wody Polskie (MPHP10k WFS) and the GUGiK BDOT10k WFS were evaluated: their per-feature
queries require a login (MPHP) or serve only whole-county archives (BDOT10k), so OSM is used.

---

## 3. Public API endpoints

All endpoints are under `/api`. Errors use RFC 9110 problem details; messages follow `Accept-Language` (`pl` default, `en`).

| Method | Endpoint | Rate limit | Description |
|---|---|---|---|
| `GET` | `/api/health` | 60/min | Health check: `{"status":"ok"}` |
| `GET` | `/api/crops` | 60/min | Crop catalogue |
| `POST` | `/api/analyze` | 10/min per client fingerprint, 30/min per IP | Analyze a parcel |
| `GET` | `/api/reports/{reportUuid}` | 60/min | Saved report (shareable link) |

Exceeding a limit returns `429 Too Many Requests` with a `Retry-After` header. Invalid requests (`400` from validation)
do not count against the limit.

### 3.1. Crop catalogue
`GET /api/crops`  
Returns the supported crops with their FAO-56 parameters for the frontend drop-down.

**Response example (`200 OK`):**
```json
[
  {
    "id": "winter_wheat",
    "namePl": "Pszenica ozima",
    "kcMid": 1.15,
    "criticalMonths": [5, 6],
    "rootDepthCm": 120
  },
  {
    "id": "maize",
    "namePl": "Kukurydza",
    "kcMid": 1.20,
    "criticalMonths": [6, 7, 8],
    "rootDepthCm": 130
  }
]
```

### 3.2. Analyze a parcel (main endpoint)
`POST /api/analyze`  
Takes a cadastral parcel id OR the coordinates of a map click, the crop and the analysis date (today or any date in the
last 10 years).

**Request:**
```json
{
  "dzialkaId": "040101_1.0001.123/4",
  "lat": null,
  "lon": null,
  "cropId": "winter_wheat",
  "targetDate": "2026-07-15"
}
```
*(For a map click `dzialkaId` is `null` and `lat` / `lon` hold WGS 84 coordinates.)*

**Response (`200 OK`)** — the structure follows the mandatory KOWR order of steps. Text fields keep the `*Pl` suffix for
contract compatibility, but their language follows `Accept-Language` (`pl` or `en`):
```json
{
  "reportUuid": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "parcelInfo": {
    "dzialkaId": "040101_1.0001.123/4",
    "voivodeship": "kujawsko-pomorskie",
    "areaHa": 14.52,
    "cropId": "winter_wheat",
    "cropNamePl": "Pszenica ozima",
    "targetDate": "2026-07-15",
    "polygonGeoJson": {
      "type": "MultiPolygon",
      "coordinates": [[[[18.007, 53.123], [18.009, 53.123], [18.009, 53.125], [18.007, 53.123]]]]
    }
  },
  "step1_diagnosis": {
    "riskLevel": "HIGH",
    "summaryPl": "Wysokie ryzyko suszy rolniczej. Bilans wodny uprawy za ostatnie 90 dni wynosi -196.6 mm wobec typowego dla tego miejsca -95.0 mm (mediana 10 lat): opady 98.4 mm wobec potrzeb uprawy 295.0 mm (Pszenica ozima).",
    "historicalContextPl": "W ciągu ostatnich 10 lat sezony wyraźnie suchsze od typowych (bilans o ponad 50 mm gorszy od mediany) wystąpiły w tym okresie 3 razy.",
    "metrics": {
      "precip90dMm": 98.4,
      "precip10yrAvg90dMm": 182.0,
      "waterBalanceMm": -196.6,
      "drySpellDays": 24,
      "historicalDroughtYears": 3,
      "ndviMean": 0.41,
      "ndwiMean": -0.18,
      "slopeDeg": 4.2,
      "sandPct": 74.0,
      "nearestWaterDistM": 85.0,
      "waterBalance10yrMedianMm": -95.0
    }
  },
  "step2_causesAndRetention": {
    "causesPl": [
      "Niskie opady (98.4 mm wobec normy 182.0 mm) oraz 24 dni bez opadów.",
      "Gleba lekka, piaszczysta (74% piasku) o niskiej pojemności wodnej.",
      "Nachylenie terenu (4.2°) przyspiesza spływ powierzchniowy."
    ],
    "retentionRecommendationsPl": [
      {
        "type": "LANDSCAPE",
        "title": "Zastawki na rowie melioracyjnym (85 m od działki)",
        "description": "Spowolnienie odpływu wody w pobliskim rowie podniesie poziom wód gruntowych w strefie korzeniowej."
      },
      {
        "type": "SOIL",
        "title": "Międzyplony i uprawa bezorkowa",
        "description": "Międzyplony i ograniczenie orki zwiększą zawartość próchnicy (obecnie niska: 11.2 g/kg) i pojemność wodną gleby."
      }
    ]
  },
  "step3_irrigation": {
    "isRecommended": true,
    "advicePl": "Nawadnianie interwencyjne uzasadnione w krytycznym okresie wzrostu: jednorazowa dawka 24 mm (240 m³/ha), podawana rano lub wieczorem, wyłącznie po wdrożeniu zabiegów ograniczających parowanie.",
    "doseMm": 24
  },
  "step4_sourcesAndLimitations": {
    "sources": [
      "ULDK GUGiK (granice działki ewidencyjnej)",
      "Open-Meteo Archive API (dane meteorologiczne 2016–2026)",
      "FAO-56 (zapotrzebowanie uprawy na wodę ETc = ET0 × Kc)",
      "Sentinel-2 L2A Earth Search (zdjęcie z dnia 2026-07-12, zachmurzenie 5%)",
      "ISRIC SoilGrids v2.0 (skład granulometryczny gleby, rozdzielczość 250 m)",
      "Geoportal NMT WCS (numeryczny model terenu)",
      "OpenStreetMap (cieki, rowy i zbiorniki wodne, stan danych na 2026-11-21)"
    ],
    "limitationsPl": [
      "Dane glebowe SoilGrids mają rozdzielczość 250 m i mogą nie uwzględniać lokalnych zabiegów agrotechnicznych.",
      "Analiza nie uwzględnia aktualnego poziomu wód gruntowych w studniach lokalnych."
    ],
    "satelliteStatus": "OK"
  }
}
```

`riskLevel`: `LOW` | `MODERATE` | `HIGH` | `CRITICAL`. `satelliteStatus`: `OK` | `CLOUDY_FALLBACK` | `NO_DATA` (no
cloud-free scene) | `ERROR` (satellite service failed; asked again on a later request). Retention `type`: `LANDSCAPE` | `SOIL`.

**Errors:**

| Status | When |
|---|---|
| `400` | Validation: no parcel id and no full `lat`+`lon`, coordinates out of range, missing crop, date in the future or more than 10 years back, malformed JSON, malformed parcel id. Validation errors are keyed by the request field name (`dzialkaId`, `cropId`, `targetDate`, `lat`, `lon`). |
| `404` | Unknown crop; parcel not found in ULDK (e.g. a click outside Poland or on water / a road) — *«Nie znaleziono działki ewidencyjnej dla wskazanej lokalizacji»*. |
| `415` | Body is not `application/json`. |
| `429` | Rate limit exceeded (`Retry-After`). |
| `500` | Weather archive or ULDK unavailable (localized message, no stack trace) — the only sources without which no honest report is possible. |

### 3.3. Saved report by link
`GET /api/reports/{reportUuid}`  
Returns a stored report from `saved_reports`, byte for byte identical to the `POST /api/analyze` response it came from
(including its language). Lets users share and keep a report without an account. Unknown id or non-GUID → `404`.

### 3.4. Internal Geo-Worker contract (ASP.NET Core → Python FastAPI)
`POST http://python-service:8000/extract-geo` — see [api_asp_net_core_python_fastapi.md](api_asp_net_core_python_fastapi.md),
section 2. In short: the request carries `dzialka_id`, `target_date`, `include_terrain` and the GeoJSON `geometry`; the
response has a `terrain` section (slope metrics, `null` when `include_terrain=false`) and a `satellite` section (NDVI,
NDWI, scene date, cloud cover, status). `include_terrain` is `false` when the terrain is already cached for the parcel.

---

## 4. Algorithm

The algorithm follows the KOWR scientific materials (FAO-56 method, IUNG-PIB drought monitoring and the principle
*"retain water where it falls"*).

### Step 0. Parcel identification and spatial reference
1. With `lat` and `lon`, ULDK `GetParcelByXY` returns the official `dzialkaId` (clicks on the same spot, ≈1 m, share one
   lookup).
2. The parcel is looked up in `parcels`. If it is missing:
   * the geometry is fetched from ULDK (`GetParcelById`, SRID 4326);
   * PostGIS computes the area (`ST_Area(geom::geography) / 10000`) and the centroid;
   * the soil profile is fetched from SoilGrids;
   * `ST_Distance` against `hydro_features` gives the distance in metres and the type of the nearest water object
     (`River`, `Ditch`, `Lake`, `Wetland`) within 1000 m.

### Step 1. Water situation (diagnosis)
Weather, soil and satellite indicators are combined for the 90 days before `targetDate`:

1. **Crop water need (ETc) by FAO-56:**
   $$ET_{c,90} = \sum_{i=1}^{90} \left( ET_{0,i} \times K_c(m_i) \right)$$
   where $ET_{0,i}$ is the reference evapotranspiration of day $i$ from Open-Meteo and $K_c(m_i)$ is the crop coefficient
   for month $m_i$ (mid-season value in the crop's critical months, initial before them, late after them).

2. **Crop climatic water balance ($WB_{90}$):**
   $$WB_{90} = P_{90} - ET_{c,90}$$
   where $P_{90}$ is the precipitation sum (mm) in the 90 days before `targetDate`.

3. **Available water capacity of the soil (AWC)** from texture (`sand_pct`, `clay_pct`) and organic carbon (`soc`):
   * $\text{sand\_pct} > 65\%$ — light sandy soil, highly vulnerable to drought (AWC ≈ 70–90 mm/m);
   * $\text{clay\_pct} > 30\%$ — heavy soil (AWC ≈ 160–190 mm/m);
   * low humus ($\text{soc} < 15$ g/kg) lowers the retention factor by 15%.

4. **Satellite indices** (computed in Python over cloud-free pixels inside the polygon, SCL mask):
   $$\text{NDVI} = \frac{B08 - B04}{B08 + B04}, \quad \text{NDWI} = \frac{B08 - B11}{B08 + B11}$$
   * $\text{NDWI} < -0.10$ in the growing season confirms water stress of the canopy.

5. **10-year history:**
   $WB_{90}^{(y)}$ is computed for the same calendar window in each of the 10 previous years. The parcel's norm is their
   median $\widetilde{WB}_{90}$ (`waterBalance10yrMedianMm`). `historicalDroughtYears` is the number of years with
   $WB_{90}^{(y)} - \widetilde{WB}_{90} < -50$ mm (a season clearly drier than usual for this place).

6. **Risk level (`riskLevel`)** — hybrid scale (KOWR: tell a current drought apart from a place that is dry by climate),
   with the anomaly $\Delta = WB_{90} - \widetilde{WB}_{90}$:
   * **`CRITICAL`:** $WB_{90} < -180$ mm AND ($\text{drySpellDays} \ge 21$ OR $\text{NDWI} < -0.15$) — absolute threshold.
   * **`HIGH`:** $\Delta < -50$ mm OR ($\Delta < -35$ mm on sandy soil, $\text{sand\_pct} > 65\%$) OR $WB_{90} < -180$ mm
     without confirmation.
   * **`MODERATE`:** $\Delta < -20$ mm OR `historicalDroughtYears` $\ge 5$ OR $\text{NDWI} < -0.10$.
   * **`LOW`:** otherwise.
   * With no past years in the archive, absolute thresholds are used: `HIGH` at $WB_{90} < -110$ mm (sand: $< -90$),
     `MODERATE` at $WB_{90} < -40$ mm.

### Step 2. Causes and retention recommendations (priority)
Recommendations come only from triggered causes (deterministic rule engine, texts from resource templates, no LLM):

* **Trigger 1: weather deficit** ($P_{90} < 0.75 \times P_{\text{10yr\_avg}}$ or $\text{drySpellDays} \ge 14$)
  * *Cause:* long period without rain and high evaporation.
  * *Measure (soil retention):* mulching and leaving crop residues (*pozostawienie resztek pożniwnych*) to cut
    unproductive evaporation from the soil surface.
* **Trigger 2: low soil water capacity** ($\text{sand\_pct} > 65\%$ or $\text{soc} < 15$ g/kg)
  * *Cause:* light texture and low humus let water drain below the root zone quickly.
  * *Measure (soil retention):* cover crops (*międzyplony*) and no-till farming (*uprawa bezorkowa*) to build organic matter.
* **Trigger 3: surface runoff from the slope** ($\text{mean\_slope\_deg} > 3.0°$ or $\text{steep\_area\_pct} > 25\%$)
  * *Cause:* a steep slope makes heavy rain run off the field.
  * *Measure (landscape and agrotechnical retention):* cross-slope tillage (*uprawa poprzeczna do stoku*), grass buffer
    strips (*strefy buforowe*) and small ponds at the foot of the slope.
* **Trigger 4: nearby drainage network** ($\text{nearest\_water\_type} = \text{Ditch}$ and
  $\text{nearest\_water\_dist\_m} \le 300$ m)
  * *Cause:* a drainage ditch next to the field speeds up groundwater outflow.
  * *Measure (landscape retention):* adjustable weirs on the ditch (*zastawki na rowach melioracyjnych*) to hold the
    spring runoff.

Landscape measures are listed before soil measures. When nothing is triggered, the report says so and suggests keeping
the plant cover.

### Step 3. Irrigation advice (last resort)
Irrigation is recommended (`isRecommended = true`) **only when all three conditions hold**:
1. The risk level is `HIGH` or `CRITICAL`.
2. `targetDate` falls in the crop's critical months (`criticalMonths`) or $\text{NDWI} < -0.15$.
3. Retention measures cannot offset the current deficit right away (always true: they work over seasons).

**Dose:**
$$D_{\text{irrig}} = \min\left( 35,\; \max\left( 15,\; 0.3 \times AWC_{\text{root}} \right) \right)\text{ [mm]}$$
applied in the morning or evening to limit evaporation (15–35 mm, i.e. 150–350 m³/ha). Otherwise `isRecommended = false`
with an explanation that keeping soil water comes first.

### Step 4. Sources and honest limitations
The last block of the report always lists:
* the APIs used and the data dates (including the actual Sentinel-2 scene date and cloud cover, and the OSM data date);
* dynamic limitations, for example:
  * `NO_DATA` (no cloud-free scene within ±15 days): the assessment uses weather and soil models without satellite correction;
  * `ERROR` (satellite service unavailable): same, and the data will be fetched again on the next analysis;
  * missing soil, terrain or water data, the weather archive delay for the last days;
  * the 250 m resolution of SoilGrids and the absence of groundwater measurements on the parcel.

---

## 5. Failure handling and resilience

So that the prototype works for the jury on any Polish parcel and any date in the last 10 years:
1. **Timeouts:** 8 s for ULDK / Open-Meteo / SoilGrids, 18 s for the Geo-Worker (its own per-module budget is 12 s; GUGiK
   NMT gets two 5 s attempts because it sometimes hangs a single request).
2. **Hydrography:** primary source is the OSM extract imported into `hydro_features` by `scripts/import-osm-water.sh`
   (see [setup.md](setup.md)); the nearest water is computed synchronously and is in the first report, with the data date
   in `sources`. Without the import, Overpass is called in the background (`HydroBackgroundService`, 30 s timeout, mirror
   list); until water is found, `limitationsPl` says the data is still loading and the lookup is retried on the next analysis.
3. **Request coalescing:** concurrent first requests for one parcel / parcel + date / map point share one set of external
   calls (HybridCache). Failures are not cached.
4. **Graceful degradation:** when an optional source (SoilGrids, Sentinel-2, NMT, Overpass) is down or has no data for
   the date / point, the API does not return `500`; it uses average soil parameters or skips the satellite correction
   and always states it in `limitationsPl`. Satellite `ERROR` and missing terrain are retried on later requests (at most
   once a minute).
5. **Coordinate validation:** a click outside Poland or on an object without a cadastral number in ULDK returns a clear
   `404 Not Found` (*«Nie znaleziono działki ewidencyjnej dla wskazanej lokalizacji»*).
6. **Language:** report texts follow `Accept-Language` (`pl` default, `en`); the stored report keeps its language.
