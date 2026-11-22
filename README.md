<div align="center">

# 🌾💧 WodoPlon

**Cyfrowy asystent wodny dla rolników · Digital water assistant for farmers**

*KOWR — „Zatrzymaj wodę, chroń plony” · HackNation 2026*

![.NET](https://img.shields.io/badge/.NET-10-512BD4?logo=dotnet&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![PostGIS](https://img.shields.io/badge/PostGIS-3.5-336791?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-Apache--2.0-green)
![API keys](https://img.shields.io/badge/API%20keys-none%20needed-brightgreen)

**[🇵🇱 Polski](#-polski)** · **[🇬🇧 English](#-english)**

</div>

---

# 🇵🇱 Polski

## ⚡ TL;DR dla jury

Potrzebny jest tylko **Docker z Compose v2**. Bez kluczy API, kont i logowania.

```bash
git clone https://github.com/nikwaeis/HackNation2026.git && cd HackNation2026

# 1. Plik .env z włączonym ładowaniem listy upraw
sed 's/DATABASE_RUNSEED=false/DATABASE_RUNSEED=true/' .env.example > .env

# 2. Budowa i start (pierwsza budowa: kilka minut)
docker compose -f docker-compose.dev.yml up -d --build

# 3. Czekamy, aż API odpowie {"status":"ok"}
curl http://localhost:5254/api/health

# 4. (Zalecane przed demo) import sieci wodnej Polski z OSM: ~2,1 GB pobierania, ~10 min
docker compose -f docker-compose.dev.yml run --rm osm-import
```

Następnie otwórz **http://localhost:5173** 🎉

> [!TIP]
> **Szybki test:** wpisz identyfikator działki `041509_2.0004.437/3` (albo kliknij pole na mapie), wybierz
> *Pszenica ozima*, datę `2026-06-15` i kliknij „Analizuj”. Pierwsza analiza nowej działki trwa ok. **10–20 s**
> (dane na żywo z 5 źródeł), każda kolejna **< 1 s** (cache).

## 📖 Spis treści

- [Czym jest WodoPlon](#-czym-jest-wodoplon)
- [Funkcje](#-funkcje)
- [Uruchomienie krok po kroku](#-uruchomienie-krok-po-kroku)
- [Ważne niuanse](#%EF%B8%8F-ważne-niuanse)
- [Rozwiązywanie problemów](#-rozwiązywanie-problemów)
- [Testy](#-testy)
- [Architektura](#%EF%B8%8F-architektura)
- [Źródła danych](#%EF%B8%8F-źródła-danych)
- [Ograniczenia](#-ograniczenia)
- [Skalowanie i bezpieczeństwo](#-skalowanie-i-bezpieczeństwo)
- [Użycie AI](#-użycie-ai)

## 🌱 Czym jest WodoPlon

Rolnik wybiera działkę (identyfikator TERYT lub kliknięcie na mapie), uprawę i datę analizy (dziś lub do 10 lat
wstecz). WodoPlon łączy otwarte dane przestrzenne, meteorologiczne, satelitarne, glebowe i hydrologiczne i tworzy
**zrozumiały raport (PL / EN)**: bieżąca sytuacja wodna i 10-letnia historia suszy, przyczyny, priorytetowe działania
retencyjne, nawadnianie jako ostateczność oraz pełne źródła danych z niepewnością i ograniczeniami.

**Bez logowania · bez danych osobowych · bez płatnych API · bez LLM w trakcie działania.**

## ✨ Funkcje

- 🗺️ **Wybór działki bez GIS** — identyfikator (np. `141611_2.0018.103`) lub kliknięcie na mapie. Granice z ULDK
  GUGiK, ostrzeżenie EGiB/TERYT przy działce nierolnej (zabudowa, las, droga, woda).
- 🌾 **5 upraw** (pszenica ozima, kukurydza, rzepak ozimy, burak cukrowy, ziemniak) ze współczynnikami FAO-56,
  dowolna data do 10 lat wstecz.
- 📋 **4-etapowy raport KOWR** (ścisła kolejność):
  1. **Ocena sytuacji wodnej** — 90-dniowy bilans FAO-56 (`P − Kc·ET₀`) vs. 10-letnia mediana działki, opady vs.
     norma, najdłuższa susza, częstość suszy, NDVI/NDWI z Sentinel-2, gleba/spadek/woda, wskaźnik *„Wiarygodność oceny”*.
  2. **Przyczyny i rekomendacje retencyjne** — najpierw retencja krajobrazowa (zastawki na rowach, uprawa w
     poprzek stoku, strefy buforowe), potem glebowa (mulczowanie, resztki pożniwne, międzyplony, uprawa uproszczona).
  3. **Nawadnianie (ostateczność)** — tylko przy ryzyku `HIGH`/`CRITICAL` w krytycznych miesiącach (lub `NDWI < −0,15`),
     z dawką `15–35 mm` (`150–350 m³/ha`).
  4. **Źródła i ograniczenia** — dokładne źródła, daty scen, zachmurzenie; brak danych to *„Brak danych”*, nie fikcja.
- 🔗 **Link do raportu** (`/report/{reportUuid}`), 🖨️ druk / PDF, 📱 widok mobilny, 🌐 PL/EN, 🌓 tryb *Kontrast*.
- 🛰️ **Warstwy mapy** — OSM, ortofotomapa Geoportalu, granice działek KIEG, susza Copernicus EDO (CDI), rowy i pola
  z OSM, strzałki spływu na stokach.

## 🚀 Uruchomienie krok po kroku

### Wymagania

| | |
|---|---|
| 🐳 Docker | Docker Desktop / Engine z Compose v2 (`docker compose version`) |
| 💾 Dysk | ~6 GB: obrazy ~2 GB, ekstrakt OSM 2,1 GB, baza ~0,7 GB po imporcie |
| 🌐 Sieć | Wychodzący HTTPS do publicznych serwisów danych; najlepiej własne IP (Open-Meteo i Overpass limitują per IP) |
| 🔧 Opcjonalnie | .NET 10 SDK, Python 3.11, Node.js 22 — tylko do testów / uruchamiania bez Dockera |

### Adresy po starcie

| Serwis | URL |
|---|---|
| 🖥️ Aplikacja | http://localhost:5173 |
| ❤️ Health API | http://localhost:5254/api/health |
| 📜 OpenAPI | http://localhost:5254/openapi/v1.json |
| 🐍 Geo-Worker | http://localhost:8000/health |

### Test API przez curl

```bash
curl http://localhost:5254/api/crops     # 5 upraw

curl -X POST http://localhost:5254/api/analyze -H "Content-Type: application/json" \
  -d '{"dzialkaId":"041509_2.0004.437/3","cropId":"winter_wheat","targetDate":"2026-06-15"}'

# po współrzędnych, teksty po angielsku
curl -X POST http://localhost:5254/api/analyze -H "Content-Type: application/json" -H "Accept-Language: en" \
  -d '{"lat":53.0605,"lon":18.4410,"cropId":"winter_wheat","targetDate":"2026-06-15"}'

curl http://localhost:5254/api/reports/<reportUuid>   # zapisany raport
```

`cropId`: `winter_wheat` · `maize` · `rapeseed` · `sugar_beet` · `potato`

### Tylko frontend (bez backendu)

```bash
cd src/frontend && npm install && npm run dev
```

Gdy backend jest niedostępny, przycisk **„Zobacz przykładowy raport”** pokazuje oznaczony raport demonstracyjny.

### Przydatne komendy

```bash
docker compose -f docker-compose.dev.yml logs -f api   # logi API
docker compose -f docker-compose.dev.yml down          # stop
docker compose -f docker-compose.dev.yml down -v       # stop + usunięcie bazy I pobranego OSM (2,1 GB)
```

Produkcja (nginx, Docker secrets, ręczne migracje): **[`docs/setup.md`](docs/setup.md#6-production)**.

## ⚠️ Ważne niuanse

> [!IMPORTANT]
> **`DATABASE_RUNSEED=true`** w `.env` jest potrzebne przy pierwszym starcie — inaczej lista upraw jest pusta.
> Komenda `sed` z TL;DR ustawia to automatycznie. Można zostawić włączone (dodaje tylko brakujące uprawy).

> [!IMPORTANT]
> **Import OSM (`osm-import`)** nie jest wymagany, ale bardzo zalecany przed demo. Bez niego odległość do wody
> jest pobierana w tle z publicznego Overpass API, który bywa przeciążony — raport pokaże wtedy
> *„dane o wodzie wciąż się ładują”*. Po imporcie API korzysta z niego od razu, bez restartu.

> [!WARNING]
> **Limity zewnętrznych serwisów:** Open-Meteo i Overpass limitują per IP. Na wspólnej sieci (np. Wi-Fi na
> wydarzeniu) dzienny limit może się wyczerpać → `500` z komunikatem o pogodzie. Pomaga inna sieć (np. hotspot).

- ⏱️ **Czasy:** pierwsza analiza działki 10–20 s (zimny start do < 30 s), powtórka < 1 s.
- 🚦 **Limit API:** 10 analiz/min na klienta, 30/min na IP → `429` z `Retry-After`. Błędne żądania się nie liczą.
- 📅 **Ostatnie dni:** archiwum Open-Meteo ma ~5 dni opóźnienia — data z tego okna jest oznaczana w raporcie.
- 🛰️ **Satelita:** `satelliteStatus` = `OK` / `CLOUDY_FALLBACK` / `NO_DATA` (chmury) / `ERROR` (ponowienie przy kolejnym żądaniu).
- `null` w metrykach to **uczciwy brak danych**, wyjaśniony w kroku 4 raportu.
- 🔍 **Mapa:** granice działek GUGiK rysują się dopiero od **zoomu 17**; siatka suszy EDO ma ~5 km.
- 🔌 Porty zmienisz w `.env`: `API_PORT`, `FRONTEND_PORT`, `POSTGRES_PORT`, `REDIS_PORT`, `PYTHON_SERVICE_PORT`.
- 🧩 Migracje bazy uruchamiają się same **tylko w Development** (produkcja: [`docs/setup.md`](docs/setup.md#6-production)).

## 🩺 Rozwiązywanie problemów

| Objaw | Przyczyna / rozwiązanie |
|---|---|
| Lista upraw jest pusta | Brak `DATABASE_RUNSEED=true` w `.env` → popraw i `docker compose -f docker-compose.dev.yml up -d` |
| „Dane o wodzie wciąż się ładują” | Nie wykonano importu OSM, Overpass przeciążony → uruchom `osm-import` |
| `429 Too Many Requests` | Limit API — odczekaj `Retry-After` |
| `500` z komunikatem o pogodzie | Open-Meteo niedostępne lub wyczerpany limit IP → spróbuj później / z innej sieci |
| Import OSM pada na kroku 1/4 (`404`, `502`, zawieszenie) | Geofabrik nie opublikował jeszcze najnowszego pliku; skrypt próbuje 3 poprzednich dni. Ponów później lub podaj `-e PBF_URL=https://download.geofabrik.de/europe/poland/poland-YYMMDD.osm.pbf` |
| `slopeDeg: null` | GUGiK NMT nie odpowiedział na czas — kolejna analiza ponowi |
| `satelliteStatus: ERROR` | Geo-Worker / Earth Search niedostępny → `docker compose -f docker-compose.dev.yml logs python-service` |
| Kontener API staje po zmianie kodu | Hot reload `dotnet watch` padł → `docker compose -f docker-compose.dev.yml restart api` |
| Port zajęty | Zmień port w `.env` (np. `FRONTEND_PORT=5174`) |
| Czysta baza od zera | `down`, `docker volume rm wodoplon-dev_pgdata`, `up -d`, import ponownie |

## 🧪 Testy

```bash
dotnet test src/backend/WodoPlon.slnx                                  # backend (xUnit)
cd src/python-service && pip install -r requirements-dev.txt && pytest  # Geo-Worker (bez sieci)
cd src/frontend && npm install && npm test                             # frontend (Vitest)
cd src/frontend && npm run test:e2e                                    # E2E Playwright (żywe ULDK/GUGiK)
```

Testy sprawdzają: matematykę FAO-56 i bilansu, progi `LOW`/`MODERATE`/`HIGH`/`CRITICAL`, wszystkie 4 wyzwalacze
retencji, kolejność krajobraz → gleba, warunki i dawkę nawadniania, coalescing żądań, teksty PL/EN, degradację przy
awariach API, NDVI/NDWI i maskę chmur, parsowanie WKT, kolejność 4 etapów raportu, widok mobilny i druk.
Zrzuty E2E: `src/frontend/e2e-results/screens/` (`E2E_ALL_BROWSERS=1` → także Firefox/WebKit).

## 🏗️ Architektura

```
React (Leaflet) ──/api──► ASP.NET Core API ──► PostgreSQL 17 + PostGIS 3.5 (cache, uprawy, hydro, raporty)
                ──/uldk─►  (orkiestrator)  ──► Redis 7 (rate limiting, HybridCache)
                                           ──► Python Geo-Worker (NMT + Sentinel-2)
                                           ──► ULDK, Open-Meteo, SoilGrids, Overpass (fallback)
```

| Komponent | Ścieżka | Stack |
|---|---|---|
| Frontend | `src/frontend/` | React 19, TypeScript, Vite, Tailwind 4, Leaflet |
| Backend API | `src/backend/` | .NET 10 Minimal API, EF Core, NetTopologySuite, CQRS |
| Geo-Worker | `src/python-service/` | Python 3.11, FastAPI, rasterio, shapely, pyproj |
| Import OSM | `scripts/import-osm-water.sh` | GDAL `ogr2ogr` (~1,3 mln obiektów wodnych) |

**Jak działa analiza:** (1) profil statyczny działki raz i w cache (granice, gleba, najbliższa woda, spadek) →
(2) obserwacja dynamiczna per `(działka, data)`: 10 lat pogody + Sentinel-2 równolegle → (3) deterministyczny
`AnalysisEngine` (FAO-56, mediana 10-letnia, próg `CRITICAL < −180 mm`) → (4) raport z szablonów PL/EN.

Dokumentacja: [API i algorytm](docs/api.md) · [model danych](docs/data.md) · [uruchomienie](docs/setup.md) · [plan](docs/plan/00-overview.md)

## 🛰️ Źródła danych

Wszystkie diagnozy i rekomendacje są **liczone na żywo** z otwartych danych — brak zakodowanych wyników.

| Dane | Źródło | Licencja |
|---|---|---|
| Parametry upraw | FAO-56 | metodyka publiczna |
| Granice działek | ULDK GUGiK | otwarte dane GUGiK |
| Spadek terenu | Geoportal NMT WCS (1 m) | otwarte dane GUGiK |
| Gleba (0–30 cm) | ISRIC SoilGrids v2.0 (250 m) | CC BY 4.0 |
| Pogoda (10 lat) | Open-Meteo Archive | CC BY 4.0 |
| NDVI / NDWI | Sentinel-2 L2A (Earth Search STAC) | Copernicus, otwarte |
| Hydrografia | OSM / Geofabrik, Overpass (fallback) | ODbL 1.0 |

Szczegóły zakresu, odświeżania i warstw mapy: [sekcja angielska](#%EF%B8%8F-data-sources).

## 🚧 Ograniczenia

- SoilGrids 250 m nie widzi zmienności w obrębie pola; przy braku danych → glina średnia (`130 mm/m`), jawnie w raporcie.
- Długie zachmurzenie w oknie `±15 dni` → brak danych satelitarnych (niższa wiarygodność).
- Open-Meteo: ~5 dni opóźnienia, siatka ~9–11 km.
- Brak danych z piezometrów / czujników i brak weryfikacji pozwoleń wodnoprawnych.
- Wykrywanie rowów (`≤ 1000 m`) zależy od kompletności OSM.
- 5 upraw, miesięczne etapy `Kc` (bez własnych dat siewu).
- *„Wiarygodność oceny”* = kompletność danych, nie przedział ufności.

## 🔐 Skalowanie i bezpieczeństwo

- **Cache wielopoziomowy w PostGIS** + import hydrografii → brak Overpass na gorącej ścieżce.
- **Request coalescing**, limity Redis, timeouty, łagodna degradacja (brak HTTP 500 przy awarii warstwy opcjonalnej).
- API i Geo-Worker są bezstanowe → skalowanie poziome. Prototyp: **0 zł kosztów API**; produkcja krajowa ok.
  **200–600 EUR/mies.** (szczegóły w [sekcji angielskiej](#-scalability--security)).
- **Zero PII**, walidacja wejścia, jawny CORS, zaufany `X-Forwarded-For` tylko z sieci prywatnych, sekrety przez Docker secrets.

## 🤖 Użycie AI

- **W działaniu:** brak — obliczenia, rekomendacje i teksty PL/EN są deterministyczne.
- **Podczas tworzenia:** asystenci Claude Code (Anthropic) i Antigravity (Google) pomagali przy UI, testach,
  hardeningu i dokumentacji. Cały kod został przejrzany, uruchomiony i zweryfikowany przez zespół.

---

# 🇬🇧 English

## ⚡ TL;DR for the jury

All you need is **Docker with Compose v2**. No API keys, accounts or login.

```bash
git clone https://github.com/nikwaeis/HackNation2026.git && cd HackNation2026

# 1. .env with crop seeding enabled
sed 's/DATABASE_RUNSEED=false/DATABASE_RUNSEED=true/' .env.example > .env

# 2. Build and start (first build takes a few minutes)
docker compose -f docker-compose.dev.yml up -d --build

# 3. Wait until the API answers {"status":"ok"}
curl http://localhost:5254/api/health

# 4. (Recommended before a demo) import Poland's water network from OSM: ~2.1 GB download, ~10 min
docker compose -f docker-compose.dev.yml run --rm osm-import
```

Then open **http://localhost:5173** 🎉

> [!TIP]
> **Quick check:** enter parcel ID `041509_2.0004.437/3` (or click a field on the map), pick *Pszenica ozima*
> (winter wheat), date `2026-06-15` and run the analysis. The first analysis of a new parcel takes about
> **10–20 s** (live data from 5 sources); repeats take **< 1 s** (cache).

## 📖 Contents

- [What is WodoPlon](#-what-is-wodoplon)
- [Features](#-features)
- [Step-by-step setup](#-step-by-step-setup)
- [Important nuances](#%EF%B8%8F-important-nuances)
- [Troubleshooting](#-troubleshooting)
- [Tests](#-tests)
- [Architecture](#%EF%B8%8F-architecture)
- [Data sources](#%EF%B8%8F-data-sources)
- [Limitations](#-limitations)
- [Scalability & security](#-scalability--security)
- [Use of AI](#-use-of-ai)
- [Licences](#-components--licences)

## 🌱 What is WodoPlon

A farmer picks a parcel (Polish TERYT cadastral ID or a click on the map), a crop and an analysis date (today or up
to 10 years back). WodoPlon combines open spatial, weather, satellite, soil and hydrological data into a
**plain-language report (PL / EN)**: current water situation and 10-year drought history, causes, prioritized
retention measures, irrigation as a last resort, and full data provenance with uncertainty and limitations.

**No login · no personal data · no paid APIs · no LLM at runtime.**

## ✨ Features

- 🗺️ **Zero-GIS parcel selection** — cadastral ID (e.g. `141611_2.0018.103`) or map click. Boundary from ULDK GUGiK,
  EGiB/TERYT warning for non-agricultural plots (built-up, forest, road, water).
- 🌾 **5 crops** (winter wheat, maize, winter rapeseed, sugar beet, potato) with FAO-56 coefficients, any date up to
  10 years back.
- 📋 **4-stage KOWR report** (strict order):
  1. **Water situation** — 90-day FAO-56 balance (`P − Kc·ET₀`) vs. the parcel's own 10-year median, rainfall vs.
     norm, longest dry spell, drought frequency, Sentinel-2 NDVI/NDWI, soil/slope/water, *„Wiarygodność oceny”* badge.
  2. **Causes & retention** — landscape first (ditch weirs, contour tillage, buffer strips), then soil measures
     (mulching, crop residues, cover crops, reduced tillage), each justified by parcel data.
  3. **Irrigation (last resort)** — only at `HIGH`/`CRITICAL` risk in critical months (or `NDWI < −0.15`), dose
     `15–35 mm` (`150–350 m³/ha`).
  4. **Sources & limitations** — exact sources, scene dates, cloud cover; missing data shows as *„Brak danych”*.
- 🔗 **Shareable link** (`/report/{reportUuid}`), 🖨️ print / PDF, 📱 mobile layout, 🌐 PL/EN, 🌓 *Kontrast* theme.
- 🛰️ **Map overlays** — OSM, Geoportal orthophoto, KIEG parcel boundaries, Copernicus EDO drought (CDI), OSM ditches
  and fields, slope runoff arrows.

## 🚀 Step-by-step setup

### Requirements

| | |
|---|---|
| 🐳 Docker | Docker Desktop / Engine with Compose v2 (`docker compose version`) |
| 💾 Disk | ~6 GB: images ~2 GB, OSM extract 2.1 GB, database ~0.7 GB after import |
| 🌐 Network | Outbound HTTPS to public data services; a non-shared IP is best (Open-Meteo and Overpass limit per IP) |
| 🔧 Optional | .NET 10 SDK, Python 3.11, Node.js 22 — only for tests / running without Docker |

### URLs

| Service | URL |
|---|---|
| 🖥️ Web app | http://localhost:5173 |
| ❤️ API health | http://localhost:5254/api/health |
| 📜 OpenAPI | http://localhost:5254/openapi/v1.json |
| 🐍 Geo-Worker | http://localhost:8000/health |

### API smoke test

```bash
curl http://localhost:5254/api/crops     # 5 crops

curl -X POST http://localhost:5254/api/analyze -H "Content-Type: application/json" \
  -d '{"dzialkaId":"041509_2.0004.437/3","cropId":"winter_wheat","targetDate":"2026-06-15"}'

# by coordinates, English texts
curl -X POST http://localhost:5254/api/analyze -H "Content-Type: application/json" -H "Accept-Language: en" \
  -d '{"lat":53.0605,"lon":18.4410,"cropId":"winter_wheat","targetDate":"2026-06-15"}'

curl http://localhost:5254/api/reports/<reportUuid>   # saved report
```

`cropId`: `winter_wheat` · `maize` · `rapeseed` · `sugar_beet` · `potato`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/crops` | Crops with FAO-56 coefficients |
| `POST` | `/api/analyze` | `{ dzialkaId \| lat+lon, cropId, targetDate }`, `Accept-Language: pl \| en` |
| `GET` | `/api/reports/{reportUuid}` | Saved report (shareable link) |

### Frontend only (no backend)

```bash
cd src/frontend && npm install && npm run dev
```

With the backend offline, **„Zobacz przykładowy raport”** opens a clearly labelled demo report. `/api` is proxied to
`http://localhost:5254` (override with `VITE_API_PROXY_TARGET` or `VITE_API_BASE_URL`).

### Useful commands

```bash
docker compose -f docker-compose.dev.yml logs -f api   # API logs
docker compose -f docker-compose.dev.yml down          # stop
docker compose -f docker-compose.dev.yml down -v       # stop + wipe database AND the OSM download (2.1 GB)
```

Hot reload is on for the API, frontend and Geo-Worker (sources are mounted into the containers).

### Production

```bash
cp .env.prod.example .env.prod          # set POSTGRES_DB, POSTGRES_USER, Cors__WebOrigin
mkdir secrets
# one value per file, no trailing newline:
#   secrets/db_password       <password>
#   secrets/db_connection     Host=postgres;Database=<POSTGRES_DB>;Username=<POSTGRES_USER>;Password=<password>
#   secrets/redis_password    <password>
#   secrets/redis_connection  redis:6379,password=<password>
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

nginx serves the SPA on port `80` and proxies `/api` and `/uldk`; the Geo-Worker has no public port. Always pass
`--env-file .env.prod`. Migrations run automatically **only in Development** — production migrations, crop seeding
and proxy networks: [`docs/setup.md`](docs/setup.md#6-production).

## ⚠️ Important nuances

> [!IMPORTANT]
> **`DATABASE_RUNSEED=true`** in `.env` is required on the first start, otherwise the crop list is empty. The `sed`
> command in the TL;DR sets it. Safe to leave on (it only inserts missing crops).

> [!IMPORTANT]
> **The OSM import (`osm-import`)** is optional but strongly recommended before a demo. Without it, nearest-water
> distance is fetched in the background from the public Overpass API, which is often overloaded — the report then
> says *"water data is still loading"*. The API uses the import immediately, no restart needed.

> [!WARNING]
> **Upstream limits:** Open-Meteo and Overpass rate-limit per IP. On a shared network (event Wi-Fi) the daily quota
> can run out → `500` with a weather message. Switching networks (e.g. a phone hotspot) helps.

- ⏱️ **Timing:** first analysis of a parcel 10–20 s (cold start up to < 30 s), repeats < 1 s.
- 🚦 **API rate limit:** 10 analyses/min per client, 30/min per IP → `429` with `Retry-After`. Invalid requests don't count.
- 📅 **Recent days:** the Open-Meteo archive lags ~5 days — dates in that window are flagged in the report.
- 🛰️ **Satellite:** `satelliteStatus` = `OK` / `CLOUDY_FALLBACK` / `NO_DATA` (clouds) / `ERROR` (retried on a later request).
- A `null` metric is **honest missing data**, explained in step 4 of the report.
- 🔍 **Map:** GUGiK parcel boundaries render only from **zoom 17**; the EDO drought grid is ~5 km.
- 🔌 Change ports in `.env`: `API_PORT`, `FRONTEND_PORT`, `POSTGRES_PORT`, `REDIS_PORT`, `PYTHON_SERVICE_PORT`.

## 🩺 Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Crop list is empty | `DATABASE_RUNSEED=true` missing in `.env` → fix it and `docker compose -f docker-compose.dev.yml up -d` |
| "Water data is still loading" | OSM import not run and Overpass overloaded → run `osm-import` |
| `429 Too Many Requests` | API rate limit — wait for `Retry-After` |
| `500` with a weather message | Open-Meteo down or IP quota used up → retry later / from another network |
| OSM import fails at step 1/4 (`404`, `502`, stalled) | Geofabrik hasn't published the newest extract; the script tries the previous 3 days. Retry later or pass `-e PBF_URL=https://download.geofabrik.de/europe/poland/poland-YYMMDD.osm.pbf` |
| `slopeDeg: null` | GUGiK NMT timed out — the next analysis retries |
| `satelliteStatus: ERROR` | Geo-Worker / Earth Search unavailable → `docker compose -f docker-compose.dev.yml logs python-service` |
| API container stops after a code change | `dotnet watch` hot reload failed → `docker compose -f docker-compose.dev.yml restart api` |
| Port already in use | Change it in `.env` (e.g. `FRONTEND_PORT=5174`) |
| Start over with an empty DB | `down`, `docker volume rm wodoplon-dev_pgdata`, `up -d`, re-run the import |

More: [`docs/setup.md`](docs/setup.md#8-troubleshooting).

## 🧪 Tests

```bash
dotnet test src/backend/WodoPlon.slnx                                  # backend (xUnit, mocked externals)
cd src/python-service && pip install -r requirements-dev.txt && pytest  # Geo-Worker (no network)
cd src/frontend && npm install && npm test                             # frontend (Vitest + Testing Library)
cd src/frontend && npm run test:e2e                                    # Playwright E2E (live ULDK/GUGiK, /api stubbed)
```

<details>
<summary><b>What the tests verify</b></summary>

- **Engine (xUnit):** FAO-56 `ETc` and 90-day balance math, 10-year median anomaly and drought-year counting,
  `LOW`/`MODERATE`/`HIGH`/`CRITICAL` thresholds, all 4 retention triggers (weather deficit, sandy/low-humus soil,
  slope runoff, ditch proximity), landscape-before-soil ordering, irrigation gating and dose clamping, request
  coalescing, PL/EN texts, graceful degradation on upstream failures.
- **Raster pipeline (pytest):** `/health` and `/extract-geo` contracts, slope calculation, Sentinel-2 cloud filtering,
  NDVI/NDWI math, `NO_DATA`/`ERROR` handling.
- **UI (Vitest + Playwright):** exact ULDK click coordinates, WKT `Polygon`/`MultiPolygon` parsing, land-use warning
  flow (incl. TERYT urban fallback), strict 4-stage order, uncertainty breakdown, *„Brak danych”* rendering, mobile,
  print/PDF, shareable links. Screenshots: `src/frontend/e2e-results/screens/` (`E2E_ALL_BROWSERS=1` adds Firefox/WebKit).

</details>

## 🏗️ Architecture

```
React (Leaflet) ──/api──► ASP.NET Core API ──► PostgreSQL 17 + PostGIS 3.5 (cache, crops, hydro, reports)
                ──/uldk─►  (orchestrator)  ──► Redis 7 (rate limiting, HybridCache)
                                           ──► Python Geo-Worker (terrain + Sentinel-2)
                                           ──► ULDK, Open-Meteo, SoilGrids, Overpass (fallback)
```

| Component | Path | Stack | Role |
|---|---|---|---|
| Frontend | `src/frontend/` | React 19, TypeScript, Vite, Tailwind 4, Leaflet | Map, parcel lookup, report view, share, print, PL/EN |
| Backend API | `src/backend/` | .NET 10 Minimal API, EF Core, NetTopologySuite, CQRS | Orchestration, PostGIS cache, coalescing, FAO-56 engine, reports |
| Geo-Worker | `src/python-service/` | Python 3.11, FastAPI, rasterio, shapely, pyproj | Slope from GUGiK NMT, NDVI/NDWI from Sentinel-2 COGs |
| OSM importer | `scripts/import-osm-water.sh` | GDAL `ogr2ogr` | Monthly import of ~1.3M Polish water features |
| Database | — | PostgreSQL 17 + PostGIS 3.5 | Crops, hydrography, parcel profiles, observations, reports |
| Cache / limits | — | Redis 7 | Sliding-window rate limiting, HybridCache |
| Proxy | `src/frontend/nginx.conf` | nginx (prod) | Static SPA, `/api` and `/uldk` proxy |

**Pipeline:** (1) static parcel profile, computed once and cached (boundary, soil/AWC, nearest water, slope) →
(2) dynamic observation per `(parcel, date)`: 10-year weather + Sentinel-2 in parallel, concurrent first requests
share one fetch → (3) deterministic `AnalysisEngine` (FAO-56 balance vs. 10-year local median, `CRITICAL < −180 mm`,
dry spells, NDWI, soil, slope, ditches) → (4) PL/EN template report with sources and confidence.

If the Geo-Worker is down, analysis still runs with satellite marked `ERROR`; if SoilGrids is down, medium-loam
defaults are used and disclosed.

Docs: [API & algorithm](docs/api.md) · [data model](docs/data.md) · [setup](docs/setup.md) · [implementation plan](docs/plan/00-overview.md)

## 🛰️ Data sources

All diagnoses and recommendations are **computed at runtime** from open data — nothing is hardcoded for real parcels.

| Data | Source | Scope | Freshness | Licence |
|---|---|---|---|---|
| Crop parameters | FAO-56 | `Kc`, critical months, root depth, 5 crops | Seeded at startup | Public methodology |
| Hydrography | OSM via Geofabrik (`poland-latest.osm.pbf`) | Rivers, streams, canals, ditches, lakes, wetlands (~1.3M) | Preloaded, monthly; Overpass fallback | ODbL 1.0 |
| Parcel boundaries | ULDK GUGiK | Polygon, area, voivodeship | Live, then cached | GUGiK open data |
| Slope | Geoportal NMT WCS | 1 m DTM: mean/max slope, % area `> 3°` | Live, then cached; retried on failure | GUGiK open data |
| Soil | ISRIC SoilGrids v2.0 | 0–30 cm sand/clay/silt/SOC, 250 m | Live, then cached | CC BY 4.0 |
| Weather | Open-Meteo Archive | Daily `P`, `ET₀`, `Tmax`, 90-day windows × 10 years | Live per `(parcel, date)`, cached | CC BY 4.0 |
| Satellite | Sentinel-2 L2A (Earth Search STAC) | B04/B08/B11/SCL, `±15 days` → NDVI, NDWI | Live, cached with scene date & cloud % | Copernicus open |

<details>
<summary><b>Browser-only map services</b> (visual context, never used in calculations)</summary>

| Purpose | Service | Licence |
|---|---|---|
| Parcel outline | ULDK GUGiK (via `/uldk` proxy) | GUGiK open data |
| Land-use check | GUGiK KIEG WMS `GetFeatureInfo` (EGiB) | GUGiK open data |
| Fields & ditches nearby | OSM Overpass API | ODbL 1.0 |
| Runoff arrows | Open-Meteo Elevation (Copernicus DEM 90 m) | CC BY 4.0 |
| Base maps & overlays | OSM tiles, Geoportal orthophoto, KIEG parcels, Copernicus EDO (`cdiad`) | ODbL / GUGiK / Copernicus |

On phones the map credits sit behind an "i" button; on desktop they are always visible.

</details>

## 🚧 Limitations

- **SoilGrids 250 m** misses within-field variability; fallback is medium loam (`130 mm/m` AWC), disclosed in step 4.
- **Clouds** across the `±15-day` window → `NO_DATA`; assessment relies on other inputs with lower confidence.
- **Open-Meteo** ~5-day archive lag, ~9–11 km grid.
- **No groundwater telemetry or water-law permit checks.**
- **OSM completeness** limits ditch detection (`≤ 1000 m`).
- **Crop model:** 5 crops, monthly FAO-56 `Kc` stages, no custom sowing dates.
- **EGiB coverage:** some counties don't expose EGiB classes; the UI falls back to OSM farmland / TERYT or says "not verified", never blocks.
- **Public Overpass / EDO** can be slow; overlays degrade with a status banner.
- *„Wiarygodność oceny”* measures input completeness, not a statistical confidence interval.

## 🔐 Scalability & security

- **Multi-tier PostGIS caching** + pre-imported hydrography: static profiles cached indefinitely, observations per
  `(parcel, date)`, reports stored by UUID.
- **Coalescing, rate limits, timeouts:** HybridCache dedupes concurrent first requests; Redis sliding window after
  validation; strict outbound timeouts; failed terrain/satellite lookups retry automatically.
- **Graceful degradation:** optional upstream failures never produce HTTP 500.
- **Nationwide path:** pre-load BDOT10k / Hydroportal / EGiB / NMT / IUNG-PIB layers, scheduled ingestion of weather
  grids and Sentinel-2 composites (target `< 200 ms`), stateless API + Geo-Worker behind a load balancer, CDN, read replicas.
- **Cost:** prototype runs at **zero paid API cost**; national production ~**EUR 200–600 / month** infrastructure,
  plus Open-Meteo commercial plan or self-hosted ERA5/IMGW-PIB, and CDSE credentials for satellite ingestion.
- **Security:** zero PII (public TERYT IDs, random report UUIDs), FluentValidation, explicit CORS (`Cors__WebOrigin`),
  `X-Forwarded-For` trusted only from private networks (`ForwardedHeaders__KnownNetworks`), Geo-Worker internal-only,
  credentials via Docker secrets (`/run/secrets`, never in git).

## 🤖 Use of AI

- **At runtime:** none. Calculations, recommendations and PL/EN texts are deterministic.
- **During development:** Claude Code (Anthropic) and Antigravity (Google) helped with the frontend UI, test suites,
  hardening and documentation. All generated code and docs were reviewed, run and verified by the team.

## 📦 Components & licences

<details>
<summary><b>Backend (.NET 10 / NuGet)</b></summary>

| Component | Licence | Use |
|---|---|---|
| .NET 10 / ASP.NET Core / EF Core / OpenAPI | MIT | Web API, ORM, OpenAPI |
| Npgsql / Npgsql.EntityFrameworkCore.PostgreSQL | PostgreSQL License | PostgreSQL + PostGIS driver |
| NetTopologySuite / NetTopologySuite.IO.GeoJSON4STJ | BSD-3-Clause | Geometries & GeoJSON |
| FluentValidation | Apache-2.0 | Request & config validation |
| Microsoft.Extensions.Caching.Hybrid / StackExchangeRedis | MIT | Coalescing & caching |
| StackExchange.Redis | MIT | Redis client |
| xUnit / NSubstitute / coverlet.collector | Apache-2.0 / BSD-3-Clause / MIT | Tests only |
| FluentAssertions (v8) | Xceed Community License (free non-commercial / OSS) | Tests only |

</details>

<details>
<summary><b>Geo-Worker (Python 3.11 / PyPI)</b></summary>

| Component | Licence | Use |
|---|---|---|
| FastAPI / pydantic-settings | MIT | HTTP API & config |
| Uvicorn | BSD-3-Clause | ASGI server |
| httpx | BSD-3-Clause | Async HTTP for WCS & STAC |
| NumPy | BSD-3-Clause | Raster & index math |
| rasterio (GDAL / PROJ) | BSD-3-Clause (GDAL/PROJ: MIT) | COG window reads |
| Shapely | BSD-3-Clause | Polygon ops |
| pyproj | MIT | CRS reprojection (EPSG:4326 ↔ 2180 / UTM) |
| pytest | MIT | Tests only |

</details>

<details>
<summary><b>Frontend (Node 22 / npm)</b></summary>

| Component | Licence | Use |
|---|---|---|
| React, React DOM, React Router | MIT | UI, routing |
| Leaflet | BSD-2-Clause | Map |
| react-leaflet, @react-leaflet/core | Hippocratic License 2.1 | React bindings (permissive with human-rights conditions; not OSI-approved) |
| lucide-react | ISC | Icons |
| Tailwind CSS, Vite, TypeScript | MIT / MIT / Apache-2.0 | Build & styling |
| Plus Jakarta Sans, JetBrains Mono | SIL OFL 1.1 | Fonts |
| Vitest, Testing Library, Playwright | MIT / MIT / Apache-2.0 | Tests only |

</details>

<details>
<summary><b>Infrastructure</b></summary>

| Component | Licence | Role |
|---|---|---|
| PostgreSQL 17 | PostgreSQL License | Database |
| PostGIS 3.5 | GPL-2.0+ | Spatial extension (separate container) |
| Redis 7 | RSALv2 / SSPLv1 | Rate limiting & cache (separate container) |
| GDAL (`ghcr.io/osgeo/gdal`) | MIT | `osm-import` job |
| nginx | BSD-2-Clause | Production static server & proxy |

</details>

**Models:** FAO-56 `ETc = ET₀ × Kc`; Sentinel-2 `NDVI = (B08 − B04)/(B08 + B04)`, Gao `NDWI = (B08 − B11)/(B08 + B11)`
with SCL cloud mask; deterministic rule-based engine — no ML or LLM inference at runtime.

---

<div align="center">

**Licencja / License:** Apache 2.0 — [LICENSE](LICENSE)

Made with 💧 for Polish farmers · HackNation 2026

</div>
