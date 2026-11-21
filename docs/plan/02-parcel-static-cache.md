# Часть 2. Участок и статичный кэш (Шаг 0)

1. Если пришли `lat`/`lon`, вызываем `IUldkClient.GetByPointAsync` и получаем `dzialkaId`.
2. Ищем `parcels` по id. Если записи нет, вызываем ULDK `GetByIdAsync`, затем `Parcel.Create`. Площадь считаем через `ST_Area(geom::geography)/10000`.
3. Если `ParcelStaticProfile` ещё нет:
   - Почва: SoilGrids по центроиду, затем расчёт AWC (порог песка >65 % → 70–90 мм/м, глины >30 % → 160–190 мм/м, при SOC<15 штраф −15 %). Если SoilGrids вернул `null`, берём региональное среднее и пишем это в limitations.
   - Вода: Overpass в радиусе 1 км → вставка в `hydro_features`, затем `ST_Distance(geography)` даёт ближайший объект и его тип.
   - Рельеф: Python `need_terrain=true`. Рельеф можно сохранить сразу после первого вызова в Части 3.
4. Профиль кэшируем навсегда (TTL ∞).

## Как сделано
- `Features/Analysis/Shared/ParcelProfileService` (scoped) с методами `ResolveByIdAsync(dzialkaId)` и `ResolveByPointAsync(lat, lon)`. Возвращает `Parcel` вместе с `StaticProfile`.
- Участок и профиль сохраняются одним `SaveChanges`. Если два первых запроса пришли одновременно, второй ловит unique violation и перечитывает запись из БД.
- `SoilAwc`: песок >65 % даёт 80 мм/м и уязвимость High, глина >30 % даёт 175 мм/м и Low, остальное считается суглинком: 130 мм/м и Medium. При SOC <15 г/кг AWC умножается на 0.85. Если SoilGrids не вернул данных, берём суглинок, а фракции оставляем `null`. По `SandPct == null` Часть 4 поймёт, что сработал fallback, и добавит limitation.
- В `hydro_features` добавлена колонка `osm_id` с unique-индексом (миграция `HydroFeatureOsmId`): у соседних участков общие канавы, дубли не нужны. Ближайший водный объект ищем через `ST_DWithin` и `ST_Distance` по geography, перед этим bbox-префильтр по GIST.
- **В Часть 3:** рельеф (`need_terrain = MeanSlopeDeg is null`). Ответ Python пишем в профиль, нужен доменный метод `UpdateRelief`.
