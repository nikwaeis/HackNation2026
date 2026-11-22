import { expect, test } from '@playwright/test';
import { waitForMap } from './map';

// The sample report works without the backend (/report/demo-preview), so the full report page can be checked.

test('sample report: map with the parcel, 4 KOWR stages, PDF and link buttons', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __prints: number }).__prints = 0;
    window.print = () => {
      (window as unknown as { __prints: number }).__prints += 1;
    };
  });
  await page.goto('/report/demo-preview');
  await waitForMap(page, 'report');

  await expect(page.locator('.leaflet-parcelGlow-pane path')).not.toHaveCount(0);
  await expect(page.locator('.parcel-tag__title')).toHaveText('040302_2.0005.124/2');

  const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
  expect(headings).toEqual([
    'Ocena sytuacji wodnej',
    'Przyczyny niedoboru i retencja',
    'Nawadnianie',
    'Źródła, daty i ograniczenia',
  ]);
  await expect(page.getByText('Wysokie ryzyko suszy', { exact: true })).toBeVisible();
  await expect(page.getByTestId('confidence-chip')).toContainText('Wiarygodność oceny');

  // runoff arrows use Open-Meteo elevations -> credited on the map (CC BY 4.0)
  await expect(page.locator('.runoff-arrow').first()).toBeVisible();
  await expect(page.locator('.leaflet-control-attribution')).toContainText('Open-Meteo');

  await page.getByRole('button', { name: 'Pobierz raport PDF' }).first().click();
  expect(await page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1);

  await page.screenshot({ path: 'e2e-results/screens/07-report.png' });
});

test('mobile width: report readable without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/report/demo-preview');
  await expect(page.getByText('Ocena sytuacji wodnej')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'e2e-results/screens/08-report-mobile.png' });
});
