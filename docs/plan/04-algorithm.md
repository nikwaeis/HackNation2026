# Part 4. Algorithm (pure static classes and unit tests)

- `WaterBalance`:
  - ETc = Σ ET₀ᵢ·Kc(mᵢ), where Kc(m) = KcMid in `CriticalMonths`, KcInitial before them, KcLate after;
  - WB90 = P90 − ETc90;
  - drySpellDays — longest run of days with P < 1 mm;
  - historicalDroughtYears — number of years with WB90 < −100 mm (*changed in part 6, see below*).
- `SoilAwc`: AWC (mm/m) and AWC_root = AWC·rootDepth.
- Risk classifier → `WaterDeficitLevel` by api.md §4 item 6. Rules are checked in order CRITICAL → HIGH → MODERATE → LOW.
- Retention rules: triggers 1–4 produce causes and measures.
- Irrigation advisor: 3 conditions, D = min(35, max(15, 0.3·AWC_root)).
- Limitations: SoilGrids 250 m, no groundwater data, satellite `NO_DATA`, fallback values, weather archive delay.
- Inputs come from parts 2–3: `ParcelStaticProfile`, `DynamicObservation` (with `WindowMonths`) and `Crop`. ETc of the
  current window and `historicalDroughtYears` are computed from `WindowMonths` for the selected crop.

## How it was built
Everything is in `Features/Analysis/Shared/`: pure static functions without I/O. Entry point:
`AnalysisEngine.Assess(profile, observation, crop, text) → Assessment`. The `Assessment` record mirrors the steps of §3.2.

| File | Content |
|---|---|
| `WaterBalance` | Kc by month, ETc, balance, 10-year median, drought years, `Classify` |
| `Recommendations` | Triggers 1–4 → causes and measures (landscape first), irrigation |
| `ReportSources` | Sources and limitations |
| `ReportText` | Report sentences from the `Report.*` resources in the request language |

Interpretations where api.md was ambiguous:
- **Kc(month):** KcMid in `CriticalMonths`, KcInitial before them, KcLate after.
- **Gap in the classification:** WB < −180 without a ≥ 21-day dry spell and without NDWI < −0.15 matched no rule; it is
  treated as HIGH.
- **Irrigation condition 3** ("retention cannot compensate right away") is always considered met: retention measures act
  over seasons, not days.
- **Irrigation dose:** clamp(0.3·AWC·rootDepth, 15, 35), rounded to mm.
- **When no trigger fires,** one SOIL measure "Utrzymanie okrywy roślinnej" (keep the plant cover) is still returned so
  step 2 is never empty.
- **Numbers in report texts** use a dot (`98.4 mm`), as in the contract example.

**Later changes (part 6):** with absolute thresholds a typical Kujawy wheat parcel was HIGH in 7–8 of 10 years. The KOWR
materials ask to tell a current drought apart from a place that is dry by climate, so HIGH / MODERATE and drought years
are now measured against the parcel's own 10-year median balance; CRITICAL stays absolute (api.md §4). Texts moved to
`SharedResources.pl.resx` / `.en.resx`.
