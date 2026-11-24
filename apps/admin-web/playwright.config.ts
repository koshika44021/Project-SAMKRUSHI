import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Local keys for the LOCAL Supabase stack (git-ignored); CI writes the same file.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const PORT = 3000;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Generous budget: production server on developer laptops can be slow.
  timeout: 60_000,
  // Deterministic order (shared local DB, login rate limits); the suite is small.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  webServer: {
    command: 'pnpm start',
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
