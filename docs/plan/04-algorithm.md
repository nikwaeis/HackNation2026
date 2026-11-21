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
