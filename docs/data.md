# Архитектура базы данных и стратегия кэширования (PostgreSQL + PostGIS)

Документ описывает структуру хранения данных, политику кэширования и разделение потоков между **ASP.NET Core** (оркестратор и хранилище) и **Python Geo-Worker** (обработка растровых геоданных). Архитектура спроектирована так, чтобы укладываться в лимит **< 30 секунд** на анализ одного участка и соблюдать требования прозрачности источников данных.

---

## 1. Стратегия кэширования: Live-данные vs Кэш

В соответствии с требованиями к технической документации и масштабируемости, все данные разделены на 4 уровня по времени жизни (TTL):

| Уровень | Тип данных | Источники | Политика хранения (TTL) | Кто обрабатывает |
| :--- | :--- | :--- | :--- | :--- |
| **1. Preloaded (Static)** | Справочник культур (коэффициенты $K_c$), гидрография Польши (реки, канавы, озера) | FAO-56, Hydroportal (ISOK) / OSM | **Постоянно** (загружается при старте БД) | PostgreSQL / PostGIS (`ST_Distance`) |
| **2. Infinite Cache** | Границы кадастровых участков (*działki*), рельеф (уклон), состав почвы | ULDK GUGiK, Geoportal NMT WCS, ISRIC SoilGrids | **Бессрочно** (кэшируется после первого запроса по `dzialka_id`) | ASP.NET Core + Python (`rasterio`) |
| **3. Date-Bound Cache** | Метео-агрегаты за 10 лет до целевой даты и спутниковые индексы (NDVI, NDWI) | Open-Meteo Archive/Forecast, Sentinel-2 Earth Search | **Кэш по ключу `(dzialka_id, target_date)`** (первый запрос идет LIVE, повторный — из БД) | ASP.NET Core (метео) + Python (спутники) |
| **4. Reports Storage** | Сгенерированные отчеты для фермера с выводами, цифрами и ограничениями | Внутренний Decision Engine | **Постоянно** по уникальному `UUID` (доступ по ссылке без регистрации) | ASP.NET Core |

---

## 2. Сущности базы данных

### 2.1. Справочники и предзагруженные слои

#### `crops` (Справочник сельскохозяйственных культур)
Используется для расчета эвапотранспирации культуры ($ET_c = ET_0 \times K_c$) и определения критических периодов чувствительности к засухе.
* `id` (`VARCHAR(50)`, PK) — системный код культуры (`winter_wheat`, `maize`, `rapeseed`, `sugar_beet`, `potato`).
* `name_pl` (`VARCHAR(100)`) — название на польском языке для интерфейса фермера (*Pszenica ozima*, *Kukurydza* и др.).
* `kc_initial` (`NUMERIC(4,2)`) — коэффициент культуры на начальной фазе роста.
* `kc_mid` (`NUMERIC(4,2)`) — коэффициент культуры в пике вегетации.
* `kc_late` (`NUMERIC(4,2)`) — коэффициент культуры в фазе созревания.
* `critical_months` (`INT[]`) — массив месяцев наибольшей уязвимости к дефициту влаги (например, `{5, 6, 7}`).
* `root_depth_cm` (`INT`) — глубина корнеобитаемого слоя в сантиметрах.

#### `hydro_features` (Предзагруженная гидрография)
Слой водных объектов (реки, мелиоративные канавы, озера, болота) для мгновенного пространственного поиска в PostGIS.
* `id` (`BIGSERIAL`, PK)
* `feature_type` (`VARCHAR(30)`) — тип объекта (`river`, `ditch`, `lake`, `wetland`).
* `name` (`VARCHAR(150)`, nullable) — название объекта.
* `geom` (`GEOMETRY(Geometry, 4326)`, GIST-индекс) — геометрия линии или полигона.

---

### 2.2. Кэш пространственных характеристик участка

#### `parcels` (Границы кадастровых участков)
Кэширует геометрию, полученную из польского сервиса **ULDK GUGiK**.
* `dzialka_id` (`VARCHAR(64)`, PK) — официальный TERYT-идентификатор участка (например, `141611_2.0018.103`).
* `voivodeship` (`VARCHAR(64)`, nullable) — воеводство.
* `area_ha` (`NUMERIC(10,4)`) — площадь участка в гектарах.
* `centroid` (`GEOMETRY(Point, 4326)`) — центроид для точечных запросов погоды и почвы.
* `geom` (`GEOMETRY(MultiPolygon, 4326)`, GIST-индекс) — полигон границ участка.
* `fetched_at` (`TIMESTAMPTZ`) — дата и время получения данных из ULDK.

