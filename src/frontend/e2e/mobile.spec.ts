import { expect, test, type Locator } from '@playwright/test';
import { mapState, showOnMap, waitForMap } from './map';

/* Phone layout (390 × 844, touch) — the farmer's most likely device in the field. */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const FIELD = { lat: 53.1205, lon: 19.86 };

async function insideViewport(el: Locator, name: string) {
  const box = await el.boundingBox();
  expect(box, `${name} is rendered`).not.toBeNull();
  expect(box!.x, `${name} left edge`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${name} right edge`).toBeLessThanOrEqual(390);
}

test('home on a phone: big map, compact controls, nothing sticks out', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);

  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const mapBox = (await page.locator('.leaflet-container').first().boundingBox())!;
  expect(mapBox.height).toBeGreaterThanOrEqual(0.5 * 844 - 1); // at least half the screen

  // pinch zoom replaces +/-; shortcuts stay
  await expect(page.locator('.leaflet-control-zoom')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Moja lokalizacja' })).toBeVisible();

  // all four layer buttons fit on one row, inside the screen
  for (const name of ['Mapa', 'Zdjęcie lotnicze', 'Granice działek', 'Susza (EDO)']) {
    await insideViewport(page.getByRole('button', { name, exact: true }), name);
  }
  const dock = (await page.getByRole('toolbar', { name: 'Warstwy mapy' }).boundingBox())!;
  expect(dock.height).toBeLessThan(60); // single row

  // theme toggle has an accessible name even without its text label
  await expect(page.getByRole('button', { name: 'Kontrast' })).toBeVisible();

  // map credits are tucked behind an "i" button, shown on demand (licences require them)
  const credits = page.locator('.leaflet-control-attribution');
  await expect(credits).toBeHidden();
  await page.getByRole('button', { name: 'Źródła danych mapy' }).tap();
  await expect(credits).toBeVisible();
  await expect(credits).toContainText('Geoportal');
  await insideViewport(credits, 'map credits');
  await page.getByRole('button', { name: 'Źródła danych mapy' }).tap();
  await expect(credits).toBeHidden();
});

test('tap on a field selects it; the legend is a collapsible chip', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await showOnMap(page, FIELD.lat, FIELD.lon, 17);
  const pt = await page.evaluate(([lat, lon]) => {
    const m = (window as unknown as { __wodoplonMaps: Record<string, { latLngToContainerPoint: (c: [number, number]) => { x: number; y: number }; getContainer: () => HTMLElement }> }).__wodoplonMaps.home;
    const p = m.latLngToContainerPoint([lat, lon]);
    const r = m.getContainer().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, [FIELD.lat, FIELD.lon] as const);
  await page.touchscreen.tap(pt.x, pt.y);

  await expect(page.getByText('Zaznaczona działka')).toBeVisible();
  await expect(page.locator('.parcel-tag__title')).toBeVisible();
  await insideViewport(page.locator('.parcel-tag__card'), 'parcel tag');

  const legend = page.locator('#map-legend');
  const toggle = page.getByRole('button', { name: 'Legenda' });
  await expect(legend).toBeHidden();
  await toggle.tap();
  await expect(legend).toBeVisible();
  await insideViewport(legend, 'legend');
  await toggle.tap();
  await expect(legend).toBeHidden();

  // switching the drought layer on opens the legend with its status
  await page.getByRole('button', { name: 'Susza (EDO)' }).tap();
  await expect(page.getByTestId('edo-legend')).toBeVisible();
  expect((await mapState(page)).zoom).toBeGreaterThanOrEqual(15);
});

test('report on a phone: compact floating buttons with names, no horizontal scroll', async ({ page }) => {
  await page.goto('/report/demo-preview');
  await waitForMap(page, 'report');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  const pdf = page.getByRole('button', { name: 'Pobierz raport PDF' }).first();
  const link = page.getByRole('button', { name: 'Kopiuj link' }).first();
  await insideViewport(pdf, 'PDF button');
  await insideViewport(link, 'link button');
  expect((await pdf.boundingBox())!.width).toBeLessThan(80); // icon-only on phones

  await expect(page.getByRole('heading', { name: 'Ocena sytuacji wodnej' })).toBeVisible();
  await page.screenshot({ path: 'e2e-results/screens/14-mobile-report.png' });
});
