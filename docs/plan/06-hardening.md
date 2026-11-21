# Part 6. Post-hackathon test campaign and hardening

During the hackathon the backend could not be tested end to end: the shared venue IP hit the rate limits of the free
external APIs. Afterwards the whole backend (API, Geo-Worker, database) was tested against the live services from a clean
IP, every defect fixed with a regression test, and the run repeated on a fresh database.

## Defects found and fixed

| # | Severity | Problem | Fix |
|---|---|---|---|
| 1 | Critical | Geo-Worker container crashed on start: `rasterio` needs the system `libexpat1`, missing in `python:3.11-slim` | `apt-get install libexpat1` in both Dockerfiles |
| 2 | Critical | C# client expected a flat JSON while the worker returns nested `terrain` / `satellite`; request sent `need_terrain` instead of `include_terrain` → satellite and slope never reached a report | Wire records matching the real contract, `ERROR` mapped |
| 3 | High | NDVI ≈ 0.998: Earth Search COGs are already harmonized, applying the advertised −0.1 offset made red negative | Only the band scale is applied |
| 4 | High | Satellite `NO_DATA` by time budget: the same overpass was checked up to 4 times (2 tiles × 2 reprocessings) | Latest reprocessing only; other tiles of a date skipped once its clouds are measured |
| 5 | High | Overpass needed ~33 s (limit 8 s) → nearest water never found and cached as unknown forever | Local OSM import (primary, synchronous) + Overpass in the background with 30 s timeout, mirrors and retry |
| 6 | Medium | A satellite failure was cached forever as `NO_DATA` | New status `Error`, retried on later requests (≤ 1/min) |
| 7 | Medium | Rate-limit fingerprint uses client-set headers → limit bypassed by changing a header | Extra per-IP window (3× the policy limit) |
| 8 | Medium | 5 concurrent first requests for one parcel → 21 external calls | HybridCache request coalescing per parcel, parcel + date and map point → 4 calls |
| 9 | Medium | Report text only in Polish although PL/EN was promised | Texts in `SharedResources.{pl,en}.resx`, language by `Accept-Language` |
| 10 | Medium | Risk almost always HIGH (absolute −100 mm threshold vs a typical regional deficit) | Hybrid scale against the parcel's 10-year median (api.md §4) |
| 11 | Low | Geo-Worker down was reported as "no cloud-free scene" | Separate limitation text for `Error` |
| 12 | Low | Redis down added ~5 s to every request | Short Redis timeouts, `BacklogPolicy.FailFast` |
| 13 | Low | `X-Forwarded-For` trusted from anyone | Trusted only from loopback / private networks (`ForwardedHeaders:KnownNetworks`) |
| 14 | Low | `GET /reports/{id}` not byte-identical (`jsonb` reorders keys) | Column type `json` |
| 15 | Low | Validation error keys in PascalCase (`DzialkaId`) | camelCase like the request fields |
| 16 | Low | GUGiK NMT sometimes hangs one request for 40 s | Two 5 s attempts inside a 12 s module budget |
| 17 | Info | EF Core Relational 10.0.4 / 10.0.13 build warning | Explicit package version |

## Verification
- .NET unit tests 84/84, Geo-Worker pytest 43/43.
- Black-box regression on a fresh database (33 checks): health, crops, OpenAPI, validation (400, camelCase, PL/EN),
  domain errors (404 for unknown crop, a click in Paris), full report with satellite / slope / soil / water / norm,
  byte-identical saved report, EN report, cache < 1 s, map click → same parcel, rate limits (10/min fingerprint, 30/min IP,
  `Retry-After`), CORS, 5 parallel first requests (all 200, one set of external calls, water in the first report, < 30 s).
- Resilience: Geo-Worker stopped → report with `ERROR`, recovered automatically ~1 min after restart; Redis stopped →
  no extra latency, analysis of a new parcel still works.
