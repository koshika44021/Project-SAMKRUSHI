import { expect, test } from '@playwright/test';

test('home page renders the Asia/Kolkata business date', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();
  await expect(page.getByTestId('business-date').locator('time')).toHaveAttribute(
    'datetime',
    /^\d{4}-\d{2}-\d{2}$/,
  );
});

test('health endpoint responds with security headers', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['x-powered-by']).toBeUndefined();
  const body = await response.json();
  expect(body.data.status).toBe('ok');
});
