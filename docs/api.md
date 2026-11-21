# Спецификация API, потоков данных и алгоритма расчета

**Проект:** Цифровой ассистент фермера (*Zatrzymaj wodę, chroń plony*)  
**Трек:** KOWR — HackNation 2026  
**Стек:** ASP.NET Core (Core API & Orchestrator) + Python FastAPI (Geo-Worker) + PostgreSQL/PostGIS + React/TypeScript

---

## 1. Архитектура и общая схема работы API

Система построена по гибридной микросервисной архитектуре внутри единого `docker-compose.yml` и работает в публичном режиме без регистрации пользователей и сбора персональных данных (PII).

### Распределение ответственности между сервисами
1. **Frontend (React + TypeScript):** принимает ввод от пользователя (кадастровый номер участка или клик по карте, культуру, дату анализа), отображает интерактивную карту с WMS-слоем засухи EDO и рендерит итоговый отчет с экспортом в PDF.
2. **Core Backend (ASP.NET Core):** выступает главным оркестратором. Принимает запросы от фронтенда, управляет кэшем в PostgreSQL/PostGIS, параллельно опрашивает текстовые/JSON API (ULDK, Open-Meteo, SoilGrids), делегирует обработку растров в Python-воркер, выполняет агрономические расчеты по алгоритму и сохраняет готовые отчеты.
3. **Geo-Worker (Python FastAPI):** stateless-микросервис без собственной базы данных. Принимает от ASP.NET Core полигон участка (GeoJSON) и целевую дату, выполняет потоковую нарезку растровых геоданных (спутниковые снимки Sentinel-2 и цифровая модель рельефа NMT) и возвращает агрегированные числовые метрики.
4. **Database (PostgreSQL 16 + PostGIS 3.4):** хранит справочник культур, предзагруженную гидрографию Польши, вечный кэш статических характеристик участков, кэш динамических наблюдений по датам и сгенерированные отчеты.

### Целевой бюджет времени выполнения ($\le 30\text{ секунд}$)
Чтобы уложиться в регламентный лимит 30 секунд на анализ любого участка Польши:
* При повторном запросе по связке `(dzialka_id, target_date)` данные отдаются из PostGIS за **$< 0.2\text{ сек}$**.
* При первом обращении к новому участку статические данные (границы, рельеф, почва, расстояние до воды) вычисляются один раз и кэшируются навсегда, а внешние запросы (Open-Meteo, SoilGrids, Python Geo-Worker) запускаются **асинхронно и параллельно** (`Task.WhenAll`), что позволяет завершить полный анализ за **7–12 секунд**.

---

## 2. Собираемые данные и внешние источники

Система в реальном времени объединяет **5 обязательных категорий** открытых данных (без использования захардкоженных заглушек):

| Категория | Источник / Сервис | Обработчик | Извлекаемые параметры | Режим обновления |
| :--- | :--- | :--- | :--- | :--- |
| **1. Пространственные (границы и рельеф)** | **ULDK GUGiK** (`uldk.gugik.gov.pl`) и **Geoportal.gov.pl** (WCS NMT) | ASP.NET (границы) + Python (рельеф) | Полигон участка (WKT/GeoJSON), воеводство, площадь (га), средний и максимальный уклон ($^\circ$), доля площади со склоном $> 3^\circ$. | Статичный кэш в PostGIS (`TTL =` $\infty$) |
| **2. Метеорологические** | **Open-Meteo Archive API** (`archive-api.open-meteo.com`) | ASP.NET Core | Ежедневные осадки ($P$, мм), эталонная эвапотранспирация ($ET_0$, мм), макс. температура ($^\circ\text{C}$) за окно 90 дней и за **10 лет** до `targetDate`. | Live при первом запросе, затем кэш по `(dzialka_id, target_date)` |
| **3. Спутниковые** | **Sentinel-2 L2A Earth Search** (`earth-search.aws.element84.com/v1`) | Python FastAPI | Каналы B04 (Red), B08 (NIR), B11 (SWIR1) и маска облаков SCL в окне $\pm 15\text{ дней}$ от `targetDate`. Расчет средних **NDVI** и **NDWI**. | Live при первом запросе, затем кэш по `(dzialka_id, target_date)` |
| **4. Почвенные** | **ISRIC SoilGrids v2.0** (`rest.isric.org/soilgrids/v2.0`) | ASP.NET Core | Доля песка (`sand`), глины (`clay`), ила (`silt`) и органического углерода (`soc`, г/кг) в слое 0–30 см. | Статичный кэш в PostGIS (`TTL =` $\infty$) |
| **5. Гидрологические** | **Hydroportal (ISOK) / Wody Polskie / OSM** + **Copernicus EDO WMS** | PostGIS + Frontend | Расстояние (`ST_Distance`, м) до ближайшей реки, мелиоративной канавы (`ditch`), озера или болота; фоновый слой засухи EDO на карте. | Предзагруженный слой в PostGIS + Live WMS на карте |

