# Часть 4. Алгоритм (чистые static-классы и юнит-тесты)

- `WaterBalance`:
  - ETc = Σ ET0ᵢ·Kc(mᵢ), где Kc(m) = KcMid в `CriticalMonths`, KcInitial до них, KcLate после;
  - WB90 = P90 − ETc90;
  - drySpellDays — самая длинная серия дней с P < 1 мм;
  - historicalDroughtYears — число лет с WB90 < −100 мм.
- `SoilAwc`: AWC (мм/м) и AWC_root = AWC·rootDepth.
- `RiskClassifier` → `WaterDeficitLevel` по api.md §4 п.6. Правила проверяются по порядку CRITICAL → HIGH → MODERATE → LOW.
- `RetentionRules`: триггеры 1–4 дают причины и меры.
- `IrrigationAdvisor`: 3 условия, D = min(35, max(15, 0.3·AWC_root)).
- `Limitations`: SoilGrids 250 м, нет данных о грунтовых водах, `NO_DATA` со спутника, fallback-значения, задержка архива метео.
- Вход берётся из Частей 2–3: `ParcelStaticProfile`, `DynamicObservation` (с `WindowMonths`) и `Crop`. ETc текущего окна и `historicalDroughtYears` считаются из `WindowMonths` под выбранную культуру.

## Как сделано
Всё лежит в `Features/Analysis/Shared/`. Это чистые static-функции без I/O. Точка входа: `AnalysisEngine.Assess(profile, observation, crop) → Assessment`. Record `Assessment` повторяет шаги §3.2 один в один.

| Файл | Что внутри |
|---|---|
| `WaterBalance` | Kc по месяцу, ETc, баланс, засушливые годы, `Classify` |
| `Recommendations` | Триггеры 1–4 → причины и меры (Landscape идут первыми), полив |
| `ReportSources` | Источники и limitations |

Интерпретации там, где api.md неоднозначен:
- **Kc(месяц):** в `CriticalMonths` берётся KcMid, до них KcInitial, после KcLate.
- **Дыра в классификации:** при WB < −180 без засухи ≥21 дня и без NDWI < −0.15 не подходит ни одно правило. Считаем такой случай HIGH, то есть HIGH = WB < −110.
- **LOW:** требует ещё NDWI ≥ −0.10, иначе MODERATE (по §4 п.6: «отсутствие признаков водного стресса по спутнику»).
- **Условие 3 для полива** («ретенция не компенсирует мгновенно») считается выполненным всегда: меры ретенции дают эффект за сезоны, а не за дни.
- **Доза полива:** clamp(0.3·AWC·rootDepth, 15, 35) с округлением до мм.
- **Если ни один триггер не сработал,** всё равно выдаём одну SOIL-меру «Utrzymanie okrywy roślinnej», чтобы шаг 2 не был пустым.
- **Числа в польских текстах** пишутся с точкой (`98.4 mm`), как в примере контракта.
