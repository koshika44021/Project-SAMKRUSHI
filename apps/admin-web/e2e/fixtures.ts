import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Synthetic E2E accounts (local stack only). Recreated by auth.setup.ts on every run. */
export const E2E_DOMAIN = 'e2e.samkrushi.invalid';
export const E2E_PASSWORD = 'E2e-Test-Passw0rd-1';

export const USERS = {
  super: {
    email: `super@${E2E_DOMAIN}`,
    name: 'E2E Super Admin',
    roles: ['super_admin'],
    active: true,
  },
  ops: {
    email: `ops@${E2E_DOMAIN}`,
    name: 'E2E Operations',
    roles: ['operations_admin'],
    active: true,
  },
  viewer: { email: `viewer@${E2E_DOMAIN}`, name: 'E2E Viewer', roles: ['viewer'], active: true },
  logout: {
    email: `logout@${E2E_DOMAIN}`,
    name: 'E2E Logout',
    roles: ['operations_admin'],
    active: true,
  },
  inactive: {
    email: `inactive@${E2E_DOMAIN}`,
    name: 'E2E Inactive',
    roles: ['operations_admin'],
    active: false,
  },
  customer: {
    email: `customer@${E2E_DOMAIN}`,
    name: 'E2E Customer',
    roles: ['customer'],
    active: true,
    customer: true,
  },
} as const;

export type UserKey = keyof typeof USERS;

export const storageStateFor = (key: UserKey) => `e2e/.auth/${key}.json`;

/** Unique, valid Indian mobile number per call (avoids accidental duplicates across runs). */
export function uniqueMobile(): string {
  const digits = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
  return `9${digits}`;
}

export const runId = `${Date.now().toString(36)}`;

export async function signIn(page: Page, email: string, password = E2E_PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function expectGenericLoginError(page: Page): Promise<void> {
  await expect(page.locator('main').getByRole('alert')).toHaveText('Invalid email or password.');
  await expect(page).toHaveURL(/\/login/);
}

/** 1×1 PNG used for photo uploads. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
