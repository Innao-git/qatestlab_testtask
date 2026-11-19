import { defineConfig, devices } from '@playwright/test';
import { env, ADMIN_STORAGE_STATE } from './src/utils/env';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: env.baseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // UI login once, session saved for the E2E browser tests.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      // API tests do not depend on the UI login in `setup`: the admin session they need for test data
      // comes from an API login (`adminRequest` fixture), and `request` starts unauthenticated.
      name: 'api',
      testDir: './tests/api',
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
    },
  ],
});
