# Part 5. Endpoints

- `GET /api/crops`: crop catalogue.
- `POST /api/analyze`: validator (either `dzialkaId` or `lat`+`lon`; date within [today − 10 years, today]; crop exists).
  Orchestrates parts 2–4, stores a `SavedReport`, responds per api.md §3.2.
- `GET /api/reports/{uuid}`: payload from `saved_reports`.
- A parcel outside Poland or without a number → 404 «Nie znaleziono działki ewidencyjnej dla wskazanej lokalizacji».
- Enums in the JSON contract: `riskLevel` = `"HIGH"`, `type` = `"LANDSCAPE"`, `satelliteStatus` = `"OK"`. The global
  `JsonStringEnumConverter` produced `"High"`, so `JsonNamingPolicy.SnakeCaseUpper` is used.
- Handler order: `ParcelProfileService` → `ObservationService` → `AnalysisEngine.Assess` → mapping to the §3.2 DTO →
  `SavedReport`.

## How it was built
| Endpoint | Code | Response |
|---|---|---|
| `GET /api/crops` | `Features/Crops/Query/GetCrops` | `CropResponse[]`, sorted by `namePl` |
| `POST /api/analyze` | `Features/Analysis/Command/AnalyzeParcel` | `AnalysisResponse` (§3.2), rate limited |
| `GET /api/reports/{uuid}` | `Features/Analysis/Query/GetReport` | payload from `saved_reports` as is (`application/json`) |

- The analysis response is serialized with the same JSON options as HTTP (`JsonExtension.AddApiConverters`) and stored in
  `report_payload`, so `GET /reports/{uuid}` returns it byte for byte (column type `json` since part 6).
- Errors:
  - validation → 400 (`AnalysisErrorCodes`, pl/en), keyed by request field name (`dzialkaId`, …);
  - parcel not found → 404 «Nie znaleziono działki…»;
  - crop or report not found → 404;
  - ULDK or Open-Meteo unavailable → 500 with a localized message (`ErrorType` has no 503).

Differences from the original api.md example (the contract was extended, nothing broken):
- `polygonGeoJson.type` = `MultiPolygon`: that is how parcels are stored; Leaflet and OpenLayers understand both.
- `step3_irrigation` has an extra `doseMm` field (number or null) next to `advicePl`.
- `metrics` has an extra `waterBalance10yrMedianMm` (part 6).
