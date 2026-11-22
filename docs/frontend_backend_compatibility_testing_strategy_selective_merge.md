# Frontend–Backend Compatibility Testing Strategy & Selective Merge to `main` (`WodoPlon`)

## 1. Objective

1. Ensure full end-to-end compatibility between the updated frontend (`src/frontend`) and the stable backend (`src/backend`, plus `src/python-service` behind the API) on the `main` branch.

2. Perform a controlled, selective merge from the test-case branch (`<testcase-branch>`) into `main` so that **only verified frontend changes (`src/frontend/`)** are merged, while any backend, Python worker, or infrastructure modifications from the test-case branch are strictly excluded.

## 2. Frontend ↔ Backend Contract & Compatibility Matrix

Verify every integration boundary before and after merging the frontend changes into `main`:

| Endpoint / Service | Direction | Compatibility Verification Criteria | Expected Result | 
| ----- | ----- | ----- | ----- | 
| `GET /api/health` | FE → BE | Reachability via Vite proxy (`/api`) and Nginx without CORS issues | `200 OK` | 
| `GET /api/crops` | FE → BE | Array structure (`id`, `namePl`, `criticalMonths`, `kcMid`, `rootDepthCm`) | Crop selector in `ParcelForm` renders all crops and critical months cleanly | 
| `POST /api/analyze` | FE → BE | Payload (`dzialkaId`, `lat`, `lon`, `cropId`, `targetDate`), `Europe/Warsaw` timezone handling, and `AR_` sheet identifiers | `200 OK` (< 30s cold / < 500ms warm); `400` on invalid input | 
| `AnalysisResponse` | BE → FE | Presence and typing of `parcelInfo`, `step1_diagnosis`, `step2_causesAndRetention`, `step3_irrigation`, `step4_sourcesAndLimitations`, and `reportUuid` | `ReportView` renders all 4 steps safely even when `ndviMean`, `ndwiMean`, or `nearestWaterDistM` are `null` | 
| `GET /api/reports/{reportUuid}` | FE → BE | Direct navigation to `/report/:reportUuid` without authentication | `200 OK` with full report; `404` for missing or malformed UUIDs (never `500`) | 
| `ULDK GUGiK` | FE → Gov API | Map click (`lat`, `lon`) and manual `dzialkaId` input | Accurate `Polygon` / `MultiPolygon` rendering; clear Polish warnings for out-of-bounds or built-up areas | 
| `WMS / Map Tiles` | FE → Gov/OSM | Layer toggles (`Mapa`, `Zdjęcie lotnicze`, `Granice działek`, `Susza (EDO)`) with uppercase WMS params and `tileerror` fallback | Zero `400 Bad Request` errors on EDO; graceful legend notice if tiles fail | 

## 3. Three-Stage Regression Plan Around the Merge

### Stage 1: Pre-Merge Static & Type Baseline

* Inspect `git status` and `git log` on both `main` and `<testcase-branch>`.

* Verify interface alignment between `src/frontend/src/types/api.ts`, `src/frontend/src/api/*`, and `WodoPlon.Api` DTOs on `main`.

* Run a strict frontend production build (`npm run build` / `tsc -b && vite build`) on `<testcase-branch>` and run `dotnet test WodoPlon.slnx` on `main`.

### Stage 2: Integration Testing Against Unmodified `main` Backend

* Run the backend, Python Geo-Worker, PostgreSQL/PostGIS, and Redis strictly from the `main` branch code.

* Connect the updated `src/frontend` and execute the core smoke suite:

  1. **Scenario A (Map Click + Current Date):** Click an arable parcel (`141611_2.0018.103` or `140402_2.0035.280`) → select a crop → select today's date (`Dzisiaj`) → run analysis → verify map contour and all 4 report steps.

  2. **Scenario B (Historical Date + Cache):** Run analysis on the same parcel for `2022-07-15` → re-run to verify PostGIS cache acceleration.

  3. **Scenario C (UI Edge Cases):** Click outside Poland (clears previous `dzialkaId` + shows Polish message), click on a built-up urban parcel (displays non-agricultural warning), toggle `Kontrast` (dark mode), and verify `@media print` / PDF output.

  4. **Scenario D (Report Sharing):** Open `/report/:reportUuid` in a fresh incognito tab without login.

### Stage 3: Post-Merge Verification & Cross-Browser E2E on `main`

* Re-run `dotnet test`, `pytest`, and `npm run build` directly on the merged `main` commit.

* Audit `git show --stat HEAD` on `main` to confirm that 100% of modified paths reside inside `src/frontend/`.

* **Cross-Browser Verification (Firefox & Safari / WebKit):** Project requirements mandate Firefox and Safari support. Once Playwright WebKit installation finishes, run the full cross-browser E2E suite:

  ```bash
  cd src/frontend && set E2E_ALL_BROWSERS=1 && npx playwright test
  ```

  *(On PowerShell, use `$env:E2E_ALL_BROWSERS="1"; npx playwright test`; on macOS/Linux, use `E2E_ALL_BROWSERS=1 npx playwright test`.)*

## 4. Safe Frontend-Only Merge & Conflict Resolution Guide

### Known Parallel Changes & Conflict Areas

* **Expected Frontend Merge Conflicts:** A teammate edited `ParcelMap` (`src/frontend/src/components/ParcelMap.tsx`), `HomePage` (`src/frontend/src/pages/HomePage.tsx`), and translation files (`src/frontend/src/i18n/*`) in parallel on `main`. Rather than blindly overwriting `src/frontend` with `git checkout <testcase-branch> -- src/frontend`, merge carefully and resolve conflicts in those three areas by preserving **both** the teammate's `main` improvements and the verified `testcase` fixes (uppercase WMS params + `tileerror` fallback for `Susza (EDO)`, OSM underlay beneath `ORTO`, `dzialkaId` reset on out-of-Poland clicks, built-up parcel warnings, dark mode `Kontrast`, and mobile legend positioning).

