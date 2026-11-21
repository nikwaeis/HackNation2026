# WodoPlon

Инфраструктурная основа проекта:
- `src/backend/` — .NET 10 Minimal API (`WodoPlon.Api`, `WodoPlon.Domain`, `WodoPlon.UnitTests`) + PostgreSQL 17 + Redis 7
- `src/python-service/` — каркас микросервиса на FastAPI (в `docker-compose` пока закомментирован как заглушка)
- `src/frontend/` — публичный сайт: React + TypeScript + Vite + Tailwind + Leaflet (см. `src/frontend/README.md`)

---

## Быстрый старт (Dev)

### 1. Создайте `.env` в корне проекта

```bash
cp .env.example .env
```

При необходимости отредактируйте `API_PORT`, `Cors__WebOrigin`, `POSTGRES_PORT`, `REDIS_PORT`.

### 2. Запустите бэкенд, PostgreSQL и Redis

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

- **Frontend:** `http://localhost:5173` (`/api` проксируется на сервис `api`)
- **API:** `http://localhost:5254`
- **Health:** `http://localhost:5254/api/health`
- **OpenAPI JSON (Development):** `http://localhost:5254/openapi/v1.json`
- **Логи API:** `docker compose -f docker-compose.dev.yml logs -f api`
- **Остановка:** `docker compose -f docker-compose.dev.yml down`

---

## Сборка и тесты локально

```bash
dotnet test src/backend/WodoPlon.slnx

# фронтенд без Docker (демо-режим работает и без бэкенда)
cd src/frontend && npm install && npm run dev
```