---

## 3. Спецификация внутренних API-эндпоинтов

### 3.1. Получение справочника культур
`GET /api/crops`  
Возвращает список поддерживаемых сельскохозяйственных культур с их агрономическими параметрами (по методике FAO-56) для выпадающего списка на фронтенде.

**Пример ответа (`200 OK`):**
```json
[
  {
    "id": "winter_wheat",
    "namePl": "Pszenica ozima",
    "kcMid": 1.15,
    "criticalMonths": [5, 6, 7],
    "rootDepthCm": 120
  },
  {
    "id": "maize",
    "namePl": "Kukurydza",
    "kcMid": 1.20,
    "criticalMonths": [6, 7, 8],
    "rootDepthCm": 100
  }
]
```

### 3.2. Запуск анализа участка (Главный эндпоинт)
`POST /api/analyze`  
Принимает кадастровый идентификатор ИЛИ географические координаты клика, выбранную культуру и целевую дату анализа (сегодня или любую дату за последние 10 лет).

**Тело запроса (`Request JSON`):**
```json
{
  "dzialkaId": "141611_2.0018.103",
  "lat": null,
  "lon": null,
  "cropId": "winter_wheat",
  "targetDate": "2026-07-15"
}
```
*(Примечание: если пользователь кликнул по карте, `dzialkaId` передается как `null`, а `lat` и `lon` заполняются координатами WGS84).*

