import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests in a real browser against the REAL public services (ULDK, GUGiK KIEG, map tiles).
 * Only our own backend (/api/*) is stubbed inside the specs, so the tests run without Docker.
 * Uses the locally installed Google Chrome (channel "chrome") — no browser download needed.
 *
 *   npm run test:e2e            # starts `npm run dev` if it is not running yet
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
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    locale: 'pl-PL',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
