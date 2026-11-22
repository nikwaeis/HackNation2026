import { expect, test, type Locator, type Page } from '@playwright/test';
import { clickLatLon, showOnMap, waitForMap } from './map';

const HOUSE = { lat: 53.11922, lon: 19.84957 }; // EGiB "B" -> warning box is shown
const FIELD = { lat: 53.1205, lon: 19.86 }; // EGiB "RV"

/**
 * WCAG contrast of an element's text against its own background (alpha-blended over the page canvas),
 * plus the background luminance — a "white hole" in the dark theme has luminance close to 1.
 */
async function colours(el: Locator) {
  return el.evaluate((node) => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 0];
      const [r, g, b, a = '1'] = m[1].split(/[ ,/]+/).filter(Boolean);
      return [Number(r), Number(g), Number(b), Number(a)];
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    // walk up until an opaque-enough background is found, blending translucent layers over it
    const layers: number[][] = [];
    let cur: Element | null = node;
    while (cur) {
      const bg = parse(getComputedStyle(cur).backgroundColor);
      if (bg[3] > 0) layers.push(bg);
      if (bg[3] >= 0.99) break;
      cur = cur.parentElement;
    }
    let base = parse(getComputedStyle(document.body).backgroundColor);
    for (const l of layers.reverse()) {
      base = [0, 1, 2].map((i) => l[i] * l[3] + base[i] * (1 - l[3])).concat(1);
    }
    const text = parse(getComputedStyle(node).color);
    const lb = lum(base);
    const lt = lum(text);
    const contrast = (Math.max(lb, lt) + 0.05) / (Math.min(lb, lt) + 0.05);
    return { bgLuminance: lb, contrast };
  });
}

async function expectDarkAndReadable(el: Locator, name: string, minContrast = 4.5) {
  await expect(el, name).toBeVisible();
  const c = await colours(el);
  expect(c.bgLuminance, `${name}: background should be dark`).toBeLessThan(0.1);
  expect(c.contrast, `${name}: text contrast`).toBeGreaterThanOrEqual(minContrast);
}

async function enableDarkMode(page: Page) {
  await page.getByRole('button', { name: 'Kontrast' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
}

test('"Większy tekst" is gone; "Kontrast" turns on a readable dark theme on the home page', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await expect(page.getByRole('button', { name: 'Większy tekst' })).toHaveCount(0);

  await enableDarkMode(page);

  await expectDarkAndReadable(page.locator('header').getByText('Asystent wodny rolnika'), 'header subtitle');
  await expectDarkAndReadable(page.getByRole('heading', { name: 'Sprawdź wodę na swojej działce' }), 'form title');
  await expectDarkAndReadable(page.locator('#dzialka-id-input'), 'parcel input');
  await expectDarkAndReadable(page.getByRole('radio', { name: /Kukurydza/ }), 'crop card');
  await expectDarkAndReadable(page.getByRole('button', { name: 'Lato 2024' }), 'date pill');
  await expectDarkAndReadable(page.getByRole('button', { name: 'Mapa', exact: true }), 'layer dock button');
  // pressed buttons are intentionally light green with dark text: only the contrast matters there
  const pressed = await colours(page.getByRole('button', { name: 'Granice działek' }));
  expect(pressed.contrast, 'pressed layer button contrast').toBeGreaterThanOrEqual(4.5);
  await expectDarkAndReadable(page.getByText('Kliknij', { exact: false }).first(), 'map hint pill');

  // amber warning after clicking a house must be dark too, not a light-yellow block
  await showOnMap(page, HOUSE.lat, HOUSE.lon, 18);
  await clickLatLon(page, HOUSE.lat, HOUSE.lon);
  const warning = page.getByText('Wybrany obszar wygląda na teren zabudowany lub nierolniczy', { exact: false });
  await expectDarkAndReadable(warning, 'land-type warning');
  await expectDarkAndReadable(page.getByRole('button', { name: 'To moje pole — potwierdzam' }), 'confirm chip');
  await page.screenshot({ path: 'e2e-results/screens/09-dark-home.png' });

  // the choice survives a reload
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('dark theme on the report; printing is still light', async ({ page }) => {
  await page.goto('/report/demo-preview');
  await enableDarkMode(page);
  await expectDarkAndReadable(page.getByRole('heading', { name: 'Ocena sytuacji wodnej' }), 'step heading');
  await expectDarkAndReadable(page.getByText('Opady (ostatnie 90 dni)'), 'rain widget label');
  await expectDarkAndReadable(page.getByRole('button', { name: 'Pobierz raport PDF' }).first(), 'PDF button');
  await expectDarkAndReadable(page.getByText('Wykorzystane dane publiczne'), 'sources box');
  await page.screenshot({ path: 'e2e-results/screens/10-dark-report.png' });

  await page.emulateMedia({ media: 'print' });
  const printBg = await page.locator('body').evaluate((b) => getComputedStyle(b).backgroundColor);
  expect(printBg).toBe('rgb(255, 255, 255)');
});

test('Shift is not needed and does not get in the way: Shift+click picks a parcel like a plain click', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await showOnMap(page, FIELD.lat, FIELD.lon, 17);

  await page.keyboard.down('Shift');
  await clickLatLon(page, FIELD.lat, FIELD.lon);
  await page.keyboard.up('Shift');

  await expect(page.getByText('Zaznaczona działka')).toBeVisible();
  await expect(page.locator('.leaflet-parcelGlow-pane path')).not.toHaveCount(0);
  // no Leaflet box-zoom rectangle is ever drawn
  await expect(page.locator('.leaflet-zoom-box')).toHaveCount(0);
});

test('Shift+drag does not start a box zoom or pick anything (Leaflet ignores drags with Shift)', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  const box = (await page.locator('.leaflet-container').first().boundingBox())!;
  const start = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.5 };
  const zoomOf = () =>
    page.evaluate(
      () => (window as unknown as { __wodoplonMaps: Record<string, { getZoom: () => number }> }).__wodoplonMaps.home.getZoom(),
    );
  const before = await zoomOf();

  await page.keyboard.down('Shift');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 200, start.y - 100, { steps: 10 });
  await expect(page.locator('.leaflet-zoom-box')).toHaveCount(0); // no box-zoom rectangle
  await page.mouse.up();
  await page.keyboard.up('Shift');

  expect(await zoomOf()).toBe(before);
  await expect(page.getByText('Zaznaczona działka')).toHaveCount(0);
});