**Тело ответа (`200 OK`):**
Структура строго соответствует обязательной последовательности этапов KOWR:
```json
{
  "reportUuid": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "parcelInfo": {
    "dzialkaId": "141611_2.0018.103",
    "voivodeship": "kujawsko-pomorskie",
    "areaHa": 14.52,
    "cropId": "winter_wheat",
    "cropNamePl": "Pszenica ozima",
    "targetDate": "2026-07-15",
    "polygonGeoJson": {
      "type": "Polygon",
      "coordinates": [[[18.007, 53.123], [18.009, 53.123], [18.009, 53.125], [18.007, 53.123]]]
    }
  },
  "step1_diagnosis": {
    "riskLevel": "HIGH",
    "summaryPl": "Wysokie ryzyko suszy rolniczej. Deficyt wody wynosi 196 mm w porównaniu do potrzeb pszenicy ozimej.",
    "historicalContextPl": "W ciągu ostatnich 10 lat niedobory wody na tej działce występowały w 6 sezonach (najczęściej maj–lipiec).",
    "metrics": {
      "precip90dMm": 98.4,
      "precip10yrAvg90dMm": 182.0,
      "waterBalanceMm": -196.6,
      "drySpellDays": 24,
      "historicalDroughtYears": 6,
      "ndviMean": 0.41,
      "ndwiMean": -0.18,
      "slopeDeg": 4.2,
      "sandPct": 74.0,
      "nearestWaterDistM": 85.0
    }
  },
  "step2_causesAndRetention": {
    "causesPl": [
      "Niskie opady (98.4 mm wobec normy 182.0 mm) oraz 24 dni bez opadów.",
      "Gleba lekka, piaszczysta (74% piasku) o niskiej pojemności wodnej.",
      "Nachylenie terenu (4.2°) przyspieszające spływ powierzchniowy."
    ],
    "retentionRecommendationsPl": [
      {
        "type": "LANDSCAPE",
        "title": "Zastawki na rowie melioracyjnym (85 m od działki)",
        "description": "Spowolnienie odpływu wody w pobliskim rowie podniesie poziom wód gruntowych w strefie korzeniowej."
      },
      {
        "type": "SOIL",
        "title": "Międzyplony i pozostawienie resztek pożniwnych",
        "description": "Zwiększy zawartość próchnicy (obecnie niska: 11.2 g/kg) i ograniczy parowanie z powierzchni gleby."
      }
    ]
  },
  "step3_irrigation": {
    "isRecommended": true,
    "advicePl": "Nawadnianie interwencyjne uzasadnione w krytycznej fazie nalewania ziarna (dawka 25–30 mm), wyłącznie po wdrożeniu zabiegów ograniczających parowanie."
  },
  "step4_sourcesAndLimitations": {
    "sources": [
      "ULDK GUGiK (granice działki ewidencyjnej)",
      "Open-Meteo Archive API (dane meteorologiczne 2016–2026)",
      "Sentinel-2 L2A Earth Search (zdjęcie z dnia 2026-07-12, zachmurzenie 5%)",
      "ISRIC SoilGrids v2.0 (skład granulometryczny gleby, rozdzielczość 250 m)",
      "Geoportal NMT WCS (numeryczny model terenu)"
    ],
    "limitationsPl": [
      "Dane glebowe SoilGrids mają rozdzielczość 250 m i mogą nie uwzględniać lokalnych zabiegów agrotechnicznych.",
      "Analiza nie uwzględnia aktualnego poziomu wód gruntowych w studniach lokalnych."
    ],
    "satelliteStatus": "OK"
  }
}
```

### 3.3. Получение сохраненного отчета по прямой ссылке
`GET /api/reports/{reportUuid}`  
Возвращает ранее сгенерированный отчет из таблицы `saved_reports` в формате, идентичном `POST /api/analyze`. Позволяет делиться отчетом и сохранять его без регистрации.

### 3.4. Внутренний контракт Geo-Worker (ASP.NET Core $\rightarrow$ Python FastAPI)
`POST http://geo-worker:8000/extract-geo`

**Запрос от ASP.NET Core:**
```json
{
  "dzialka_id": "141611_2.0018.103",
  "target_date": "2026-07-15",
  "need_terrain": true,
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[18.007, 53.123], [18.009, 53.123], [18.009, 53.125], [18.007, 53.123]]]
  }
}
```
*(Флаг `need_terrain` передается как `false`, если рельеф для данного участка уже закэширован в PostGIS).*

**Ответ от Python FastAPI:**
```json
{
  "mean_slope_deg": 4.2,
  "max_slope_deg": 7.8,
  "steep_area_pct": 38.0,
  "ndvi_mean": 0.41,
  "ndwi_mean": -0.18,
  "satellite_scene_date": "2026-07-12",
  "cloud_cover_pct": 5.0,
  "satellite_status": "OK"
}
```

---

## 4. Алгоритм обработки данных и принятия решений

Алгоритм спроектирован на основе научных материалов KOWR (методика FAO-56, мониторинг засухи IUNG-PIB и принцип *«retain water where it falls»*).

### Шаг 0. Идентификация участка и пространственная привязка
1. Если передан `lat` и `lon`, выполняется запрос к ULDK `GetParcelByXY` для получения официального `dzialkaId`.
2. Выполняется поиск `dzialkaId` в таблице `parcels`. Если запись отсутствует:
   * Запрашивается WKT-геометрия в ULDK (`GetParcelById`, SRID 4326).
   * Через PostGIS вычисляются площадь (`ST_Area(geom::geography) / 10000`) и центроид (`ST_Centroid(geom)`).
   * Через `ST_Distance` к таблице `hydro_features` определяется расстояние в метрах и тип ближайшего водного объекта (`river`, `ditch`, `lake`, `wetland`).

