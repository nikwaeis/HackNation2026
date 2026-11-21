# API and Algorithm Implementation Plan

The work was done in parts, with a stop and review after each part. Contracts are in [../api.md](../api.md), the data
model in [../data.md](../data.md), how to run in [../setup.md](../setup.md).

| # | Part | Status |
|---|---|---|
| 1 | [External API clients](01-external-clients.md) | done |
| 2 | [Parcel and static cache (step 0)](02-parcel-static-cache.md) | done |
| 3 | [Dynamic observations (weather + satellite)](03-dynamic-observation.md) | done |
| 4 | [Analysis algorithm (steps 1–4)](04-algorithm.md) | done |
| 5 | [Endpoints](05-endpoints.md) | done |
| 6 | [Post-hackathon test campaign and hardening](06-hardening.md) | done |

Decisions:
- The Python Geo-Worker was written by a separate team member; the backend only has a C# client for `/extract-geo`.
  If the worker is down, the analysis still runs (satellite status `ERROR`, retried later).
- Hydrography: originally live from Overpass OSM, stored in `hydro_features`. **Changed in part 6:** the primary source
  is a monthly bulk import of the Geofabrik Poland extract; Overpass is the fallback. Distance is computed with `ST_Distance`.
- Report texts are built from deterministic templates (Polish and English resources), no LLM.
