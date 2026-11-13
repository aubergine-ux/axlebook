import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests against the real built app (server + web) on a throwaway data dir.
 * Run with `npm run e2e` (builds first).
 */
const PORT = 18_765;
/** A second, empty instance: the target for restoring a backup. */
export const RESTORE_PORT = 18_766;
/** A third instance mounted under /garage, the way it sits behind a reverse proxy at a subpath. */
export const SUBPATH_PORT = 18_767;
export const SUBPATH_URL = `http://localhost:${SUBPATH_PORT}/garage`;
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
  webServer: [
    { port: PORT },
    { port: RESTORE_PORT },
    { port: SUBPATH_PORT, baseUrl: SUBPATH_URL },
  ].map(({ port, baseUrl }) => ({
    command: `node e2e/start-server.mjs ${port} ${baseUrl ?? ''}`,
    url: `http://localhost:${port}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  })),
});
