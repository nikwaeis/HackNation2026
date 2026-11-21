# Часть 1. Клиенты внешних API

Каждый клиент устроен так:
- typed `HttpClient`;
- интерфейс в `Common/Interface/`, records ответа лежат там же;
- реализация в `Common/Services/`;
- регистрация в `Extensions/ExternalApiExtension.cs`.

URL и таймаут (8 с) задаются в секции `ExternalApis` (`ExternalApisSettings`). Таймаут Python-воркера 18 с.

| Клиент | Запрос | Ответ | При сбое |
|---|---|---|---|
| `IUldkClient` | `GetParcelById` / `GetParcelByXY`, `result=id,voivodeship,geom_wkt&srid=4326` | `Result<UldkParcel>` | `-1` → `NotFound` (`External.ParcelNotFound`), иначе `Failure` |
| `IOpenMeteoClient` | `/v1/archive`, daily `precipitation_sum, et0_fao_evapotranspiration, temperature_2m_max` | `Result<DailyWeather[]>`, дни с `null` пропускаем | `Failure` (`External.WeatherUnavailable`) |
| `ISoilGridsClient` | `/soilgrids/v2.0/properties/query`, `sand, clay, silt, soc`, слои 0–30 см | `SoilSample?`: делим на `d_factor`, усредняем с весами по толщине слоя | `null` |
| `IOverpassClient` | ways `waterway=river\|stream\|canal\|ditch\|drain`, `natural=water\|wetland` в радиусе | `HydroFeatureData[]?` | `null` |
| `IPythonServiceClient.ExtractGeoAsync` | `POST /extract-geo`, snake_case | `GeoMetrics?` | `null` |

Проверено живыми запросами (2026-11-21):
- ULDK при `srid=4326` отдаёт WKT вида `SRID=4326;POLYGON((lon lat, ...))`. Первая строка ответа — статус: `0` значит успех, `-1 brak wyników` значит ничего не найдено.
- SoilGrids в городских точках отдаёт `mean: null`. `sand` приходит в g/kg (d_factor 10 → %), `soc` в dg/kg (d_factor 10 → g/kg).
- Open-Meteo отвечает `429 Daily API request limit exceeded`. **Риск:** бесплатный тариф считает запрос за 10 лет как сотни вызовов, это примерно 35–40 анализов в сутки с одного IP. Если упрёмся, нужен API-ключ (customer-архив).
- Overpass из сети разработчика недоступен (таймаут), поэтому формат взят из документации.

Для Python-воркера геометрия отправляется как GeoJSON `MultiPolygon`: так участок хранится в БД. Воркер должен принимать `Polygon` и `MultiPolygon` (`shapely.geometry.shape` понимает оба).
