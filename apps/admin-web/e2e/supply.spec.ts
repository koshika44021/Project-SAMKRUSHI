import { addBusinessDays, toBusinessDate } from '@samkrushi/shared';
import { expect, type Page, test } from '@playwright/test';
import { runId, storageStateFor, TINY_PNG, uniqueMobile } from './fixtures';

test.use({ storageState: storageStateFor('ops') });
test.describe.configure({ mode: 'serial' });

// WEB_ADMIN §19 MVP acceptance 5–8. A random future business date isolates each run.
const businessDate = addBusinessDays(
  toBusinessDate(new Date()),
  30 + Math.floor(Math.random() * 300),
);
const PRODUCT = 'DEV Sample Vegetable A'; // seeded, base unit kg
const PRODUCT_CODE = 'SEED-VEG-01';
const farmers: { name: string; code: string }[] = [];

async function registerFarmer(page: Page, name: string) {
  await page.goto('/farmers/new');
  await page.getByLabel('Farmer name').fill(name);
  await page.getByLabel('Primary contact').fill(uniqueMobile());
  await page.getByLabel('Secondary contact').fill(uniqueMobile());
  await page.getByLabel('Address').fill('DEV address line');
  await page.getByLabel('Village / locality').fill('DEV Village');
  await page.getByLabel('Mandal').fill('DEV Mandal');
  await page.getByLabel('District').fill('DEV District');
  await page.getByLabel('State').fill('DEV State');
  await page.getByLabel('PIN code').fill('500001');
  await page.locator('#landAreaValue').fill('1');
  await page.getByLabel('Land area unit').selectOption('hectare');
  await page
    .getByLabel('Farmer photo')
    .setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: TINY_PNG });
  await page.getByRole('button', { name: 'Register farmer' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  const code = (await page.getByTestId('farmer-code').textContent())?.trim() ?? '';
  farmers.push({ name, code });
}

async function recordSupply(
  page: Page,
  farmerCode: string,
  quantity: string,
  unit?: string,
  withEvidence = false,
) {
  await page.goto(`/availability/supply/new?date=${businessDate}`);
  const option = page.locator('#supplierId option', { hasText: farmerCode });
  await page
    .getByLabel('Farmer')
    .selectOption({ value: (await option.getAttribute('value')) ?? '' });
  await page.getByLabel('Catalog product').selectOption({ label: `${PRODUCT} (kg)` });
  await page.getByLabel('Business date').fill(businessDate);
  await page.getByLabel('Quantity').fill(quantity);
  if (unit) await page.getByLabel('Unit').selectOption(unit);
  await page.getByLabel('How was this confirmed?').selectOption({ index: 1 });
  if (withEvidence) {
    await page
      .locator('#evidence')
      .setInputFiles({ name: 'evidence.png', mimeType: 'image/png', buffer: TINY_PNG });
  }
  await page.getByRole('button', { name: 'Record supply' }).click();
}

const sellable = (page: Page) => page.getByTestId(`sellable-${PRODUCT_CODE}`);

test('only predefined catalog products can be selected', async ({ page }) => {
  await page.goto('/availability/supply/new');
  const options = await page.locator('#productId option').allTextContents();
  expect(options.slice(1).every((o) => o.startsWith('DEV Sample'))).toBe(true);
  expect(options).toContain(`${PRODUCT} (kg)`);
});

test('supply from several farmers aggregates per product in its unit', async ({ page }) => {
  await registerFarmer(page, `E2E Supply One ${runId}`);
  await registerFarmer(page, `E2E Supply Two ${runId}`);
  const [one, two] = farmers;

  await recordSupply(page, one!.code, '2.5', undefined, true);
  await expect(page).toHaveURL(/saved=1/);
  // Alternative entry unit: 1500 g is stored exactly as 1.5 kg.
  await recordSupply(page, two!.code, '1500', 'g');
  await expect(page).toHaveURL(/saved=1/);

  await page.goto(`/availability?date=${businessDate}`);
  await expect(sellable(page)).toHaveText('4 kg');

  // Evidence is private: the link redirects to a short-lived signed image URL.
  const evidenceLink = page.getByRole('link', { name: 'View evidence' }).first();
  await expect(evidenceLink).toBeVisible();
  const href = (await evidenceLink.getAttribute('href')) ?? '';
  const response = await page.request.get(href);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/webp');
});

test('a second active record for the same farmer, product and date is rejected', async ({
  page,
}) => {
  await recordSupply(page, farmers[0]!.code, '1');
  await expect(page.locator('main').getByRole('alert')).toContainText(
    'already has an active record',
  );
  await expect(page.getByLabel('Quantity')).toHaveValue('1');
});

test('zero and inactive supply are excluded from availability', async ({ page }) => {
  await page.goto(`/availability?date=${businessDate}&product=`);
  const rowOne = page.getByRole('row', { name: new RegExp(farmers[0]!.code) });
  await rowOne.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Quantity (kg)').fill('0');
  await page.getByLabel('Reason for change').fill('E2E farmer cancelled');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(sellable(page)).toHaveText('1.5 kg');

  const rowTwo = page.getByRole('row', { name: new RegExp(farmers[1]!.code) });
  await rowTwo.getByRole('button', { name: 'Deactivate' }).click();
  await page.getByLabel('Reason').fill('E2E duplicate entry');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(sellable(page)).toHaveText('0 kg');
});
