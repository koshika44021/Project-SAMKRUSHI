import { expect, test } from '@playwright/test';

test('health endpoint responds with security headers', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['x-powered-by']).toBeUndefined();
  const body = await response.json();
  expect(body.data.status).toBe('ok');
});

test('pages carry a per-request nonce CSP', async ({ request }) => {
  const first = await request.get('/login');
  const second = await request.get('/login');
  const csp1 = first.headers()['content-security-policy'] ?? '';
  const csp2 = second.headers()['content-security-policy'] ?? '';
  expect(csp1).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp1).not.toEqual(csp2);
  expect(first.headers()['x-request-id']).toBeTruthy();
});
