import { describe, expect, it } from 'vitest';
import { HOOSIER_CATALOG_SYNCED_AT, HOOSIER_ROWS } from './supplier_data/hoosierData';
import { calculateSupplierSellingPrice, getSupplierCostIncludingVat } from './supplierMarkup';
import { normalizeHoosierCapture } from './scripts/sync-hoosier-catalog.mjs';
import { ProductType } from './types';
import { parseHoosierData, type HoosierSupplierRow } from './utils';

const sample: HoosierSupplierRow = {
  websiteProductId: 1,
  supplierSku: 'TEST-TYRE',
  brand: 'HOOSIER',
  pattern: 'Test Racing Tyre',
  size: '24X8-15',
  category: 'Racing Tyres',
  productName: 'Hoosier Test Racing Tyre',
  stockUnits: 3,
  orderStatus: 'AVAILABLE',
  websiteStockDetail: '3 in stock',
  sellingPrice: 1234.56,
  imageUrl: 'https://example.test/tyre.webp',
  sourceUrl: 'https://example.test/test-tyre',
};

describe('Hoosier supplier catalogue', () => {
  const items = parseHoosierData(HOOSIER_ROWS, HOOSIER_CATALOG_SYNCED_AT);

  it('maps every captured SKU once without changing stock or order status', () => {
    const bySku = new Map(items.map(item => [item.supplierStockCode, item]));
    expect(bySku.size).toBe(HOOSIER_ROWS.length);
    for (const row of HOOSIER_ROWS) {
      expect(bySku.get(row.supplierSku)).toMatchObject({
        size: row.size,
        quantity: row.orderStatus === 'AVAILABLE' ? row.stockUnits : 0,
        supplierOrderStatus: row.orderStatus,
        productLabel: row.productLabel,
        imageUrl: row.imageUrl || undefined,
        sourceUrl: row.sourceUrl || undefined,
      });
    }
  });

  it('keeps the captured base amount and adds VAT once when pricing a tyre', () => {
    const [item] = parseHoosierData([sample], HOOSIER_CATALOG_SYNCED_AT);
    expect(item).toMatchObject({
      type: ProductType.TYRE,
      supplierName: 'HOOSIER TYRES',
      size: sample.size,
      costPrice: 1234.56,
      sellingPrice: 1420,
      supplierCostTaxBasis: 'EXCLUDES_VAT',
    });
    expect(getSupplierCostIncludingVat(item, 'HOOSIER_TYRES')).toBeCloseTo(1419.74);
    expect(calculateSupplierSellingPrice(item, { mode: 'BASE', value: 0 }, 'HOOSIER_TYRES')).toBe(1420);
  });

  it('leaves unreported availability unconfirmed', () => {
    const [item] = parseHoosierData([
      { ...sample, stockUnits: null, orderStatus: 'UNKNOWN', websiteStockDetail: '' },
    ], HOOSIER_CATALOG_SYNCED_AT);
    expect(item).toMatchObject({ supplierOrderStatus: 'UNKNOWN', quantity: 0 });
    expect(item.stockByLocation).toBeUndefined();
  });

  it('leaves an unpriced item unquoted even when markup is enabled', () => {
    const [item] = parseHoosierData([{ ...sample, sellingPrice: 0 }], HOOSIER_CATALOG_SYNCED_AT);
    expect(item).toMatchObject({ costPrice: 0, sellingPrice: 0 });
    expect(calculateSupplierSellingPrice(item, { mode: 'FIXED', value: 100 }, 'HOOSIER_TYRES')).toBe(0);
  });

  it('rejects an incomplete capture before replacing the catalogue', () => {
    expect(() => normalizeHoosierCapture({
      products: [{ id: 1 }],
      pages: [{ total: 2, records: 1, declared_pages: 1 }],
      scraped_at_utc: HOOSIER_CATALOG_SYNCED_AT,
    })).toThrow('Incomplete Hoosier catalogue');
  });
});
