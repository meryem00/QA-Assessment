import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    // Same tests can target local, CI or staging: just change the env var
    baseURL: process.env.API_BASE_URL ?? 'http://localhost:4000',
  },
});
