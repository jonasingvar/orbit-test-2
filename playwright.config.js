import { defineConfig, devices } from '@playwright/test';

/**
 * Verification harness.
 *
 *   npm run verify            — run every check, headless
 *   npm run verify -- --ui    — interactive runner
 *   npm run shot -- /schedule — screenshot one route into .screenshots/
 *
 * Playwright starts the app itself (API + Vite) via `npm run dev`, so an
 * agent can go from "ticket done" to "proved it works in a browser" with
 * a single command and no manual setup.
 */
export default defineConfig({
  testDir: './tests',
  // Playwright owns the browser specs; tests/unit and tests/api are node --test
  // files run by `npm test`, and must not be collected here.
  testMatch: '**/*.spec.js',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Use every core the runner has; the lane table in tests/helpers.js keeps
  // parallel tests off each other's data, so more workers is just faster.
  workers: process.env.CI ? '100%' : undefined,
  // On CI: inline annotations on the failing line, an HTML report the workflow
  // uploads so a red run can be read without reproducing it, and a JSON file
  // the workflow turns into the run summary you see on the Actions page.
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }],
       ['json', { outputFile: 'test-results/results.json' }]]
    : [['list']],

  // A second checkout can run its own suite by setting WEB_PORT, PORT and
  // ORBIT_DB; nothing here is hard-coded to one machine-wide port or file.
  outputDir: process.env.PW_OUTPUT_DIR ?? 'test-results',

  use: {
    baseURL: `http://localhost:${process.env.WEB_PORT ?? 5173}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  // Reusing whatever is already on the port is a convenience when you are the
  // only thing running. Under a lane it is a trap: a second worktree that lands
  // on a taken WEB_PORT would attach to the *first* worktree's dev server and
  // run this branch's specs against that branch's code — and pass. So a claimed
  // lane insists on starting its own app, and a collision fails loudly.
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${process.env.WEB_PORT ?? 5173}`,
    reuseExistingServer: !process.env.CI && !process.env.ORBIT_LANE,
    timeout: 90_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
