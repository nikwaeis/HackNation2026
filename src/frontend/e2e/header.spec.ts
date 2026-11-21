import { expect, test } from '@playwright/test';

// Wide desktop: the logo sits in the left corner, Kontrast + PL/EN in the right corner (full-width header).
test.use({ viewport: { width: 1912, height: 950 } });

test('header controls sit in the corners on a wide screen', async ({ page }) => {
  await page.goto('/');
  const logo = (await page.getByRole('link', { name: /WodoPlon/ }).boundingBox())!;
  const en = (await page.getByRole('button', { name: 'EN' }).boundingBox())!;
  const contrast = (await page.getByRole('button', { name: 'Kontrast' }).boundingBox())!;
  expect(logo.x).toBeLessThan(40);
  expect(en.x + en.width).toBeGreaterThan(1912 - 40);
  expect(contrast.x).toBeGreaterThan(1912 / 2); // right side, next to the languages
  // credits stay visible on desktop
  await expect(page.locator('.leaflet-control-attribution')).toBeVisible();
});