### Шаг 1. Оценка водной ситуации (Диагноз)
Система объединяет метеорологические, почвенные и спутниковые показатели за период $90\text{ дней}$ до `targetDate`:

1. **Потребность культуры во влаге ($ET_c$) по FAO-56:**
   $$ET_{c,90} = \sum_{i=1}^{90} \left( ET_{0,i} \times K_c(m_i) \right)$$
   где $ET_{0,i}$ — эталонная эвапотранспирация за $i$-й день из Open-Meteo, а $K_c(m_i)$ — коэффициент водопотребления выбранной культуры для соответствующего месяца $m_i$.

2. **Климатический водный баланс культуры ($WB_{90}$):**
   $$WB_{90} = P_{90} - ET_{c,90}$$
   где $P_{90}$ — сумма атмосферных осадков (мм) за 90 дней до `targetDate`.

3. **Оценка доступной влагоемкости почвы ($AWC$):**
   На основе гранулометрического состава (`sand_pct`, `clay_pct`) и содержания органического углерода (`soc`) из SoilGrids рассчитывается доступный запас влаги в корнеобитаемом слое $Z_r$ (мм):
   * Если $\text{sand\_pct} > 65\%$ — почва классифицируется как легкая песчаная с высокой уязвимостью к засухе ($AWC \approx 70\text{–}90\text{ мм/м}$).
   * Если $\text{clay\_pct} > 30\%$ — тяжелая связная почва ($AWC \approx 160\text{–}190\text{ мм/м}$).
   * Дефицит гумуса ($\text{soc} < 15\text{ г/кг}$) снижает расчетный коэффициент удержания влаги на $15\%$.

4. **Спутниковые индексы (вычисляются в Python по пикселям внутри полигона, очищенным от облаков по маске SCL):**
   $$\text{NDVI} = \frac{B08 - B04}{B08 + B04}, \quad \text{NDWI} = \frac{B08 - B11}{B08 + B11}$$
   * Падение $\text{NDWI} < -0.10$ в вегетационный период подтверждает водный стресс растительного покрова.

5. **Историческая уязвимость за 10 лет:**
   Для каждого из 10 предыдущих лет вычисляется $WB_{90}^{(y)}$ за аналогичное календарное окно. Подсчитывается количество лет `historicalDroughtYears`, в которых $WB_{90}^{(y)} < -100\text{ мм}$.

6. **Классификация итогового риска (`riskLevel`):**
   * **`CRITICAL`:** $WB_{90} < -180\text{ мм}$ И ($\text{drySpellDays} \ge 21$ ИЛИ $\text{NDWI} < -0.15$).
   * **`HIGH`:** $WB_{90} \in [-180, -110)\text{ мм}$ ИЛИ ($WB_{90} < -90\text{ мм}$ при песчаной почве $\text{sand\_pct} > 65\%$).
   * **`MODERATE`:** $WB_{90} \in [-110, -40)\text{ мм}$ ИЛИ `historicalDroughtYears` $\ge 5$.
   * **`LOW`:** $WB_{90} \ge -40\text{ мм}$ и отсутствие признаков водного стресса по спутнику.

### Шаг 2. Выявление причин и генерация рекомендаций по ретенции (Приоритет)
Рекомендации формируются строго на основе сработавших триггеров причин (детерминированный движок правил + опциональная стилизация текста на польском языке):

* **Триггер 1: Метеорологический дефицит** ($P_{90} < 0.75 \times P_{\text{10yr\_avg}}$ или $\text{drySpellDays} \ge 14$)
  * *Причина:* длительный период без осадков и повышенное испарение.
  * *Мера (Почвенная ретенция):* мульчирование и оставление пожнивных остатков (*pozostawienie resztek pożniwnych*) для снижения непродуктивного испарения с поверхности почвы.
* **Триггер 2: Низкая влагоемкость почвы** ($\text{sand\_pct} > 65\%$ или $\text{soc} < 15\text{ г/кг}$)
  * *Причина:* легкий гранулометрический состав и низкое содержание гумуса, вызывающие быструю инфильтрацию воды глубже корнеобитаемого слоя.
  * *Мера (Почвенная ретенция):* посев сидератов / междуплонов (*międzyplony*), переход на безотвальную обработку почвы (*uprawa bezorkowa*) для накопления органического вещества.
