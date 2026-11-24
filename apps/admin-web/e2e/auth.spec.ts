import { expect, test } from '@playwright/test';
import { E2E_DOMAIN, expectGenericLoginError, signIn, USERS } from './fixtures';

// WEB_ADMIN §19 MVP acceptance 1: active staff can log in; invalid/inactive
// cannot; logout invalidates the session. Customers never reach the dashboard.

test('signed-out visitors are sent to sign in, keeping the target page', async ({ page }) => {
  await page.goto('/farmers');
  await expect(page).toHaveURL(/\/login\?next=%2Ffarmers/);
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
});

test('wrong password and unknown email get the same generic error', async ({ page }) => {
  await signIn(page, USERS.ops.email, 'Wrong-Passw0rd-123');
  await expectGenericLoginError(page);
  await signIn(page, `nobody@${E2E_DOMAIN}`);
  await expectGenericLoginError(page);
});

test('inactive staff cannot sign in', async ({ page }) => {
  await signIn(page, USERS.inactive.email);
  await expectGenericLoginError(page);
});

test('a customer account cannot reach the dashboard', async ({ page }) => {
  await signIn(page, USERS.customer.email);
  await expectGenericLoginError(page);
  await page.goto('/overview');
  await expect(page).toHaveURL(/\/login/);
});

test('sign-in shows staff name and the IST business date; sign-out invalidates the session', async ({
  page,
  browser,
}) => {
  await signIn(page, USERS.logout.email);
  await expect(page).toHaveURL(/\/overview/);
  await expect(page.getByTestId('staff-name')).toHaveText(USERS.logout.name);
  await expect(page.getByTestId('header-business-date')).toHaveAttribute(
    'datetime',
    /^\d{4}-\d{2}-\d{2}$/,
  );

  const cookiesBeforeLogout = await page.context().cookies();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login\?reason=signed_out/);
  await page.goto('/overview');
  await expect(page).toHaveURL(/\/login/);

  // Replaying the old cookies must not restore access.
  const replay = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  await replay.addCookies(cookiesBeforeLogout);
  const replayPage = await replay.newPage();
  await replayPage.goto('/overview');
  await expect(replayPage).toHaveURL(/\/login/);
  await replay.close();
});

test('repeated failed sign-ins are rate limited', async ({ page }) => {
  const email = `ratelimit-${Date.now()}@${E2E_DOMAIN}`;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await signIn(page, email, 'Wrong-Passw0rd-123');
    await expectGenericLoginError(page);
  }
  await signIn(page, email, 'Wrong-Passw0rd-123');
  await expect(page.locator('main').getByRole('alert')).toHaveText(
    'Too many sign-in attempts. Please wait and try again.',
  );
});
