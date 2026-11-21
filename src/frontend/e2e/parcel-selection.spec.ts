import { expect, test, type Page } from '@playwright/test';
import { clickLatLon, mapState, showOnMap, waitForMap } from './map';

/*
 * Real clicks on the real map. ULDK GUGiK, GUGiK KIEG (EGiB land use) and the map tiles are LIVE;
 * only our backend (/api/*) is stubbed, which also lets the test check what the UI sends to POST /api/analyze.
 * Screenshots of every key state go to e2e-results/screens/.
 */

const HOUSE = { id: '143703_4.0001.387', lat: 53.11922, lon: 19.84957 }; // EGiB kontur "B" (residential)
const FIELD = { lat: 53.1205, lon: 19.86 }; // EGiB "RV" (arable), next to the same village
const SEA = { lat: 54.9, lon: 14.2 }; // Baltic Sea — no cadastral parcel

const DEMO_REPORT_UUID = '11111111-2222-3333-4444-555555555555';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e-results/screens/${name}.png`, fullPage: false });

/**
 * POST /api/analyze after a map click: dzialkaId null + the clicked WGS84 point.
 * A mouse click lands on a whole pixel, so allow ~1 px (≈ 0.6 m at zoom 18) of difference.
 */
function expectClickPayload(body: unknown, at: { lat: number; lon: number }) {
  const b = body as { dzialkaId: unknown; lat: number; lon: number; cropId: string; targetDate: string };
  expect(b.dzialkaId).toBeNull();
  expect(b.cropId).toBe('winter_wheat');
  expect(b.targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(Math.abs(b.lat - at.lat)).toBeLessThan(2e-5);
  expect(Math.abs(b.lon - at.lon)).toBeLessThan(2e-5);
}

async function stubBackend(page: Page) {
  const analyzeBodies: unknown[] = [];
  await page.route('**/api/crops', (route) =>
    route.fulfill({
      json: [
        { id: 'winter_wheat', namePl: 'Pszenica ozima', kcMid: 1.15, criticalMonths: [5, 6], rootDepthCm: 120 },
        { id: 'maize', namePl: 'Kukurydza', kcMid: 1.2, criticalMonths: [6, 7, 8], rootDepthCm: 130 },
      ],
    }),
  );
  await page.route('**/api/analyze', async (route) => {
    // only the request matters here; the report rendering is covered by unit tests and report.spec.ts
    analyzeBodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 503, json: { title: 'stub backend' } });
  });
  return analyzeBodies;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
});

test('opens on farmland with parcel boundaries, not on the whole of Poland', async ({ page }) => {
  const { zoom } = await mapState(page);
  expect(zoom).toBeGreaterThanOrEqual(14);
  await expect(page.getByRole('button', { name: 'Granice działek' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Zdjęcie lotnicze' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.kieg-on-photo')).toHaveCount(1);

  // GUGiK must actually DRAW boundaries at the start zoom (it returns ~116-byte empty PNGs below zoom 17)
  await expect(page.locator('.kieg-on-photo img').first()).toBeVisible();
  const tileBytes = await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.kieg-on-photo img')).slice(0, 6);
    const sizes = await Promise.all(imgs.map(async (img) => (await (await fetch(img.src)).arrayBuffer()).byteLength));
    return Math.max(...sizes);
  });
  expect(tileBytes).toBeGreaterThan(500);
  await page.waitForTimeout(2500); // let the orthophoto tiles paint for the screenshot
  await shot(page, '01-start-view');
});

test('"Wstaw przykładową działkę" lands on an arable field in the start view with EGiB data', async ({ page }) => {
  await page.getByRole('button', { name: 'Wstaw przykładową działkę' }).click();
  await expect(page.locator('.parcel-tag__title')).toHaveText('143703_4.0001.1251');
  await expect(page.getByText(/Grunty orne/)).toBeVisible();
  await expect(page.getByText('Wybrany obszar wygląda na teren zabudowany', { exact: false })).toHaveCount(0);
  await page.waitForTimeout(2500);
  await shot(page, '01b-example-field');
});

test('click on a HOUSE plot: outline + EGiB warning, analysis blocked until confirmed', async ({ page }) => {
  const analyzeBodies = await stubBackend(page);
  await showOnMap(page, HOUSE.lat, HOUSE.lon, 18);
  await clickLatLon(page, HOUSE.lat, HOUSE.lon);

  // ULDK answer: parcel id in the card and the outline on the map
  await expect(page.locator('form').getByText(HOUSE.id, { exact: true })).toBeVisible();
  await expect(page.locator('.parcel-tag__title')).toHaveText(HOUSE.id);

  // EGiB (KIEG) answer: built-up land -> warning, amber dashed outline instead of neon
  await expect(page.getByText('Wybrany obszar wygląda na teren zabudowany lub nierolniczy', { exact: false })).toBeVisible();
  await expect(page.getByText(/teren zabudowany \(mieszkaniowy/)).toBeVisible();
  await expect(page.locator('.leaflet-parcelWarn-pane path')).not.toHaveCount(0);
  await expect(page.locator('.leaflet-parcelGlow-pane path')).toHaveCount(0);
  await shot(page, '02-house-warning');

  // submit is blocked
  await page.getByRole('button', { name: 'Sprawdź sytuację wodną' }).click();
  await expect(page.getByText('Wybierz inną działkę albo potwierdź, że to pole uprawne', { exact: false })).toBeVisible();
  expect(analyzeBodies).toHaveLength(0);

  // explicit confirmation -> neon outline, analysis allowed
  await page.getByRole('button', { name: 'To moje pole — potwierdzam' }).click();
  await expect(page.getByText('Wybór potwierdzony', { exact: false })).toBeVisible();
  await expect(page.locator('.leaflet-parcelGlow-pane path')).not.toHaveCount(0);
  await shot(page, '03-house-confirmed');

  await page.getByRole('button', { name: 'Sprawdź sytuację wodną' }).click();
  await expect.poll(() => analyzeBodies.length).toBe(1);
  expectClickPayload(analyzeBodies[0], HOUSE);
});

test('click on an ARABLE FIELD: neon outline, "Grunty orne" from EGiB, no warning', async ({ page }) => {
  const analyzeBodies = await stubBackend(page);
  await showOnMap(page, FIELD.lat, FIELD.lon, 17);
  await clickLatLon(page, FIELD.lat, FIELD.lon);

  await expect(page.getByText('Zaznaczona działka')).toBeVisible();
  await expect(page.getByText(/Grunty orne/)).toBeVisible();
  await expect(page.getByText('Wybrany obszar wygląda na teren zabudowany', { exact: false })).toHaveCount(0);
  await expect(page.locator('.leaflet-parcelGlow-pane path')).not.toHaveCount(0);
  await expect(page.locator('.parcel-tag__sub')).toContainText('ha');
  await shot(page, '04-field-selected');

  await page.getByRole('button', { name: 'Sprawdź sytuację wodną' }).click();
  await expect.poll(() => analyzeBodies.length).toBe(1);
  expectClickPayload(analyzeBodies[0], FIELD);
});

test('click on the SEA: Polish "not found" message, nothing outlined', async ({ page }) => {
  await showOnMap(page, SEA.lat, SEA.lon, 15);
  await clickLatLon(page, SEA.lat, SEA.lon);
  await expect(page.getByText('Nie znaleziono działki ewidencyjnej w tym miejscu', { exact: false })).toBeVisible();
  await expect(page.locator('.leaflet-parcelGlow-pane path')).toHaveCount(0);
  await shot(page, '05-sea-not-found');
});

test('click at country scale zooms in instead of picking a random parcel', async ({ page }) => {
  await showOnMap(page, 52.06, 18.6, 6);
  await clickLatLon(page, 52.4, 19.0);
  await expect(page.getByText('Przybliżono mapę', { exact: false })).toBeVisible();
  await expect.poll(async () => (await mapState(page)).zoom, { timeout: 5_000 }).toBeGreaterThanOrEqual(15);
  await expect(page.getByText('Zaznaczona działka')).toHaveCount(0);
});

test('typed parcel ID (how the jury enters parcels) is outlined on the map', async ({ page }) => {
  await page.getByPlaceholder('np. 040101_1.0001.123/4').fill(HOUSE.id);
  await expect(page.locator('.parcel-tag__title')).toHaveText(HOUSE.id);
  const { lat, lon, zoom } = await mapState(page);
  expect(zoom).toBeGreaterThanOrEqual(15); // map flew to the parcel
  expect(Math.abs(lat - HOUSE.lat)).toBeLessThan(0.01);
  expect(Math.abs(lon - HOUSE.lon)).toBeLessThan(0.02);
  await expect(page.getByText('Wybrany obszar wygląda na teren zabudowany', { exact: false })).toBeVisible();
  await shot(page, '06-typed-id');
});
