import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'server',
    environment: 'node',
    testTimeout: 15000,
    globalSetup: ['./src/test/global-setup.ts'],
  },
});
