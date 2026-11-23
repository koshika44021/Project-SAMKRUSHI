import { samkrushiRules } from '@samkrushi/config/eslint/base';
import expoConfig from 'eslint-config-expo/flat.js';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(
  expoConfig,
  { files: ['**/*.ts', '**/*.tsx'], rules: samkrushiRules },
  globalIgnores(['.expo/**', 'android/**', 'ios/**', 'dist/**', 'expo-env.d.ts']),
);
