# Part 3. Dynamic observations

Cached per `(dzialka_id, target_date)` in `dynamic_observations`.

- Open-Meteo: one request for `[target − 10 years − 90 days, min(target, today)]`. The archive lags a few days behind,
  so missing days are reported in the limitations.
- Python `/extract-geo` is called in parallel with the weather request (`Task.WhenAll`).
- Aggregates: P30, P90, ET₀ 90, drySpellDays, 10-year mean P90, historicalDroughtYears; computed by the part 4 functions.
- A race of two first requests is caught by the unique index on (parcel, date): the row is re-read.
- Terrain from part 2: with `need_terrain`, store the slope metrics in `ParcelStaticProfile` (new method `UpdateRelief`;
  only the full `Refresh` existed).

## How it was built
- `Features/Analysis/Shared/ObservationService.GetOrCreateAsync(parcel, targetDate)`. If the (parcel, date) row exists,
  it is returned at once. Otherwise Open-Meteo and Python `/extract-geo` are called in parallel, the aggregates computed
  and a `DynamicObservation` saved.
- Aggregates in `WeatherAggregates` (pure function):
  - P30, P90, ET₀ 90;
  - `drySpellDays` — longest run of days with P < 1 mm;
  - P90 norm — mean P90 of the past years that have data;
  - `WindowMonths` — P and ET₀ sums per month of the window for each of the 11 years.
- **Schema change (decision of 2026-11-21):** ETc and drought years depend on the crop, while the cache is keyed only by
  (parcel, date). So instead of a `historical_drought_years` column a jsonb `window_months` is stored (migration
  `ObservationWindowMonths`). Part 4 computes ETc = Σ ET₀(month)·Kc(month) for any crop straight from the cache.
- Terrain: with `MeanSlopeDeg == null` the request goes with terrain enabled and the answer is written through
  `ParcelStaticProfile.UpdateRelief` in the same `SaveChanges`.
- If the worker is down or sends inconsistent satellite data, the satellite part is `NO_DATA` and the analysis does not fail.
- The window end is capped at today (the archive rejects future dates). The last days may not be filled yet and are
  simply missing; part 4 adds a limitation based on `FetchedAt` and `TargetDate`.

**Later changes (part 6):** a worker failure is stored as `Error` (not `NO_DATA`) and the satellite / missing terrain is
asked again on a later request (at most once a minute); the live fetch is coalesced per (parcel, date) and runs in its own
DI scope.