* **Python Worker Compatibility:** The Python Geo-Worker (`src/python-service`) is backwards- and forwards-compatible with **both** versions of the C# client (both the teammate's updated client on `main` and the legacy client), so keeping `main`'s backend and Python service untouched is completely safe.

### Step-by-Step Merge Procedure

1. **Sync branches and inspect differences:**

   ```bash
   git fetch --all
   git checkout main
   git pull origin main
   git diff --stat main..<testcase-branch>
   ```

2. **Create a safety backup branch before merging:**

   ```bash
   git branch backup/main-before-fe-merge
   ```

3. **Merge or selectively apply frontend changes into `main`:**

   * Option A (if `<testcase-branch>` also contains backend commits you must exclude):

     ```bash
     git merge --no-commit --no-ff <testcase-branch>
     # Restore main's backend, python-service, and root/docker configs immediately
     git checkout HEAD -- src/backend src/python-service docs docker-compose.dev.yml docker-compose.prod.yml .env.example .env.prod.example
     ```

   * Resolve any remaining merge conflicts specifically in `ParcelMap.tsx`, `HomePage.tsx`, and translation files (`src/frontend/src/i18n/*`), keeping valid translation keys and functional improvements from both sides.

4. **Verify zero backend or infrastructure files are staged:**

   ```bash
   git status
   git diff --cached --name-only | grep -v "^src/frontend/"
   ```

   *(The `grep -v "^src/frontend/"` check must return empty output.)*

5. **Build, test (including Firefox & Safari/WebKit), and commit:**

   ```bash
   cd src/frontend && npm run build && set E2E_ALL_BROWSERS=1 && npx playwright test && cd ../..
   dotnet test src/backend/WodoPlon.slnx
   git commit -m "feat(frontend): merge verified UI/UX, map, and cross-browser improvements from testcase"
   ```

## 5. Remaining Backend Handoff Notes (For Teammate)

The backend on `main` was intentionally left untouched during frontend work. Pass these two items to your backend teammate:

1. **Outdated Example Parcel ID in Resource Files:** `SharedResources.*.resx` still contains the non-existent placeholder parcel ID (`040101_1.0001.123/4`). Update it to a valid ULDK parcel ID (e.g., `141611_2.0018.103`).

2. **API Documentation Drift (`docs/api_asp_net_core_python_fastapi.md`):** This document diverges from the actual runtime API contract implemented in `AnalysisResponse.cs` / `docs/api.md` (e.g., `step1_diagnosis` vs `step1_WaterAssessment`, missing `precip30dMm` exposure in response metrics, `LIVE`/`CACHED` source tags, and recommendation priority fields). Align `docs/api_asp_net_core_python_fastapi.md` with the actual contract or update the DTOs accordingly.

## 6. Prompt for Claude Code (Selective Frontend-Only Merge & Conflict Resolution)

Copy and paste this prompt into Claude Code at the repository root:

```text
Merge ONLY the frontend changes (`src/frontend`) from the test-case branch into `main` without including backend changes (`src/backend`), Python service changes (`src/python-service`), or Docker/root config changes from that branch.

Important context before starting:
- A teammate edited `ParcelMap.tsx`, `HomePage.tsx`, and translation files (`src/frontend/src/i18n/*`) on `main` in parallel with our `testcase` branch, so expect merge conflicts in those files. Resolve those conflicts thoughtfully by preserving BOTH `main`'s improvements and `testcase`'s verified fixes (uppercase WMS params + `tileerror` fallback on `Susza (EDO)`, OSM underlay under `ORTO`, clearing `dzialkaId` on out-of-Poland clicks, built-up parcel warnings, dark mode `Kontrast`, and mobile EDO legend positioning).
- Keep `main`'s `src/backend` and `src/python-service` 100% untouched (the Python worker is compatible with both C# client versions).

Follow these exact steps:
1. Inspect `git status`, `git branch -a`, and `git diff --stat main..<TEST_CASE_BRANCH>` (replace `<TEST_CASE_BRANCH>` with the actual branch name).
2. Ensure we are on `main`, create a backup branch `backup/main-before-fe-merge`, and merge `<TEST_CASE_BRANCH>` with `--no-commit --no-ff`.
3. Immediately restore `main`'s version of everything outside `src/frontend/` (specifically `src/backend`, `src/python-service`, `docs`, and root/Docker files) so ONLY `src/frontend/` changes remain.
4. Resolve conflicts in `ParcelMap.tsx`, `HomePage.tsx`, and translation files without losing functionality or translation keys from either side.
5. Audit `git status` and `git diff --cached --name-only` to confirm that zero files outside `src/frontend/` are modified or staged.
6. Run verification checks:
   - `npm run build` (or `npm.cmd run build`) inside `src/frontend`
   - `E2E_ALL_BROWSERS=1 npx playwright test` inside `src/frontend` (to verify Chromium, Firefox, and Safari/WebKit once WebKit is ready)
   - `dotnet test` inside `src/backend`
7. Commit the clean frontend-only merge on `main` (`feat(frontend): merge verified UI/UX, map, and cross-browser improvements from testcase`) and output a concise summary listing:
   - how conflicts in `ParcelMap`, `HomePage`, and translations were resolved,
   - confirmation that `src/backend` and `src/python-service` from `<TEST_CASE_BRANCH>` were excluded,
   - exact build and Playwright cross-browser (Firefox/WebKit) test results,
   - final `git status`.
```