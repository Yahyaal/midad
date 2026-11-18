import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4179',
    acceptDownloads: true,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 860 } }, testIgnore: /touch\.spec\.ts/ },
    { name: 'touch', use: { ...devices['Pixel 7'] }, testMatch: /touch\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4179 --strictPort',
    port: 4179,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
