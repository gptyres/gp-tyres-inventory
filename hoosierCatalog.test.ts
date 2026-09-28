import { describe, expect, it } from 'vitest';
import { HOOSIER_CATALOG_SYNCED_AT, HOOSIER_ROWS } from './supplier_data/hoosierData';
import { parseHoosierData } from './utils';
import { ProductType } from './types';
import { getSupplierCostIncludingVat, calculateSupplierSellingPrice } from './supplierMarkup';
import { normalizeHoosierCapture } from './scripts/sync-hoosier-catalog.mjs';

describe('Hoosier supplier catalogue', () => {
  const items = parseHoosierData(HOOSIER_ROWS, HOOSIER_CATALOG_SYNCED_AT);

  it('contains the complete requested official catalogue without duplicate SKUs', () => {
    expect(items).toHaveLength(67);
    expect(new Set(items.map((item) => item.supplierStockCode)).size).toBe(67);
    expect(HOOSIER_ROWS.filter((row) => row.category === 'Dirt Oval Tyres')).toHaveLength(11);
    expect(HOOSIER_ROWS.filter((row) => row.category === 'Drag Tyres')).toHaveLength(37);
    expect(HOOSIER_ROWS.filter((row) => row.category === 'Racing Tyres')).toHaveLength(10);
    expect(HOOSIER_ROWS.filter((row) => row.category === 'Pro Street')).toHaveLength(1);
    expect(HOOSIER_ROWS.filter((row) => row.category === 'Karting')).toHaveLength(4);
    expect(HOOSIER_ROWS.filter((row) => row.category === 'Motorcycle')).toHaveLength(2);
    expect(HOOSIER_ROWS.filter((row) => row.category === 'Tubes')).toHaveLength(2);
  });

  it('preserves exact available quantities and marks backorders as preorder', () => {
    expect(items.filter((item) => item.supplierOrderStatus === 'AVAILABLE')).toHaveLength(45);
    expect(items.filter((item) => item.supplierOrderStatus === 'PREORDER')).toHaveLength(21);
    expect(items.reduce((total, item) => total + item.quantity, 0)).toBe(174);
    expect(items.filter((item) => item.supplierOrderStatus === 'PREORDER').every((item) => item.quantity === 0)).toBe(true);
  });

  it('maps supplier fields, website pricing, and official visuals onto tyre items', () => {
    const item = items.find((candidate) => candidate.supplierStockCode === '43164R20');
    expect(item).toMatchObject({
      type: ProductType.TYRE,
      supplierName: 'HOOSIER TYRES',
      brand: 'HOOSIER',
      pattern: 'Dirt Oval Tyre R20',
      size: '20.5X7.0-13',
      quantity: 2,
      supplierOrderStatus: 'AVAILABLE',
      costPrice: 5450,
      sellingPrice: 5450,
      supplierCostTaxBasis: 'INCLUDES_VAT',
      stockByLocation: { 'Hoosier South Africa': 2 }
    });
    expect(item?.imageUrl).toMatch(/^https:\/\/hoosiertyres\.co\.za\/wp-content\/uploads\//);
    expect(item?.sourceUrl).toBe('https://hoosiertyres.co.za/product/hoosier-20-5x7-0-13r20-43164r20/');
  });

  it('does not invent a quantity or availability for the newly listed D12 tyre', () => {
    const row = HOOSIER_ROWS.find(r => r.supplierSku === '35112D12');
    const item = items.find(i => i.supplierStockCode === '35112D12')!;
    expect(row).toMatchObject({ stockUnits: null, websitePurchasable: false });
    expect(item).toMatchObject({ size: '68.0/7.0-13', supplierOrderStatus: 'UNKNOWN', quantity: 0,
      sellingPrice: 5606.25, lastUpdated: '2026-09-28', sheetSyncedAt: '2026-09-28T15:09:55.033Z' });
    expect(item.stockByLocation).toBeUndefined();
    expect(getSupplierCostIncludingVat(item, 'HOOSIER_TYRES')).toBe(5606.25);
    expect(calculateSupplierSellingPrice(item, { mode: 'BASE', value: 0 }, 'HOOSIER_TYRES')).toBe(5606.25);
  });

  it('keeps tubes distinct and preserves authoritative motorsport sizes', () => {
    const tubes = items.filter(i => i.type === ProductType.TYRE && i.productLabel === 'TUBE');
    expect(tubes).toHaveLength(2);
    expect(tubes.reduce((n, i) => n + i.quantity, 0)).toBe(5);
    expect(items.find(i => i.supplierStockCode === '19300')).toMatchObject({ size: '31X16.50R15LT' });
    expect(HOOSIER_ROWS.every(row => items.find(i => i.supplierStockCode === row.supplierSku)?.sellingPrice === row.sellingPrice)).toBe(true);
  });

  it('rejects an incomplete capture before replacing the catalogue', () => {
    expect(() => normalizeHoosierCapture({ products: [{ id: 1 }],
      pages: [{ total: 2, records: 1, declared_pages: 1 }], scraped_at_utc: HOOSIER_CATALOG_SYNCED_AT
    })).toThrow('Incomplete Hoosier catalogue');
  });
});
