import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  timeout: 90000,
  workers: 1,
  use: {
    browserName: 'chromium',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1680, height: 1100 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
});
