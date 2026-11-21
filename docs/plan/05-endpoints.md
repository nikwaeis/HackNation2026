# Часть 5. Эндпоинты

- `GET /api/crops`: справочник культур.
- `POST /api/analyze`: валидатор (либо `dzialkaId`, либо `lat`+`lon`; дата в пределах [сегодня − 10 лет, сегодня]; культура существует). Оркестрация Частей 2–4, сохранение `SavedReport` (payload в jsonb), ответ по api.md §3.2.
- `GET /api/reports/{uuid}`: payload из `saved_reports`.
- Если участок вне Польши или без номера, отвечаем 404 «Nie znaleziono działki ewidencyjnej dla wskazanej lokalizacji».
