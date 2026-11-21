# API-контракты: Frontend ↔ ASP.NET Core ↔ Python Geo-Worker

Документ фиксирует единый формат обмена данными между всеми сервисами системы. Контракты спроектированы с учетом строгой причинно-следственной логики задания KOWR: **Оценка ситуации (10 лет + текущая) → Причины и ретенция → Рекомендации по поливу → Источники и ограничения**.

---

## 1. Взаимодействие: Frontend (React) ↔ Backend (ASP.NET Core)

### 1.1. Получить справочник культур
`GET /api/crops`

**Response `200 OK`:**
```json
[
  {
    "id": "winter_wheat",
    "namePl": "Pszenica ozima",
    "criticalMonths": [5, 6]
  },
  {
    "id": "maize",
    "namePl": "Kukurydza",
    "criticalMonths": [6, 7, 8]
  },
  {
    "id": "rapeseed",
    "namePl": "Rzepak ozimy",
    "criticalMonths": [4, 5, 6]
  }
]
```

---

### 1.2. Запустить анализ участка и сформировать отчет
`POST /api/analyze`

Пользователь может передать либо кадастровый ID участка (`dzialkaId`), либо координаты клика по карте (`lat`, `lon`). Если `targetDate` не передана, берется текущая дата.

**Request Body:**
```json
{
  "dzialkaId": "040101_1.0001.123/4",
  "lat": null,
  "lon": null,
  "cropId": "winter_wheat",
  "targetDate": "2026-06-15"
}
```
*(Примечание: если пользователь кликнул по карте, передается `"dzialkaId": null, "lat": 53.1235, "lon": 18.0084` — бэкенд сам определяет `dzialkaId` через ULDK GUGiK).*

**Response `200 OK`:**
```json
{
  "reportUuid": "550e8400-e29b-41d4-a716-446655440000",
  "meta": {
    "dzialkaId": "040101_1.0001.123/4",
    "voivodeship": "kujawsko-pomorskie",
    "areaHa": 4.85,
    "cropId": "winter_wheat",
    "cropNamePl": "Pszenica ozima",
    "targetDate": "2026-06-15",
    "generatedAt": "2026-11-21T14:15:00Z",
    "fromCache": false
  },
  "geometry": {
    "type": "MultiPolygon",
    "coordinates": [[[[18.001, 53.121], [18.005, 53.121], [18.005, 53.124], [18.001, 53.124], [18.001, 53.121]]]]
  },
  "step1_WaterAssessment": {
    "deficitLevel": "HIGH",
    "summaryPl": "Na analizowanej działce występuje wysokie ryzyko suszy rolniczej wynikające z deficytu opadów w ostatnich 30 dniach oraz niskiej retencji glebowej.",
    "historicalRiskPl": "Największe ryzyko niedoboru wody na tej działce (w ujęciu 10-letnim) występuje w okresie od maja do lipca (deficyt w 7 z 10 ostatnich lat).",
    "metrics": {
      "precip30dMm": 18.4,
      "precip90dMm": 82.0,
      "precip10yrAvg90dMm": 145.5,
      "et0_90dMm": 230.2,
      "waterBalanceMm": -148.2,
      "drySpellDays": 19,
      "historicalDroughtYears": 7,
      "ndviMean": 0.54,
      "ndwiMean": -0.12
    }
  },
  "step2_CausesAndRetention": {
    "identifiedCauses": [
      {
        "code": "LOW_SOIL_RETENTION",
        "titlePl": "Niska pojemność wodna gleby (gleba lekka)",
        "descriptionPl": "Udział frakcji piaskowej wynosi 68%, a zawartość węgla organicznego jest niska (11.2 g/kg), przez co woda szybko przesiąka poza strefę korzeniową."
      },
      {
        "code": "SURFACE_RUNOFF",
        "titlePl": "Ryzyko spływu powierzchniowego",
        "descriptionPl": "Średnie nachylenie terenu wynosi 3.8°, co przy nawalnych opadach powoduje szybki odpływ wody z pola."
      }
    ],
    "landscapeRetentionRecommendations": [
      {
        "actionPl": "Spowolnienie odpływu w rowach melioracyjnych",
        "justificationPl": "W odległości 85 m od granicy działki znajduje się rów melioracyjny. Zastosowanie zastawek piętrzących pozwoli podnieść poziom wód gruntowych.",
        "priority": "HIGH"
      },
      {
        "actionPl": "Zadrzewienia śródpolne i strefy buforowe",
        "justificationPl": "Ograniczą parowanie wywołane wiatrem oraz zatrzymają spływ powierzchniowy na stoku.",
        "priority": "MEDIUM"
      }
    ],
    "soilAndAgroRecommendations": [
      {
        "actionPl": "Stosowanie międzyplonów (poplonów) oraz pozostawianie resztek pożniwnych",
        "justificationPl": "Zwiększy zawartość próchnicy i poprawi zdolność gleby piaszczystej do magazynowania wody opadowej.",
        "priority": "HIGH"
      }
    ]
  },
  "step3_Irrigation": {
    "isRecommended": true,
    "urgency": "MODERATE",
    "advicePl": "Nawadnianie jest uzasadnione interwencyjnie w najbliższych 5–7 dniach ze względu na krytyczną fazę nalewania ziarna pszenicy ozimej i ujemny bilans wodny (-148 mm). Zalecana dawka: 20–25 mm.",
    "waterSourceNotePl": "Najbliższy ciek wodny znajduje się w odległości 85 m (wymagane sprawdzenie pozwoleń wodnoprawnych)."
  },
  "step4_SourcesAndLimitations": {
    "sources": [
      { "name": "ULDK GUGiK (Granice działek)", "date": "2026-11-21", "mode": "CACHED" },
      { "name": "Geoportal NMT (Model terenu)", "date": "2026-11-21", "mode": "CACHED" },
      { "name": "ISRIC SoilGrids (Gleba 0-30 cm)", "date": "2026-11-21", "mode": "CACHED" },
      { "name": "Open-Meteo (Archiwum 10 lat)", "date": "2026-06-15", "mode": "LIVE" },
      { "name": "Sentinel-2 L2A (Earth Search)", "date": "2026-06-12", "mode": "LIVE" }
    ],
    "limitationsPl": [
      "Dane glebowe SoilGrids mają rozdzielczość przestrzenną 250 m i mogą nie uwzględniać lokalnej zmienności w obrębie małej działki.",
      "Wskaźnik satelitarny NDVI pochodzi ze zdjęcia z dnia 2026-06-12 (3 dni przed wybraną datą analizy, zachmurzenie 4%).",
      "Analiza nie uwzględnia aktualnego poziomu wód gruntowych w studniach piezometrycznych."
    ]
  }
}
```

