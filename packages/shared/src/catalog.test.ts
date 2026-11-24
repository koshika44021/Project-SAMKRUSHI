import { describe, expect, it } from 'vitest';
import {
  buildCatalogProducts,
  type CatalogSourceProduct,
  catalogResponseDataSchema,
  type SkuAvailabilityRow,
} from './catalog.ts';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function product(n: number, overrides: Partial<CatalogSourceProduct> = {}): CatalogSourceProduct {
  return {
    id: uuid(n),
    product_code: `DEV-${n}`,
    slug: `dev-${n}`,
    name: `DEV Product ${n}`,
    local_name: null,
    description: null,
    base_unit: 'kg',
    is_active: true,
    is_listable: true,
    display_order: n,
    category: { code: 'dev-cat', name: 'DEV Category', is_active: true },
    images: [],
    skus: [
      {
        id: uuid(100 + n),
        sku_code: `DEV-${n}-1KG`,
        label: '1 kg',
        sale_unit: 'pack',
        min_order_packs: 1,
        order_step_packs: 1,
        is_active: true,
        display_order: 1,
      },
    ],
    ...overrides,
  };
}

function row(
  n: number,
  status: string,
  maxOrderable: number,
  overrides: Partial<SkuAvailabilityRow> = {},
): SkuAvailabilityRow {
  return {
    sku_id: uuid(100 + n),
    product_id: uuid(n),
    sku_code: `DEV-${n}-1KG`,
    pack_quantity: '1.000',
    price_paise: 1000,
    is_listable: true,
    product_atp: '5.000',
    max_orderable: maxOrderable,
    availability_status: status,
    ...overrides,
  };
}

const imageUrl = (key: string) => `https://example.invalid/storage/${key}`;

describe('buildCatalogProducts', () => {
  it('returns only available/limited products by default, with status and maxOrderable', () => {
    const products = [product(1), product(2), product(3)];
    const rows = [row(1, 'available', 5), row(2, 'limited', 2), row(3, 'unavailable', 0)];
    const result = buildCatalogProducts(products, rows, { imageUrl });
    expect(result.map((p) => p.productCode)).toEqual(['DEV-1', 'DEV-2']);
    expect(result[1]?.availabilityStatus).toBe('limited');
    expect(result[0]?.skus[0]).toMatchObject({
      maxOrderable: 5,
      packQuantity: '1',
      pricePaise: 1000,
    });
    expect(
      catalogResponseDataSchema.safeParse({ businessDate: '2026-11-25', products: result }).success,
    ).toBe(true);
  });

  it('can include unavailable products on request', () => {
    const result = buildCatalogProducts([product(3)], [row(3, 'unavailable', 0)], {
      imageUrl,
      includeUnavailable: true,
    });
    expect(result[0]?.availabilityStatus).toBe('unavailable');
    expect(result[0]?.skus[0]?.maxOrderable).toBe(0);
  });

  it('hides non-listable products, inactive SKUs and inactive categories', () => {
    const products = [
      product(1, { is_listable: false }),
      product(2, { category: { code: 'x', name: 'X', is_active: false } }),
      product(3, { skus: product(3).skus.map((sku) => ({ ...sku, is_active: false })) }),
      product(4),
    ];
    const rows = [
      row(1, 'available', 1),
      row(2, 'available', 1),
      row(3, 'available', 1),
      row(4, 'available', 1, { is_listable: false }),
    ];
    expect(buildCatalogProducts(products, rows, { imageUrl })).toEqual([]);
  });

  it('filters by category and orders images primary-first', () => {
    const p = product(1, {
      images: [
        { storage_key: 'b.webp', alt_text: 'B', is_primary: false, display_order: 1 },
        { storage_key: 'a.webp', alt_text: 'A', is_primary: true, display_order: 2 },
      ],
    });
    const result = buildCatalogProducts([p], [row(1, 'available', 1)], {
      imageUrl,
      categoryCode: 'dev-cat',
    });
    expect(result[0]?.images.map((i) => i.altText)).toEqual(['A', 'B']);
    expect(result[0]?.images[0]?.url).toBe('https://example.invalid/storage/a.webp');
    expect(
      buildCatalogProducts([p], [row(1, 'available', 1)], { imageUrl, categoryCode: 'other' }),
    ).toEqual([]);
  });

  it('never exposes raw supply quantities', () => {
    const [p] = buildCatalogProducts([product(1)], [row(1, 'available', 5)], { imageUrl });
    expect(JSON.stringify(p)).not.toContain('product_atp');
    expect(JSON.stringify(p)).not.toContain('5.000');
  });
});
