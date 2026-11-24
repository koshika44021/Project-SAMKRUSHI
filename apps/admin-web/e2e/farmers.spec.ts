import { expect, type Page, test } from '@playwright/test';
import { runId, storageStateFor, TINY_PNG, uniqueMobile } from './fixtures';

test.use({ storageState: storageStateFor('ops') });

// WEB_ADMIN §19 MVP acceptance 3, 4, 10, 11.

async function fillFarmer(
  page: Page,
  values: { name: string; primary: string; secondary: string; pin?: string },
) {
  await page.getByLabel('Farmer name').fill(values.name);
  await page.getByLabel('Primary contact').fill(values.primary);
  await page.getByLabel('Secondary contact').fill(values.secondary);
  await page.getByLabel('Address').fill('DEV address line');
  await page.getByLabel('Village / locality').fill('DEV Village');
  await page.getByLabel('Mandal').fill('DEV Mandal');
  await page.getByLabel('District').fill('DEV District');
  await page.getByLabel('State').fill('DEV State');
  await page.getByLabel('PIN code').fill(values.pin ?? '500001');
  await page.locator('#landAreaValue').fill('2.5');
  await page.getByLabel('Land area unit').selectOption('acre');
}

async function attachPhoto(page: Page) {
  await page
    .getByLabel('Farmer photo')
    .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: TINY_PNG });
}

test('farmer registration validates required fields and preserves input after errors', async ({
  page,
}) => {
  await page.goto('/farmers/new');
  await page.getByRole('button', { name: 'Register farmer' }).click();
  await expect(page.getByText('Name must be at least 2 characters')).toBeVisible();
  await expect(page.getByText('Enter a phone number').first()).toBeVisible();

  const name = `E2E Validation ${runId}`;
  await fillFarmer(page, { name, primary: '12345', secondary: uniqueMobile(), pin: '01234' });
  await page.getByRole('button', { name: 'Register farmer' }).click();
  await expect(page.getByText('Enter a valid Indian mobile number')).toBeVisible();
  await expect(page.getByText('Enter a valid six-digit PIN code')).toBeVisible();
  await expect(page.getByLabel('Farmer name')).toHaveValue(name);

  // Photo is required under the current dev rules: server reports it on the photo field.
  await page.getByLabel('Primary contact').fill(uniqueMobile());
  await page.getByLabel('PIN code').fill('500001');
  await page.getByRole('button', { name: 'Register farmer' }).click();
  await expect(page.getByText('Farmer photo is required')).toBeVisible();
  await expect(page.getByLabel('Farmer name')).toHaveValue(name);
});

test('register, find, edit and deactivate a farmer (history preserved)', async ({ page }) => {
  const name = `E2E Farmer ${runId}`;
  const primary = uniqueMobile();
  await page.goto('/farmers/new');
  await fillFarmer(page, { name, primary, secondary: uniqueMobile() });
  await attachPhoto(page);
  await page.getByRole('button', { name: 'Register farmer' }).click();

  await expect(page.getByRole('heading', { name })).toBeVisible();
  const code = (await page.getByTestId('farmer-code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^SAM-FRM-\d{6}$/);
  await expect(page.getByTestId('farmer-photo')).toBeVisible();

  // Search by name, code and phone.
  for (const term of [name, code, primary.slice(-6)]) {
    await page.goto(`/farmers?search=${encodeURIComponent(term)}`);
    await expect(page.getByRole('link', { name })).toBeVisible();
  }

  // Edit requires a reason.
  await page.getByRole('link', { name }).click();
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Village / locality').fill('DEV Village Two');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Give a reason (at least 3 characters)')).toBeVisible();
  await page.getByLabel('Reason for change').fill('E2E correction');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('DEV Village Two')).toBeVisible();

  // Deactivate with reason; history stays visible.
  await page.getByRole('button', { name: 'Deactivate' }).click();
  await page.getByLabel('Reason').fill('E2E left programme');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('This farmer is inactive')).toBeVisible();
  await expect(page.getByText('E2E left programme')).toBeVisible();

  // An inactive farmer cannot be chosen for new supply.
  await page.goto('/availability/supply/new');
  await expect(page.locator('#supplierId option', { hasText: code })).toHaveCount(0);

  // Filter by status finds it among inactive farmers.
  await page.goto(`/farmers?status=inactive&search=${encodeURIComponent(code)}`);
  await expect(page.getByRole('link', { name })).toBeVisible();
});

test('duplicate phone numbers require an explicit reason and are never merged', async ({
  page,
}) => {
  const shared = uniqueMobile();
  for (const suffix of ['A', 'B']) {
    await page.goto('/farmers/new');
    await fillFarmer(page, {
      name: `E2E Dup ${suffix} ${runId}`,
      primary: shared,
      secondary: uniqueMobile(),
    });
    await attachPhoto(page);
    await page.getByRole('button', { name: 'Register farmer' }).click();
    if (suffix === 'B') {
      await expect(
        page.getByText('This phone number is already used by another farmer'),
      ).toBeVisible();
      await expect(page.getByLabel('Farmer name')).toHaveValue(`E2E Dup B ${runId}`);
      await page.getByLabel('Reason for shared phone').fill('E2E family shares one phone');
      await attachPhoto(page);
      await page.getByRole('button', { name: 'Register farmer' }).click();
    }
    await expect(page.getByRole('heading', { name: `E2E Dup ${suffix} ${runId}` })).toBeVisible();
  }
});