#### `parcel_static_profiles` (Профиль почвы, рельефа и гидро-окружения)
Агрегирует статичные природные характеристики участка из трех источников: рельеф (Python + Geoportal NMT), почва (ASP.NET + ISRIC SoilGrids), гидрология (PostGIS).
* `dzialka_id` (`VARCHAR(64)`, PK, FK $\rightarrow$ `parcels.dzialka_id`)
* **Рельеф (Geoportal NMT WCS):**
  * `mean_slope_deg` (`NUMERIC(5,2)`) — средний уклон поверхности в градусах.
  * `max_slope_deg` (`NUMERIC(5,2)`) — максимальный уклон.
  * `steep_area_pct` (`NUMERIC(5,2)`) — доля площади участка со склоном $> 3^\circ$ (риск поверхностного стока).
* **Почва (ISRIC SoilGrids, слой 0–30 см):**
  * `sand_pct` (`NUMERIC(5,2)`) — содержание песка (%).
  * `clay_pct` (`NUMERIC(5,2)`) — содержание глины (%).
  * `silt_pct` (`NUMERIC(5,2)`) — содержание ила (%).
  * `organic_carbon_g_kg` (`NUMERIC(6,2)`) — содержание органического углерода (гумуса).
  * `awc_mm_per_m` (`NUMERIC(6,2)`) — доступная влагоемкость почвы (мм/м).
  * `soil_drought_vulnerability` (`VARCHAR(20)`) — категория уязвимости (`HIGH`, `MEDIUM`, `LOW`).
* **Гидрология (PostGIS `ST_Distance`):**
  * `nearest_water_dist_m` (`NUMERIC(10,2)`) — расстояние до ближайшего водного объекта в метрах.
  * `nearest_water_type` (`VARCHAR(30)`) — тип ближайшего водного объекта (`ditch`, `river`, `lake`).
* `fetched_at` (`TIMESTAMPTZ`) — метка времени формирования профиля.

---

### 2.3. Кэш динамических наблюдений на дату

#### `dynamic_observations` (Метеоданные за 10 лет + Спутник)
Хранит результаты live-запросов для конкретной пары `(участок + дата анализа)`.
* `id` (`BIGSERIAL`, PK)
* `dzialka_id` (`VARCHAR(64)`, FK $\rightarrow$ `parcels.dzialka_id`)
* `target_date` (`DATE`) — выбранная пользователем дата анализа.
* *(Уникальный составной индекс `UNIQUE(dzialka_id, target_date)`)*
* **Метеорология (Open-Meteo, 10-летний архив + актуальный период):**
  * `precip_30d_mm` (`NUMERIC(7,2)`) — сумма осадков за 30 дней до `target_date`.
  * `precip_90d_mm` (`NUMERIC(7,2)`) — сумма осадков за 90 дней до `target_date`.
  * `precip_10yr_avg_90d_mm` (`NUMERIC(7,2)`) — 10-летняя климатическая норма осадков за аналогичный 90-дневный период.
  * `et0_90d_mm` (`NUMERIC(7,2)`) — суммарная эталонная эвапотранспирация за 90 дней.
  * `dry_spell_days` (`INT`) — максимальная непрерывная серия дней без осадков ($< 1$ мм).
  * `window_months` (`JSONB`) — суммы P и ET0 по каждому календарному месяцу внутри 90-дневного окна, для года `target_date` и 10 прошлых лет (`[{YearsBack, Month, PrecipMm, Et0Mm}]`). Kc зависит только от месяца, поэтому ETc и `historicalDroughtYears` считаются под выбранную культуру при анализе, без нового запроса к Open-Meteo.
* **Спутниковый мониторинг (Sentinel-2 L2A Earth Search, окно $\pm 15$ дней):**
  * `ndvi_mean` (`NUMERIC(5,4)`, nullable) — средний индекс вегетации по полигону.
  * `ndwi_mean` (`NUMERIC(5,4)`, nullable) — средний индекс влажности по полигону.
  * `satellite_scene_date` (`DATE`, nullable) — дата использованного безоблачного снимка.
  * `cloud_cover_pct` (`NUMERIC(5,2)`, nullable) — процент облачности над участком.
  * `satellite_status` (`VARCHAR(30)`) — статус качества данных (`OK`, `CLOUDY_FALLBACK`, `NO_DATA`).
* `fetched_at` (`TIMESTAMPTZ`) — время получения данных из внешних API.

---

### 2.4. Пользовательские отчеты (без регистрации)

#### `saved_reports` (Сохраненные отчеты по публичной ссылке)
Позволяет фермеру открыть или переслать сформированный отчет без создания аккаунта и сбора персональных данных.
* `report_uuid` (`UUID`, PK, default `gen_random_uuid()`) — публичный идентификатор для ссылки `/report/{uuid}`.
* `dzialka_id` (`VARCHAR(64)`, FK $\rightarrow$ `parcels.dzialka_id`)
* `crop_id` (`VARCHAR(50)`, FK $\rightarrow$ `crops.id`)
* `target_date` (`DATE`)
* `water_deficit_level` (`VARCHAR(20)`) — итоговая оценка риска (`LOW`, `MODERATE`, `HIGH`, `CRITICAL`).
* `report_payload` (`JSONB`) — полный структурированный отчет (Этап 1: оценка ситуации, Этап 2: причины и ретенция, Этап 3: полив, Этап 4: источники и ограничения).
* `created_at` (`TIMESTAMPTZ`) — дата генерации отчета.

