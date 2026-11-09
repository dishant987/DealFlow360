import { defineConfig } from '@playwright/test'

// Override the targets when 4000/5173 are taken by something else:
// E2E_BASE_URL=http://localhost:5180 E2E_API_URL=http://localhost:4100
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173'
const apiURL = process.env.E2E_API_URL || 'http://localhost:4000'

// Chromium download is blocked on this machine, so we drive the installed
// Chrome instead. Everything else is stock.
// Specs that change or count company-wide state: global approval thresholds,
// exact warehouse stock, notification badges, refetch counts, total quote counts.
// They run after everything else, one at a time. Everything else runs in parallel
// (files in parallel; tests inside a file stay in order).
const SHARED_STATE = /(05-fulfillment|08-config-reports|12-live-updates|13-filters|14-notifications)\.spec\.ts$/

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 4,
  projects: [
    { name: 'parallel', testIgnore: SHARED_STATE },
    // dependencies: runs once 'parallel' has finished, so nothing overlaps it
    { name: 'shared-state', testMatch: SHARED_STATE, workers: 1, dependencies: ['parallel'] },
  ],
  reporter: [['list'], ['json', { outputFile: 'e2e-results.json' }]],
  use: {
    baseURL,
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../server',
      url: `${apiURL}/api/health`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      url: baseURL,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
})