---

### 1.3. Получить сохраненный отчет по UUID (для публичной ссылки)
`GET /api/reports/{reportUuid}`

**Response `200 OK`:** Возвращает идентичный JSON-объект, что и `POST /api/analyze`.

---

## 2. Внутреннее взаимодействие: ASP.NET Core → Python Geo-Worker

Python-сервис работает по внутренней сети Docker (`http://geo-worker:8000`) и отвечает исключительно за обработку растровых геоданных (GeoTIFF).

### 2.1. Извлечь метрики рельефа и спутниковых снимков
`POST /extract-geo`

**Request Body (от ASP.NET к Python):**
```json
{
  "dzialka_id": "040101_1.0001.123/4",
  "target_date": "2026-06-15",
  "include_terrain": true,
  "geometry": {
    "type": "MultiPolygon",
    "coordinates": [[[[18.001, 53.121], [18.005, 53.121], [18.005, 53.124], [18.001, 53.124], [18.001, 53.121]]]]
  }
}
```
*(Поле `include_terrain`: ASP.NET передает `false`, если рельеф для этого `dzialka_id` уже закэширован в таблице `parcel_static_profiles` — это экономит 2–3 секунды на повторных запросах по другим датам).*

**Response `200 OK` (от Python к ASP.NET):**
```json
{
  "dzialka_id": "040101_1.0001.123/4",
  "terrain": {
    "status": "OK",
    "mean_slope_deg": 3.82,
    "max_slope_deg": 7.45,
    "steep_area_pct": 42.0,
    "source": "Geoportal NMT WCS"
  },
  "satellite": {
    "status": "OK",
    "ndvi_mean": 0.5412,
    "ndwi_mean": -0.1205,
    "scene_date": "2026-06-12",
    "cloud_cover_pct": 4.2,
    "source": "Sentinel-2 L2A (Earth Search)"
  }
}
```