---

## 3. SQL-скрипт инициализации (`init.sql`)

```sql
-- Включение пространственного расширения PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Справочник культур
CREATE TABLE crops (
    id VARCHAR(50) PRIMARY KEY,
    name_pl VARCHAR(100) NOT NULL,
    kc_initial NUMERIC(4,2) NOT NULL,
    kc_mid NUMERIC(4,2) NOT NULL,
    kc_late NUMERIC(4,2) NOT NULL,
    critical_months INT[] NOT NULL,
    root_depth_cm INT NOT NULL
);

-- Начальное заполнение основных культур Польши
INSERT INTO crops (id, name_pl, kc_initial, kc_mid, kc_late, critical_months, root_depth_cm) VALUES
('winter_wheat', 'Pszenica ozima', 0.40, 1.15, 0.30, '{5,6}', 120),
('maize', 'Kukurydza', 0.30, 1.20, 0.50, '{6,7,8}', 130),
('rapeseed', 'Rzepak ozimy', 0.40, 1.15, 0.35, '{4,5,6}', 110),
('sugar_beet', 'Burak cukrowy', 0.35, 1.20, 0.70, '{6,7,8}', 100),
('potato', 'Ziemniak', 0.50, 1.15, 0.75, '{6,7}', 60);

-- 2. Предзагруженная гидрография
CREATE TABLE hydro_features (
    id BIGSERIAL PRIMARY KEY,
    feature_type VARCHAR(30) NOT NULL,
    name VARCHAR(150),
    geom GEOMETRY(Geometry, 4326) NOT NULL
);
CREATE INDEX idx_hydro_features_geom ON hydro_features USING GIST (geom);

-- 3. Кэш кадастровых участков
CREATE TABLE parcels (
    dzialka_id VARCHAR(64) PRIMARY KEY,
    voivodeship VARCHAR(64),
    area_ha NUMERIC(10,4) NOT NULL,
    centroid GEOMETRY(Point, 4326) NOT NULL,
    geom GEOMETRY(MultiPolygon, 4326) NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_parcels_geom ON parcels USING GIST (geom);

-- 4. Статичный профиль участка (Почва + Рельеф + Гидрология)
CREATE TABLE parcel_static_profiles (
    dzialka_id VARCHAR(64) PRIMARY KEY REFERENCES parcels(dzialka_id) ON DELETE CASCADE,
    mean_slope_deg NUMERIC(5,2),
    max_slope_deg NUMERIC(5,2),
    steep_area_pct NUMERIC(5,2),
    sand_pct NUMERIC(5,2),
    clay_pct NUMERIC(5,2),
    silt_pct NUMERIC(5,2),
    organic_carbon_g_kg NUMERIC(6,2),
    awc_mm_per_m NUMERIC(6,2),
    soil_drought_vulnerability VARCHAR(20),
    nearest_water_dist_m NUMERIC(10,2),
    nearest_water_type VARCHAR(30),
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Кэш динамических наблюдений (Метео за 10 лет + Спутник Sentinel-2)
CREATE TABLE dynamic_observations (
    id BIGSERIAL PRIMARY KEY,
    dzialka_id VARCHAR(64) NOT NULL REFERENCES parcels(dzialka_id) ON DELETE CASCADE,
    target_date DATE NOT NULL,
    precip_30d_mm NUMERIC(7,2),
    precip_90d_mm NUMERIC(7,2),
    precip_10yr_avg_90d_mm NUMERIC(7,2),
    et0_90d_mm NUMERIC(7,2),
    dry_spell_days INT,
    window_months JSONB NOT NULL DEFAULT '[]',
    ndvi_mean NUMERIC(5,4),
    ndwi_mean NUMERIC(5,4),
    satellite_scene_date DATE,
    cloud_cover_pct NUMERIC(5,2),
    satellite_status VARCHAR(30) NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (dzialka_id, target_date)
);

-- 6. Сохраненные отчеты
CREATE TABLE saved_reports (
    report_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dzialka_id VARCHAR(64) NOT NULL REFERENCES parcels(dzialka_id),
    crop_id VARCHAR(50) NOT NULL REFERENCES crops(id),
    target_date DATE NOT NULL,
    water_deficit_level VARCHAR(20) NOT NULL,
    report_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Безопасность и конфиденциальность

* **Отсутствие персональных данных (PII):** В базе данных не хранятся имена, фамилии, телефоны, e-mail или учетные записи фермеров. Идентификация происходит исключительно по публичному кадастровому номеру участка (*działka ewidencyjna*) или сгенерированному `report_uuid`.
* **Прозрачность погрешностей:** Поле `satellite_status` в таблице `dynamic_observations` фиксирует ситуации отсутствия безоблачных снимков, чтобы система не выдавала ложных расчетов и явно предупреждала пользователя в блоке ограничений отчета.