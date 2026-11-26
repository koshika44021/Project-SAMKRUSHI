import { addBusinessDays, toBusinessDate } from '@samkrushi/shared';
import { expect, type Page, test } from '@playwright/test';
import { runId, storageStateFor, TINY_PNG, uniqueMobile } from './fixtures';

// Phase 4 acceptance (ADR-0012): PO from farmer-confirmed supply → goods
// receipt with rejection → posted batch → movements, hold, release, recall.
// SEED-VEG-02 is reserved for inventory tests; the batch is recalled at the
// end so it never stays available. A random future date isolates each run.
const businessDate = addBusinessDays(
  toBusinessDate(new Date()),
  1000 + Math.floor(Math.random() * 300),
);
const PRODUCT = 'DEV Sample Vegetable B';
const farmerName = `E2E Inventory Farmer ${runId}`;

async function confirmDialog(page: Page, trigger: string, submit: string, reason?: string) {
  await page.getByRole('button', { name: trigger }).click();
  const dialog = page.getByRole('dialog');
  if (reason) await dialog.getByLabel(/Reason|Resolution note/).fill(reason);
  await dialog.getByRole('button', { name: submit }).click();
  await expect(dialog).toBeHidden();
}

test.describe('operations', () => {
  test.use({ storageState: storageStateFor('ops') });
  test.describe.configure({ mode: 'serial' });

  test('purchase order from supply, receipt with rejection, batch lifecycle', async ({ page }) => {
    // Farmer + farmer-confirmed supply (10 kg).
    await page.goto('/farmers/new');
    await page.getByLabel('Farmer name').fill(farmerName);
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
    await expect(page.getByRole('heading', { name: farmerName })).toBeVisible();
    const code = (await page.getByTestId('farmer-code').textContent())?.trim() ?? '';

    await page.goto(`/availability/supply/new?date=${businessDate}`);
    const option = page.locator('#supplierId option', { hasText: code });
    await page
      .getByLabel('Farmer')
      .selectOption({ value: (await option.getAttribute('value')) ?? '' });
    await page.getByLabel('Catalog product').selectOption({ label: `${PRODUCT} (kg)` });
    await page.getByLabel('Business date').fill(businessDate);
    await page.getByLabel('Quantity').fill('10');
    await page.getByLabel('How was this confirmed?').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Record supply' }).click();
    await expect(page).toHaveURL(/saved=1/);

    // Draft PO from the supply; sending it never changes stock.
    await page.goto(`/procurement?date=${businessDate}`);
    await page
      .getByTestId('supply-awaiting-po')
      .getByRole('listitem')
      .filter({ hasText: farmerName })
      .getByRole('button', { name: 'Create PO from supply' })
      .click();
    await expect(page).toHaveURL(/\/procurement\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('po-status')).toHaveText('Draft');
    await confirmDialog(page, 'Mark as sent', 'Confirm');
    await expect(page.getByTestId('po-status')).toHaveText('Sent');

    // Receipt: 10 received = 8 accepted + 2 rejected, with evidence.
    await page.getByRole('link', { name: 'Receive goods' }).click();
    await page.getByLabel('Received (kg)').fill('10');
    await page.getByLabel('Accepted (kg)').fill('8');
    await page.getByLabel('Rejected (kg)').fill('1');
    await page.getByRole('button', { name: 'Save draft receipt' }).click();
    await expect(page.locator('main')).toContainText('must equal received');
    await page.getByLabel('Rejected (kg)').fill('2');
    await page.getByLabel('Quality grade').fill('DEV grade B');
    await page
      .getByLabel('Evidence photo')
      .setInputFiles({ name: 'crate.png', mimeType: 'image/png', buffer: TINY_PNG });
    await page.getByRole('button', { name: 'Save draft receipt' }).click();
    await expect(page).toHaveURL(/\/receiving\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('receipt-status')).toHaveText('Draft');

    const evidence = page.getByRole('link', { name: 'View evidence' });
    const response = await page.request.get((await evidence.getAttribute('href')) ?? '');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/webp');

    await confirmDialog(page, 'Post receipt', 'Post');
    await expect(page.getByTestId('receipt-status')).toHaveText('Posted');

    // Batch: accepted quantity only.
    await page.getByRole('link', { name: /^SAM-B-\d{6}$/ }).click();
    await expect(page.getByTestId('batch-on-hand')).toHaveText('8 kg');
    await expect(page.getByTestId('batch-available')).toHaveText('8 kg');
    await expect(page.getByTestId('movement-ledger')).toContainText('Goods receipt');

    // Wastage is a negative movement; more than on hand is refused.
    await page.getByRole('button', { name: 'Record movement' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Movement').selectOption('wastage');
    await dialog.getByLabel('Quantity (kg)').fill('9');
    await dialog.getByLabel('Reason').fill('E2E too much');
    await dialog.getByRole('button', { name: 'Record' }).click();
    await expect(dialog.getByRole('alert')).toContainText('can be removed');
    await dialog.getByLabel('Quantity (kg)').fill('0.5');
    await dialog.getByRole('button', { name: 'Record' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('batch-on-hand')).toHaveText('7.5 kg');
    await expect(page.getByTestId('movement-ledger')).toContainText('-0.5 kg');

    // Hold → unavailable at once; release; recall is permanent.
    await confirmDialog(page, 'Put on hold', 'Confirm', 'E2E quality check');
    await expect(page.getByTestId('batch-status')).toHaveText('On hold');
    await expect(page.getByTestId('batch-available')).toHaveText('0 kg');
    await confirmDialog(page, 'Release hold', 'Confirm', 'E2E passed');
    await expect(page.getByTestId('batch-status')).toHaveText('Active');
    await expect(page.getByTestId('batch-available')).toHaveText('7.5 kg');
    await confirmDialog(page, 'Recall batch', 'Confirm', 'E2E contamination report');
    await expect(page.getByTestId('batch-status')).toHaveText('Recalled');
    await expect(page.getByTestId('batch-available')).toHaveText('0 kg');
    await expect(page.getByRole('button', { name: 'Record movement' })).toHaveCount(0);
    await expect(page.locator('main')).toContainText(/SAM-RC-\d{6}/);
  });

  test('inventory pages and overview widgets are reachable', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.getByTestId('inventory-widgets')).toBeVisible();
    await page.getByRole('link', { name: 'Inventory & Batches' }).first().click();
    await expect(page.getByRole('heading', { name: 'Inventory & batches' })).toBeVisible();
    await page.getByRole('link', { name: 'Goods Receiving & Quality' }).first().click();
    await expect(page.getByRole('heading', { name: 'Goods receiving & quality' })).toBeVisible();
    await page.getByRole('link', { name: 'Exceptions' }).first().click();
    await expect(page.getByRole('heading', { name: 'Operations exceptions' })).toBeVisible();
  });
});

test.describe('viewer', () => {
  test.use({ storageState: storageStateFor('viewer') });

  test('has no procurement or inventory access', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.getByRole('link', { name: 'Procurement' })).toHaveCount(0);
    await expect(page.getByTestId('inventory-widgets')).toHaveCount(0);
    for (const path of ['/procurement', '/receiving', '/inventory', '/exceptions']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/forbidden/);
    }
  });
});
