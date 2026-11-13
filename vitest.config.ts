import { defineConfig } from 'vitest/config';

// The domain rules everything else depends on must stay fully covered (`npm run coverage`).
const DOMAIN = ['fuel-economy', 'reminder-status', 'units', 'money', 'dates', 'usage'].map(
  (f) => `**/src/domain/${f}.ts`,
);

export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/server', 'apps/web'],
    coverage: {
      provider: 'v8',
      include: DOMAIN,
      reporter: ['text'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
