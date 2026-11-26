import { describe, expect, it } from 'vitest';
import { capabilities } from './access.ts';
import {
  goodsReceiptCreateSchema,
  goodsReceiptLineInputSchema,
  purchaseOrderCreateSchema,
  purchaseOrderStatusActionSchema,
  stockAdjustmentSchema,
} from './inventory.ts';

const PRODUCT = '00000000-0000-4000-8000-0000000000a1';
const SUPPLIER = '00000000-0000-4000-8000-0000000000f1';
const SUPPLY = '00000000-0000-4000-8000-0000000000e1';
const PO_LINE = '00000000-0000-4000-8000-0000000000b1';

describe('purchaseOrderCreateSchema', () => {
  it('accepts decimal-string quantities and optional costs', () => {
    const parsed = purchaseOrderCreateSchema.parse({
      supplierId: SUPPLIER,
      expectedDate: '2026-12-01',
      notes: '',
      lines: [{ productId: PRODUCT, quantity: '12.5', unitCostPaise: 0 }],
    });
    expect(parsed.notes).toBeNull();
    expect(parsed.lines[0]?.quantity).toBe('12.5');
  });

  it.each(['0', '-1', '1.2345', '1e3', ''])('rejects quantity %j', (quantity) => {
    const result = purchaseOrderCreateSchema.safeParse({
      supplierId: SUPPLIER,
      expectedDate: '2026-12-01',
      lines: [{ productId: PRODUCT, quantity }],
    });
    expect(result.success).toBe(false);
  });

  it('requires at least one line and unique supply links', () => {
    expect(
      purchaseOrderCreateSchema.safeParse({
        supplierId: SUPPLIER,
        expectedDate: '2026-12-01',
        lines: [],
      }).success,
    ).toBe(false);
    expect(
      purchaseOrderCreateSchema.safeParse({
        supplierId: SUPPLIER,
        expectedDate: '2026-12-01',
        lines: [
          { productId: PRODUCT, quantity: '1', supplyConfirmationId: SUPPLY },
          { productId: PRODUCT, quantity: '2', supplyConfirmationId: SUPPLY },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects negative or fractional paise', () => {
    for (const unitCostPaise of [-1, 1.5]) {
      expect(
        purchaseOrderCreateSchema.safeParse({
          supplierId: SUPPLIER,
          expectedDate: '2026-12-01',
          lines: [{ productId: PRODUCT, quantity: '1', unitCostPaise }],
        }).success,
      ).toBe(false);
    }
  });
});

describe('purchaseOrderStatusActionSchema', () => {
  it('needs a reason to cancel or close, not to send', () => {
    const base = { id: SUPPLIER, expectedVersion: '2' };
    expect(purchaseOrderStatusActionSchema.parse({ ...base, action: 'send' }).expectedVersion).toBe(
      2,
    );
    expect(purchaseOrderStatusActionSchema.safeParse({ ...base, action: 'cancel' }).success).toBe(
      false,
    );
    expect(
      purchaseOrderStatusActionSchema.safeParse({ ...base, action: 'close', reason: 'DEV short' })
        .success,
    ).toBe(true);
  });
});

describe('goodsReceiptLineInputSchema', () => {
  it('reconciles received = accepted + rejected + damaged exactly', () => {
    const parsed = goodsReceiptLineInputSchema.parse({
      poLineId: PO_LINE,
      received: '0.3',
      accepted: '0.1',
      rejected: '0.2',
    });
    expect(parsed.damaged).toBe('0');
    expect(
      goodsReceiptLineInputSchema.safeParse({
        poLineId: PO_LINE,
        received: '60',
        accepted: '50',
        rejected: '5',
      }).success,
    ).toBe(false);
  });

  it('allows a fully rejected line', () => {
    expect(
      goodsReceiptLineInputSchema.safeParse({
        poLineId: PO_LINE,
        received: '10',
        accepted: '',
        rejected: '10',
      }).success,
    ).toBe(true);
  });

  it('rejects duplicate PO lines on one receipt', () => {
    const line = { poLineId: PO_LINE, received: '1', accepted: '1' };
    expect(
      goodsReceiptCreateSchema.safeParse({ purchaseOrderId: SUPPLIER, lines: [line, line] })
        .success,
    ).toBe(false);
  });
});

describe('stockAdjustmentSchema', () => {
  it('never lets staff record receipts or sales by hand', () => {
    for (const movementType of ['receipt', 'sale']) {
      expect(
        stockAdjustmentSchema.safeParse({
          batchId: PRODUCT,
          movementType,
          quantity: '1',
          reason: 'DEV',
        }).success,
      ).toBe(false);
    }
    expect(
      stockAdjustmentSchema.safeParse({
        batchId: PRODUCT,
        movementType: 'wastage',
        quantity: '1',
        reason: 'DEV spoiled',
      }).success,
    ).toBe(true);
  });
});

describe('inventory capabilities', () => {
  it('mirror ADR-0012 roles', () => {
    expect(capabilities.viewInventory(['finance_admin'])).toBe(true);
    expect(capabilities.manageInventory(['finance_admin'])).toBe(false);
    expect(capabilities.manageInventory(['operations_admin'])).toBe(true);
    expect(capabilities.viewInventory(['viewer'])).toBe(false);
    expect(capabilities.viewInventory(['dispatch_admin'])).toBe(false);
  });
});
