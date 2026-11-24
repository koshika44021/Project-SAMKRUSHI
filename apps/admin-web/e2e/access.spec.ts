import { expect, test } from '@playwright/test';
import { E2E_DOMAIN, E2E_PASSWORD, runId, signIn, storageStateFor } from './fixtures';

// WEB_ADMIN §19 MVP acceptance 2 (viewer cannot mutate) and 10 (audit), plus
// super_admin staff administration.

test.describe('viewer (read-only)', () => {
  test.use({ storageState: storageStateFor('viewer') });

  test('sees read-only screens without mutation controls', async ({ page }) => {
    await page.goto('/farmers');
    await expect(page.getByRole('heading', { name: 'Farmers' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Register farmer' })).toHaveCount(0);
    await expect(
      page.getByRole('navigation').getByRole('link', { name: 'Staff / Users' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('navigation').getByRole('link', { name: 'Audit History' }),
    ).toHaveCount(0);

    await page.goto('/availability');
    await expect(page.getByRole('link', { name: 'Add farmer-confirmed supply' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Deactivate' })).toHaveCount(0);
  });

  test('is refused on mutation and admin pages', async ({ page }) => {
    for (const path of ['/farmers/new', '/availability/supply/new', '/staff', '/audit']) {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: 'You do not have access to this page' }),
      ).toBeVisible();
    }
  });

  test('sees masked phone numbers', async ({ page }) => {
    await page.goto('/farmers?search=E2E');
    const phones = await page.locator('tbody tr td:nth-child(3)').allTextContents();
    expect(phones.length).toBeGreaterThan(0);
    expect(phones.every((p) => p.includes('*') || p === '—')).toBe(true);
  });
});

test.describe('super admin', () => {
  test.use({ storageState: storageStateFor('super') });
  test.describe.configure({ mode: 'serial' });

  test('creates a staff member who must change the temporary password', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000); // two browser contexts and several sign-ins
    const email = `new-${runId}@${E2E_DOMAIN}`;
    await page.goto('/staff');
    await page.getByLabel('Full name').fill(`E2E New Staff ${runId}`);
    await page.getByLabel('Email (sign-in)').fill(email);
    await page.getByLabel('Viewer (read-only)').first().check();
    await page.getByLabel('Temporary password').first().fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Create staff account' }).click();
    await expect(page.getByText('Staff account created')).toBeVisible();
    await expect(page.getByTestId(`staff-row-${email}`)).toBeVisible();

    // New contexts inherit test.use() options, so clear the super_admin session explicitly.
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const fresh = await ctx.newPage();
    await signIn(fresh, email);
    await expect(fresh).toHaveURL(/\/account\/password/);
    await fresh.locator('#newPassword').fill('E2e-Changed-Passw0rd');
    await fresh.getByLabel('Confirm new password').fill('E2e-Changed-Passw0rd');
    await fresh.getByRole('button', { name: 'Change password' }).click();
    await expect(fresh).toHaveURL(/reason=password_changed/);
    await signIn(fresh, email, 'E2e-Changed-Passw0rd');
    await expect(fresh).toHaveURL(/\/overview/);
    await ctx.close();
  });

  test('audit history records staff changes with actor, role and reason', async ({ page }) => {
    // The previous test created a staff member through the audited RPC.
    await page.goto('/audit?entity=staff_profiles&action=insert');
    await expect(page.getByTestId('audit-list')).toBeVisible();
    await expect(page.getByTestId('audit-list').getByText('as super_admin').first()).toBeVisible();
    await expect(
      page.getByTestId('audit-list').getByText('staff account created').first(),
    ).toBeVisible();
  });
});
