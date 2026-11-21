# Часть 3. Динамические наблюдения

Кэш по ключу `(dzialka_id, target_date)`, лежит в `dynamic_observations`.

- Open-Meteo: один запрос на `[target − 10 лет − 90 дней, min(target, сегодня)]`. Архив отстаёт на несколько дней, поэтому недостающие дни пишем в limitations.
- Python `/extract-geo` вызывается параллельно с метео (`Task.WhenAll`).
- Агрегаты: P30, P90, ET0 90, drySpellDays, P90 в среднем за 10 лет, historicalDroughtYears. Считаются функциями из Части 4.
- Гонка двух первых запросов ловится по unique index `ParcelDateIndexName`: перечитываем запись из БД.
- Добавить рельеф из Части 2: при `need_terrain` сохранить slope-метрики в `ParcelStaticProfile` (новый метод `UpdateRelief`, сейчас есть только полный `Refresh`).

## Как сделано
- `Features/Analysis/Shared/ObservationService.GetOrCreateAsync(parcel, targetDate)`. Если для пары (участок, дата) уже есть запись, сразу возвращает её. Иначе параллельно запрашивает Open-Meteo и Python `/extract-geo`, считает агрегаты и сохраняет `DynamicObservation`.
- Агрегаты в `WeatherAggregates` (чистая функция):
  - P30, P90, ET0 90;
  - `drySpellDays` — самая длинная серия дней с P < 1 мм;
  - норма P90 — среднее P90 за прошлые годы, у которых есть данные;
  - `WindowMonths` — суммы P и ET0 по месяцам окна для каждого из 11 лет.
- **Изменение схемы (решение 2026-11-21):** ETc и засушливые годы зависят от культуры, а кэш привязан только к паре (участок, дата). Поэтому вместо колонки `historical_drought_years` теперь хранится jsonb `window_months` (миграция `ObservationWindowMonths`). Часть 4 считает ETc = Σ ET0_месяц·Kc(месяц) для любой культуры прямо из кэша.
- Рельеф: при `MeanSlopeDeg == null` запрос уходит с `need_terrain=true`, ответ записывается через `ParcelStaticProfile.UpdateRelief` в том же `SaveChanges`.
- Если воркер недоступен или прислал противоречивые спутниковые данные, считаем `NO_DATA`, анализ не падает.
- Конец окна ограничен сегодняшним днём (архив не принимает даты из будущего). Последние дни архив ещё не успел заполнить, и они просто отсутствуют. В Части 4 по `FetchedAt` и `TargetDate` добавим limitation.
