import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests in a real browser against the REAL public services (ULDK, GUGiK KIEG, map tiles).
 * Only our own backend (/api/*) is stubbed inside the specs, so the tests run without Docker.
 * Uses the locally installed Google Chrome (channel "chrome") — no browser download needed.
 *
 *   npm run test:e2e            # starts `npm run dev` if it is not running yet
 *   E2E_ALL_BROWSERS=1 npm run test:e2e   # also Firefox and WebKit (Safari engine); KOWR requires Chrome,
 *                                         # Firefox, Edge, Safari, Opera (Edge / Opera = Chromium, like Chrome)
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1, // public GUGiK services throttle bursts of parallel requests
  reporter: [['list']],
  outputDir: 'e2e-results',
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    locale: 'pl-PL',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chrome', use: { channel: 'chrome' } },
    ...(process.env.E2E_ALL_BROWSERS
      ? [
          { name: 'firefox', use: { browserName: 'firefox' as const } },
          { name: 'webkit', use: { browserName: 'webkit' as const } },
        ]
      : []),
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
