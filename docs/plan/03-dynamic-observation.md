# Часть 3. Динамические наблюдения

Кэш по ключу `(dzialka_id, target_date)`, лежит в `dynamic_observations`.

- Open-Meteo: один запрос на `[target − 10 лет − 90 дней, min(target, сегодня)]`. Архив отстаёт на несколько дней, поэтому недостающие дни пишем в limitations.
- Python `/extract-geo` вызывается параллельно с метео (`Task.WhenAll`).
- Агрегаты: P30, P90, ET0 90, drySpellDays, P90 в среднем за 10 лет, historicalDroughtYears. Считаются функциями из Части 4.
- Гонка двух первых запросов ловится по unique index `ParcelDateIndexName`: перечитываем запись из БД.
