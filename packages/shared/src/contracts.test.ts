import { describe, expect, it } from 'vitest';
import { capabilities, STAFF_ROLES } from './access.ts';
import {
  catalogProductSchema,
  catalogQuerySchema,
  productAvailabilityStatus,
  productDetailQuerySchema,
  toDecimalString,
} from './catalog.ts';
import { farmerCreateSchema, farmerUpdateSchema } from './farmer.ts';
import { normalizeIndianMobile } from './phone.ts';
import { ownPasswordChangeSchema, staffCreateSchema, staffPasswordSchema } from './staff.ts';
import { supplyCreateSchema, supplyUpdateSchema } from './supply.ts';

const validFarmer = {
  name: 'DEV Farmer',
  addressLine: 'DEV address',
  villageLocality: 'DEV Village',
  mandal: 'DEV Mandal',
  district: 'DEV District',
  state: 'DEV State',
  pinCode: '500001',
  primaryPhone: '98765 43210',
  secondaryPhone: '+91 91234 56789',
  landAreaValue: '2.5',
  landAreaUnit: 'acre',
};

describe('normalizeIndianMobile', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['98765 43210', '+919876543210'],
    ['098765-43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
  ])('normalises %j', (input, expected) => {
    expect(normalizeIndianMobile(input)).toBe(expected);
  });

  it.each(['12345', '5876543210', '+1 4155550100', '98765432101', 'abc'])('rejects %j', (input) => {
    expect(normalizeIndianMobile(input)).toBeNull();
  });
});

