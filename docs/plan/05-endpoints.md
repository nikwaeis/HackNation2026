# Часть 5. Эндпоинты

- `GET /api/crops`: справочник культур.
- `POST /api/analyze`: валидатор (либо `dzialkaId`, либо `lat`+`lon`; дата в пределах [сегодня − 10 лет, сегодня]; культура существует). Оркестрация Частей 2–4, сохранение `SavedReport` (payload в jsonb), ответ по api.md §3.2.
- `GET /api/reports/{uuid}`: payload из `saved_reports`.
- Если участок вне Польши или без номера, отвечаем 404 «Nie znaleziono działki ewidencyjnej dla wskazanej lokalizacji».
- Enum в JSON контракта: `riskLevel` = `"HIGH"`, `type` = `"LANDSCAPE"`, `satelliteStatus` = `"OK"`. Глобальный `JsonStringEnumConverter` сейчас отдаёт `"High"`, поэтому нужна `JsonNamingPolicy.SnakeCaseUpper`.
- Порядок в обработчике: `ParcelProfileService` → `ObservationService` → `AnalysisEngine.Assess` → маппинг в DTO §3.2 → `SavedReport`.

## Как сделано
| Эндпоинт | Код | Ответ |
|---|---|---|
| `GET /api/crops` | `Features/Crops/Query/GetCrops` | `CropResponse[]`, отсортировано по `namePl` |
| `POST /api/analyze` | `Features/Analysis/Command/AnalyzeParcel` | `AnalysisResponse` (§3.2), rate limit 10/мин |
| `GET /api/reports/{uuid}` | `Features/Analysis/Query/GetReport` | payload из `saved_reports` как есть (`application/json`) |

- Ответ анализа сериализуется теми же JSON-опциями, что и HTTP (`JsonExtension.AddApiConverters`), и сохраняется в `report_payload`. Поэтому `GET /reports/{uuid}` отдаёт его байт в байт.
- Ошибки:
  - валидация → 400 (`AnalysisErrorCodes`, pl/en);
  - участок не найден → 404 «Nie znaleziono działki…»;
  - культура или отчёт не найдены → 404;
  - ULDK или Open-Meteo недоступны → 500 с польским текстом. В `ErrorType` нет 503.

Расхождения с примером api.md (контракт расширен, ничего не сломано):
- `polygonGeoJson.type` = `MultiPolygon`: так участок хранится в БД. Leaflet и OpenLayers понимают оба типа.
- В `step3_irrigation` добавлено поле `doseMm` (число или null) рядом с `advicePl`.
