# Part 2. Parcel and static cache (step 0)

1. With `lat`/`lon`, call `IUldkClient.GetByPointAsync` to get the `dzialkaId`.
2. Look the parcel up in `parcels`. If missing, call ULDK `GetByIdAsync`, then `Parcel.Create`. Area via
   `ST_Area(geom::geography)/10000`.
3. If there is no `ParcelStaticProfile` yet:
   - Soil: SoilGrids at the centroid, then AWC (sand > 65% → 70–90 mm/m, clay > 30% → 160–190 mm/m, SOC < 15 → −15%).
     If SoilGrids returns `null`, use the regional average and state it in the limitations.
   - Water: Overpass within 1 km → insert into `hydro_features`, then `ST_Distance(geography)` gives the nearest object
     and its type.
   - Terrain: Python with `need_terrain=true`. It can be stored right after the first call in part 3.
4. The profile is cached forever.

## How it was built
- `Features/Analysis/Shared/ParcelProfileService` (scoped) with `ResolveByIdAsync(dzialkaId)` and
  `ResolveByPointAsync(lat, lon)`. Returns the `Parcel` together with its `StaticProfile`.
- Parcel and profile are saved in one `SaveChanges`. If two first requests arrive at once, the second one catches the
  unique violation and re-reads the row.
- `SoilAwc`: sand > 65% gives 80 mm/m and vulnerability High, clay > 30% gives 175 mm/m and Low, everything else is
  treated as loam: 130 mm/m and Medium. With SOC < 15 g/kg AWC is multiplied by 0.85. Without SoilGrids data the loam
  values are used and the fractions stay `null`; part 4 sees `SandPct == null` and adds a limitation.
- `hydro_features` got an `osm_id` column with a unique index (migration `HydroFeatureOsmId`): neighbouring parcels share
  ditches, duplicates are not needed. The nearest object is found with `ST_DWithin` and `ST_Distance` on geography, after
  a bounding-box prefilter on the GIST index.
- **Moved to part 3:** terrain (`need_terrain = MeanSlopeDeg is null`). The Python answer is written into the profile by
  a new domain method `UpdateRelief`.

**Later changes (part 6):** concurrent first requests are coalesced through HybridCache (one ULDK / SoilGrids call per
parcel, one ULDK call per map point); the water lookup moved to `WaterLookupService` (local OSM import, synchronous;
Overpass in the background as a fallback) with `water_checked_at` / `water_data_date` on the profile.
