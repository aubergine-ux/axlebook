import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests against the real built app (server + web) on a throwaway data dir.
 * Run with `npm run e2e` (builds first).
 */
const PORT = 18_765;
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Runs after desktop, which performs the one-time setup.
    { name: 'phone', use: { ...devices['Pixel 7'] }, dependencies: ['desktop'] },
  ],
  webServer: {
    command: `node e2e/start-server.mjs ${PORT}`,
    url: `http://localhost:${PORT}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
