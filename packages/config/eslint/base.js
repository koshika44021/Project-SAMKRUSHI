// Shared flat ESLint config for SAMKRUSHI TypeScript packages.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Rules every workspace applies on top of its framework preset. */
export const samkrushiRules = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
  ],
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  eqeqeq: ['error', 'always'],
};

export const ignores = {
  ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/.turbo/**'],
};

/** Base config for runtime-agnostic TypeScript libraries. */
export default defineConfig(ignores, js.configs.recommended, tseslint.configs.strict, {
  languageOptions: { globals: { ...globals.es2022 } },
  rules: samkrushiRules,
});