describe('farmerCreateSchema', () => {
  it('normalises phones and defaults status to the dev default', () => {
    const parsed = farmerCreateSchema.parse(validFarmer);
    expect(parsed.primaryPhone).toBe('+919876543210');
    expect(parsed.secondaryPhone).toBe('+919123456789');
    expect(parsed.status).toBe('active');
  });

  it('requires a secondary contact under the current dev rules', () => {
    const result = farmerCreateSchema.safeParse({ ...validFarmer, secondaryPhone: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['secondaryPhone']);
  });

  it('rejects identical primary and secondary contacts', () => {
    const result = farmerCreateSchema.safeParse({ ...validFarmer, secondaryPhone: '9876543210' });
    expect(result.success).toBe(false);
  });

  it('requires land area and unit together', () => {
    expect(farmerCreateSchema.safeParse({ ...validFarmer, landAreaUnit: null }).success).toBe(
      false,
    );
    expect(farmerCreateSchema.safeParse({ ...validFarmer, landAreaValue: '0' }).success).toBe(
      false,
    );
    expect(farmerCreateSchema.safeParse({ ...validFarmer, landAreaValue: '2.555' }).success).toBe(
      false,
    );
  });

  it('validates PIN codes', () => {
    expect(farmerCreateSchema.safeParse({ ...validFarmer, pinCode: '012345' }).success).toBe(false);
    expect(farmerCreateSchema.safeParse({ ...validFarmer, pinCode: '50001' }).success).toBe(false);
  });

  it('update requires a reason and version', () => {
    const base = {
      ...validFarmer,
      id: '5eed0000-0000-4000-8000-0000000000a1',
      expectedVersion: '3',
    };
    expect(farmerUpdateSchema.safeParse(base).success).toBe(false);
    const parsed = farmerUpdateSchema.parse({ ...base, reason: 'DEV correction' });
    expect(parsed.expectedVersion).toBe(3);
  });
});

describe('supply schemas', () => {
  const base = {
    supplierId: '5eed0000-0000-4000-8000-0000000000a1',
    productId: '5eed0000-0000-4000-8000-0000000000a2',
    businessDate: '2026-11-25',
    quantity: '12.5',
    confirmationSource: 'phone_call',
  };

  it('accepts decimal-string quantities and rejects floats/zero on create', () => {
    expect(supplyCreateSchema.safeParse(base).success).toBe(true);
    expect(supplyCreateSchema.safeParse({ ...base, quantity: 12.5 }).success).toBe(false);
    expect(supplyCreateSchema.safeParse({ ...base, quantity: '0' }).success).toBe(false);
    expect(supplyCreateSchema.safeParse({ ...base, quantity: '1.2345' }).success).toBe(false);
  });

  it('allows zero on update but requires a reason', () => {
    const update = { id: base.supplierId, expectedVersion: 2, quantity: '0' };
    expect(supplyUpdateSchema.safeParse(update).success).toBe(false);
    expect(
      supplyUpdateSchema.safeParse({ ...update, reason: 'DEV farmer cancelled' }).success,
    ).toBe(true);
  });
});

describe('staff schemas', () => {
  it('enforces the password policy', () => {
    expect(staffPasswordSchema.safeParse('short').success).toBe(false);
    expect(staffPasswordSchema.safeParse('alllowercase123').success).toBe(false);
    expect(staffPasswordSchema.safeParse('DevOnly-Passw0rd').success).toBe(true);
  });

  it('never allows customer as a staff role', () => {
    expect(STAFF_ROLES).not.toContain('customer');
    const result = staffCreateSchema.safeParse({
      email: 'x@example.invalid',
      fullName: 'DEV Staff',
      roles: ['customer'],
      temporaryPassword: 'DevOnly-Passw0rd',
    });
    expect(result.success).toBe(false);
  });

  it('normalises email case', () => {
    const parsed = staffCreateSchema.parse({
      email: ' Dev.Staff@Example.INVALID ',
      fullName: 'DEV Staff',
      roles: ['viewer'],
      temporaryPassword: 'DevOnly-Passw0rd',
    });
    expect(parsed.email).toBe('dev.staff@example.invalid');
  });

  it('requires matching password confirmation', () => {
    expect(
      ownPasswordChangeSchema.safeParse({ newPassword: 'DevOnly-Passw0rd', confirmPassword: 'x' })
        .success,
    ).toBe(false);
  });
});

describe('capabilities (UI visibility only)', () => {
  it('matches the WEB_ADMIN §3 matrix for MVP screens', () => {
    expect(capabilities.manageFarmers(['viewer'])).toBe(false);
    expect(capabilities.viewFarmers(['viewer'])).toBe(true);
    expect(capabilities.viewFarmerPhotos(['viewer'])).toBe(false);
    expect(capabilities.viewSupply(['finance_admin'])).toBe(false);
    expect(capabilities.viewCatalog(['dispatch_admin'])).toBe(false);
    expect(capabilities.manageStaff(['operations_admin'])).toBe(false);
    expect(capabilities.viewAudit(['super_admin'])).toBe(true);
    expect(capabilities.useDashboard(['rider'])).toBe(false);
    expect(capabilities.useDashboard(['customer'])).toBe(false);
  });
});

describe('catalog contract', () => {
  it('requires a business date', () => {
    expect(catalogQuerySchema.safeParse({}).success).toBe(false);
    expect(
      catalogQuerySchema.parse({ businessDate: '2026-11-25', includeUnavailable: 'true' })
        .includeUnavailable,
    ).toBe(true);
  });

  it('product detail needs exactly one identifier', () => {
    expect(productDetailQuerySchema.safeParse({ businessDate: '2026-11-25' }).success).toBe(false);
    expect(
      productDetailQuerySchema.safeParse({ businessDate: '2026-11-25', slug: 'dev-a' }).success,
    ).toBe(true);
  });

  it('derives product status from its best SKU', () => {
    expect(productAvailabilityStatus([])).toBe('unavailable');
    expect(
      productAvailabilityStatus([
        { availabilityStatus: 'unavailable' },
        { availabilityStatus: 'limited' },
      ]),
    ).toBe('limited');
  });

  it('formats NUMERIC values as canonical decimal strings', () => {
    expect(toDecimalString(0.5)).toBe('0.5');
    expect(toDecimalString('0.500')).toBe('0.5');
    expect(toDecimalString('12')).toBe('12');
    expect(toDecimalString('12.000')).toBe('12');
    expect(() => toDecimalString('1e-7')).toThrow(RangeError);
  });

  it('never carries raw supply quantities to customers', () => {
    const keys = Object.keys(catalogProductSchema.shape);
    expect(keys).not.toContain('atp');
    expect(keys).not.toContain('sellableQuantity');
    expect(keys).not.toContain('openConfirmedSupply');
  });
});