**Возможные значения `satellite.status` (для честной обработки ошибок и ограничений):**
* `"OK"` — найден снимок с облачностью $< 20\%$ в окне $\pm 15$ дней от `target_date`.
* `"CLOUDY_FALLBACK"` — снимок найден, но облачность $20\text{–}50\%$ (ASP.NET добавляет предупреждение в `limitationsPl`).
* `"NO_DATA"` — за весь период $\pm 15$ дней поле было закрыто облаками или дата вне архива (`ndvi_mean: null`, `ndwi_mean: null`). ASP.NET строит оценку только по погоде, почве и рельефу, честно указывая на отсутствие спутниковых данных.

---

## 3. Готовые модели кода для синхронизации команды

### 3.1. C# DTO для ASP.NET Core (`GeoWorkerDtos.cs`)
```csharp
using System.Text.Json.Serialization;

namespace WaterRetention.Api.Contracts.GeoWorker;

public record GeoExtractRequest(
    [property: JsonPropertyName("dzialka_id")] string DzialkaId,
    [property: JsonPropertyName("target_date")] string TargetDate, // YYYY-MM-DD
    [property: JsonPropertyName("include_terrain")] bool IncludeTerrain,
    [property: JsonPropertyName("geometry")] object Geometry // GeoJSON geometry object
);

public record GeoExtractResponse(
    [property: JsonPropertyName("dzialka_id")] string DzialkaId,
    [property: JsonPropertyName("terrain")] TerrainMetricsDto? Terrain,
    [property: JsonPropertyName("satellite")] SatelliteMetricsDto Satellite
);

public record TerrainMetricsDto(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("mean_slope_deg")] decimal? MeanSlopeDeg,
    [property: JsonPropertyName("max_slope_deg")] decimal? MaxSlopeDeg,
    [property: JsonPropertyName("steep_area_pct")] decimal? SteepAreaPct,
    [property: JsonPropertyName("source")] string Source
);

public record SatelliteMetricsDto(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("ndvi_mean")] decimal? NdviMean,
    [property: JsonPropertyName("ndwi_mean")] decimal? NdwiMean,
    [property: JsonPropertyName("scene_date")] string? SceneDate,
    [property: JsonPropertyName("cloud_cover_pct")] decimal? CloudCoverPct,
    [property: JsonPropertyName("source")] string Source
);
```

### 3.2. Python Pydantic-модели для FastAPI (`schemas.py`)
```python
from typing import Any, Dict, Literal, Optional
from pydantic import BaseModel, Field


class GeoExtractRequest(BaseModel):
    dzialka_id: str = Field(..., example="040101_1.0001.123/4")
    target_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", example="2026-06-15")
    include_terrain: bool = True
    geometry: Dict[str, Any]  # GeoJSON Polygon или MultiPolygon


class TerrainMetrics(BaseModel):
    status: Literal["OK", "NO_DATA", "ERROR"]
    mean_slope_deg: Optional[float] = None
    max_slope_deg: Optional[float] = None
    steep_area_pct: Optional[float] = None
    source: str = "Geoportal NMT WCS"


class SatelliteMetrics(BaseModel):
    status: Literal["OK", "CLOUDY_FALLBACK", "NO_DATA", "ERROR"]
    ndvi_mean: Optional[float] = None
    ndwi_mean: Optional[float] = None
    scene_date: Optional[str] = None
    cloud_cover_pct: Optional[float] = None
    source: str = "Sentinel-2 L2A (Earth Search)"


class GeoExtractResponse(BaseModel):
    dzialka_id: str
    terrain: Optional[TerrainMetrics] = None
    satellite: SatelliteMetrics
```

---

## 4. Коды ошибок HTTP (общие для всех сервисов)

* `400 Bad Request` — неверный формат кадастрового номера участка или некорректная дата (например, дата в далеком будущем).
* `404 Not Found` — участок с указанным `dzialkaId` не найден в реестре ULDK GUGiK (или клик на карте попал вне границ Польши / на водный объект).
* `502 Bad Gateway` — внешний источник данных (например, ULDK или Open-Meteo) временно недоступен.
* `504 Gateway Timeout` — превышен таймаут ожидания внешнего гео-сервиса (в ASP.NET рекомендуется ставить `HttpClient.Timeout = TimeSpan.FromSeconds(20)`, чтобы в любом случае уложиться в общий лимит 30 секунд).