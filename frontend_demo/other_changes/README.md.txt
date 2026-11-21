Правки вне src/frontend (копии файлов в тех же относительных путях + changes.patch — diff относительно коммита 36d6c7a).

- docker-compose.dev.yml   — сервис frontend (Vite dev, прокси /api -> api:8080, VITE_USE_POLLING для Windows)
- docker-compose.prod.yml  — сервис frontend (nginx, порт ${FRONTEND_PORT:-80})
- README.md                — упоминание фронтенда и запуска
- .env.example / .env.prod.example — переменные FRONTEND_PORT, VITE_API_BASE_URL
- src/python-service/Dockerfile.dev / Dockerfile.prod — установка libexpat1
  (без неё rasterio падает: ImportError: libexpat.so.1)

Применить патч к репозиторию:  git apply frontend_demo/other_changes/changes.patch
