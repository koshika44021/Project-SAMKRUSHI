import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Local stack keys (git-ignored). CI writes the same file.
const envFile = '../../apps/admin-web/.env.local';
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
