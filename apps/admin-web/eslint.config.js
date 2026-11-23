import { samkrushiRules } from '@samkrushi/config/eslint/base';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(
  nextVitals,
  nextTypeScript,
  { files: ['**/*.ts', '**/*.tsx'], rules: samkrushiRules },
  globalIgnores(['.next/**', 'out/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**']),
);