* **Триггер 3: Поверхностный сток со склона** ($\text{mean\_slope\_deg} > 3.0^\circ$ или $\text{steep\_area\_pct} > 25\%$)
  * *Причина:* значительный уклон рельефа приводит к быстрому скатыванию ливневых осадков за пределы поля.
  * *Мера (Ландшафтная и агротехническая ретенция):* поперечная обработка склона (*uprawa poprzeczna do stoku*), создание буферных травяных полос (*strefy buforowe*) и микроводоемов в нижней части склона.
* **Триггер 4: Близость мелиоративной сети** ($\text{nearest\_water\_type} = \text{'ditch'}$ и $\text{nearest\_water\_dist\_m} \le 300\text{ м}$)
  * *Причина:* осушительная канава вблизи поля ускоряет отвод грунтовых вод.
  * *Мера (Ландшафтная ретенция):* установка регулируемых запруд / шандоров на мелиоративной канаве (*zastawki na rowach melioracyjnych*) для удержания весеннего стока.

### Шаг 3. Рекомендации по поливу (В последнюю очередь)
Блок полива активируется (`isRecommended = true`) **только при одновременном выполнении трех условий**:
1. Уровень риска засухи равен `HIGH` или `CRITICAL`.
2. Целевая дата (`targetDate`) попадает в список критических месяцев влагопотребления данной культуры (`criticalMonths`) или $\text{NDWI} < -0.15$.
3. Агротехнические меры ретенции не способны мгновенно компенсировать текущий дефицит.

**Расчет нормы полива:**
$$D_{\text{irrig}} = \min\left( 35,\; \max\left( 15,\; 0.3 \times AWC_{\text{root}} \right) \right)\text{ [мм]}$$
Система рекомендует полив в утренние или вечерние часы (для минимизации потерь на испарение) разовой нормой $20\text{–}35\text{ мм}$ ($200\text{–}350\text{ м}^3/\text{га}$). Если условия не выполнены, выставляется `isRecommended = false` с пояснением, что приоритет следует отдать мерам сохранения почвенной влаги.

### Шаг 4. Прозрачность источников и честные ограничения
В финальный блок отчета автоматически добавляются:
* Точный перечень использованных API и дат актуальности данных (включая реальную дату спутникового снимка Sentinel-2 и процент облачности).
* Динамические дисклеймеры о погрешностях:
  * Если `satellite_status == "NO_DATA"` (100% облачность в окне $\pm 15\text{ дней}$): явное предупреждение о том, что оценка выполнена на основе метео- и почвенных моделей без спутниковой коррекции.
  * Стандартное уведомление о пространственном разрешении глобальной почвенной сетки ISRIC SoilGrids ($250\text{ м}$) и отсутствии прямых телеметрических замеров уровня грунтовых вод на участке.

---

## 5. Обработка сбоев и отказоустойчивость

Чтобы прототип гарантированно проходил тестирование жюри на любых участках Польши и исторических датах:
1. **Таймауты внешних API:** на каждый внешний HTTP-запрос установлен жесткий таймаут ($8\text{ сек}$ для текстовых API, $18\text{ сек}$ для Geo-Worker).
2. **Деградация без падения (Graceful Degradation):** если внешний сервис (например, SoilGrids или Sentinel-2) временно недоступен или не содержит данных для указанной даты/точки, ASP.NET Core не возвращает ошибку `500`, а использует базовые региональные средние значения (для почвы) или пропускает спутниковый коэффициент, обязательно фиксируя этот факт в массиве `limitationsPl`.
3. **Валидация координат:** если клик пользователя пришелся на территорию за пределами Польши или на водный/городской объект без кадастрового номера в ULDK, API возвращает понятную ошибку `404 Not Found` с сообщением на польском языке (*«Nie znaleziono działki ewidencyjnej dla wskazanej lokalizacji»*).