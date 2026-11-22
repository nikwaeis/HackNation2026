import { expect, test, type Page } from '@playwright/test';
import { clickLatLon, mapState, showOnMap, waitForMap } from './map';

/* "Susza (EDO)" layer against the live Copernicus EDO WMS (and one run with the service blocked). */

const DEKAD = /TIME=\d{4}-\d{2}-(01|11|21)\b/;

/** clip-path of the panes that are cut to the Polish border ('' = not clipped) */
function paneClips(page: Page) {
  return page.evaluate(() => {
    const map = (window as unknown as { __wodoplonMaps: Record<string, import('leaflet').Map> }).__wodoplonMaps.home;
    return { drought: map.getPane('droughtPane')?.style.clipPath, orto: map.getPane('ortoPane')?.style.clipPath };
  });
}

test('home: drought layer requests a valid dekad, legend explains the data date and the ~5 km resolution', async ({ page }) => {
  const edoTileUrls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('drought.emergency.copernicus.eu') && r.url().includes('GetMap')) edoTileUrls.push(r.url());
  });

  await page.goto('/');
  await waitForMap(page);
  await page.getByRole('button', { name: 'Susza (EDO)' }).click();

  const legend = page.getByTestId('edo-legend');
  await expect(legend).toHaveAttribute('data-status', 'ok');
  await expect(legend).toContainText(/Stan na dekadę: \d{4}-\d{2}-(01|11|21) \(najnowsze dostępne dane\)/);
  await expect(legend).toContainText('Brak koloru oznacza brak ostrzeżenia suszowego');
  expect(edoTileUrls.length).toBeGreaterThan(0);
  expect(edoTileUrls.every((u) => DEKAD.test(u))).toBe(true);

  // field zoom: the legend explains the coarse grid and offers to zoom out
  await expect(legend).toContainText('rozdzielczość ok. 5 km');
  await page.screenshot({ path: 'e2e-results/screens/11-edo-field-zoom.png' });
  // drought warnings are always cut to Poland; the photo only at country / region zoom
  expect(await paneClips(page)).toEqual({ drought: expect.stringMatching(/^path\(evenodd/), orto: '' });
  await legend.getByRole('button', { name: 'Oddal do regionu' }).click();
  await expect.poll(async () => (await mapState(page)).zoom, { timeout: 5_000 }).toBeLessThanOrEqual(8);
  await expect(legend).not.toContainText('rozdzielczość ok. 5 km');
  await expect(legend).toHaveAttribute('data-status', 'ok');

  // the tiles must actually show up: Leaflet fades each tile in from opacity 0, and a layer that keeps
  // redrawing (new WMS params object on every render) never gets there
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const tiles = [...document.querySelectorAll<HTMLImageElement>('.leaflet-pane img')].filter((i) =>
            i.src.includes('drought.emergency'),
          );
          return tiles.length > 0 && tiles.every((i) => i.complete && getComputedStyle(i).opacity === '1');
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
  const requestsAfterLoad = edoTileUrls.length;
  await page.waitForTimeout(2500);
  expect(edoTileUrls.length).toBe(requestsAfterLoad); // no redraw loop while the map is idle
  // region zoom: both the drought layer and the photo (black outside Poland) are cut to the border
  expect(await paneClips(page)).toEqual({
    drought: expect.stringMatching(/^path\(evenodd/),
    orto: expect.stringMatching(/^path\(evenodd/),
  });
  await page.screenshot({ path: 'e2e-results/screens/12-edo-region.png' });
});

test('EDO service down: clear Polish status, the rest of the map keeps working', async ({ page }) => {
  await page.route('**/drought.emergency.copernicus.eu/**', (route) => route.abort('connectionrefused'));
  await page.goto('/');
  await waitForMap(page);
  await page.getByRole('button', { name: 'Susza (EDO)' }).click();

  const legend = page.getByTestId('edo-legend');
  await expect(legend).toHaveAttribute('data-status', 'error');
  await expect(legend).toContainText('Mapa suszy jest chwilowo niedostępna');
  await expect(page.getByRole('button', { name: 'Susza (EDO)' })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'e2e-results/screens/13-edo-unavailable.png' });

  // parcel selection is unaffected
  const field = { lat: 53.1205, lon: 19.86 };
  await showOnMap(page, field.lat, field.lon, 17);
  await clickLatLon(page, field.lat, field.lon);
  await expect(page.getByText('Zaznaczona działka')).toBeVisible();
});

test('report: drought layer shows the dekad of the analysis date', async ({ page }) => {
  const edoTileUrls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('drought.emergency.copernicus.eu') && r.url().includes('GetMap')) edoTileUrls.push(r.url());
  });
  await page.goto('/report/demo-preview'); // demo analysis date 2026-06-15
  await waitForMap(page, 'report');
  await page.getByRole('button', { name: 'Susza (EDO)' }).click();

  const legend = page.getByTestId('edo-legend');
  await expect(legend).toHaveAttribute('data-status', 'ok');
  await expect(legend).toContainText('Stan na dekadę: 2026-06-11 (najbliższa dacie analizy)');
  expect(edoTileUrls.length).toBeGreaterThan(0);
  expect(edoTileUrls.every((u) => u.includes('TIME=2026-06-11'))).toBe(true);
});
