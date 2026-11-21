# WodoPlon — frontend

Публичный веб-интерфейс WodoPlon (задача KOWR «Zatrzymaj wodę, chroń plony», HackNation 2026).
React 19 + TypeScript + Vite + Tailwind CSS 4, карта на Leaflet / react-leaflet. Интерфейс на польском, без логина и без сбора персональных данных.

## Запуск

```bash
cd src/frontend
npm install
npm run dev          # http://localhost:5173, /api проксируется на http://localhost:5254
npm run build        # проверка типов + production-сборка в dist/
```

Без бэкенда: кнопка **«Załaduj przykład (demo)»** включает mock-режим с точным JSON-примером из
`api_asp_net_core_python_fastapi.md` (раздел 1.2). Ссылка на демо-отчёт `/report/550e8400-e29b-41d4-a716-446655440000`
открывается даже без API. Чтобы всегда работать в mock-режиме: `VITE_USE_MOCK=true`.

## Переменные окружения (`.env.example`)

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Базовый URL API в браузере (вызовы `<base>/crops`, `<base>/analyze`, `<base>/reports/{uuid}`). Для прямого обращения: `http://localhost:5254/api` (нужен CORS `Cors__WebOrigin`). |
| `VITE_API_PROXY_TARGET` | `http://localhost:5254` | Только dev: куда Vite проксирует `/api`. В docker-compose: `http://api:8080`. |
| `VITE_USE_MOCK` | `false` | `true` — всегда использовать демо-отчёт. |

`VITE_*` встраиваются в бандл при сборке (в `Dockerfile.prod` — через `--build-arg`).

## Docker

- `Dockerfile.dev` — Vite dev server (порт 5173), используется в `docker-compose.dev.yml`.
- `Dockerfile.prod` — сборка + nginx (порт 80). `nginx.conf` отдаёт SPA (fallback на `index.html` для `/report/:uuid`)
  и проксирует `/api/` на сервис `api:8080`, поэтому CORS в production не нужен.

## Структура

```
src/
  api/          types.ts (контракт), client.ts (fetch, таймауты, ошибки), mock.ts (демо + fallback культур)
  components/   ParamsPanel, ParcelMap (Leaflet), LoadingSteps, ErrorBox, ui
  components/report/
                ReportHeader, Step1WaterAssessment, Step2CausesAndRetention,
                Step3Irrigation, Step4SourcesAndLimitations, ReportView
  pages/        Workspace.tsx — единый экран для `/` и `/report/:reportUuid`
  lib/format.ts польские подписи, форматирование чисел/дат, валидация
```

## Поведение

- **Порядок отчёта фиксирован** (`ReportView.tsx`): 1 Ocena sytuacji wodnej → 2 Przyczyny i retencja → 3 Nawadnianie → 4 Źródła i ograniczenia.
- **Формат ответа API:** фронт работает с ответом бэкенда по `docs/api.md` §3.2 (`parcelInfo`, `step1_diagnosis`,
  `step2_causesAndRetention.causesPl[] / retentionRecommendationsPl[{type: LANDSCAPE|SOIL}]`, `step3_irrigation`,
  `step4_sourcesAndLimitations.sources: string[]`, `satelliteStatus`). `api/normalize.ts` приводит его к модели UI и также
  понимает старый пример из `api_asp_net_core_python_fastapi.md` (используется в демо). Потребность культуры в воде
  выводится как `precip90dMm − waterBalanceMm` (бэкенд считает баланс как P − ETc). Поля, которых нет в ответе, не показываются.
- **Выбор участка:** номер działki (`dzialkaId`) или клик по карте (`lat`/`lon`, `dzialkaId = null`). Слой границ działek
  (GUGiK KIEG) выключен по умолчанию — публичный сервис ограничивает число запросов; включается в переключателе слоёв, виден с 15-го зума.
- **Подложки:** OpenStreetMap, ортофотомапа Geoportal (GUGiK), спутник Esri.
- **Дата:** по умолчанию сегодня, диапазон — последние 10 лет, будущее заблокировано.
- **Ошибки** `400 / 404 / 429 / 502 / 504`, таймаут (40 с) и отсутствие сети показываются на польском; `detail` из ProblemDetails выводится как «Komunikat serwera».
- **PDF:** кнопка «Pobierz raport PDF / Drukuj» → `window.print()`; стили `@media print` в `index.css` скрывают панели и карту
  и печатают шапку (номер działki, площадь, культура, дата) и все 4 шага. Контур участка в шапке — SVG из `geometry`, без тайлов.

## Лицензии зависимостей

Все production-зависимости — пермиссивные: `react`, `react-dom`, `react-router-dom` (MIT), `leaflet` (BSD-2-Clause),
`lucide-react` (ISC); сборка — `vite`, `tailwindcss`, `typescript` (MIT / Apache-2.0).
`react-leaflet` **намеренно не используется**: он под лицензией Hippocratic-2.1 (не MIT/BSD/Apache), поэтому карта —
собственная тонкая обёртка над Leaflet (`components/ParcelMap.tsx`).
Шрифты Atkinson Hyperlegible Next и Bricolage Grotesque — SIL OFL 1.1 (Google Fonts).

Проверка: `node -e "..."` по `package-lock.json` или `npx license-checker --production --summary`.
