import { describe, expect, it } from 'vitest';
import { HOOSIER_CATALOG_SYNCED_AT, HOOSIER_ROWS } from './supplier_data/hoosierData';
import { parseHoosierData } from './utils';
import { ProductType } from './types';

describe('Hoosier supplier catalogue', () => {
  const items = parseHoosierData(HOOSIER_ROWS, HOOSIER_CATALOG_SYNCED_AT);

  it('contains the complete requested official catalogue without duplicate SKUs', () => {
    expect(items).toHaveLength(58);
    expect(new Set(items.map((item) => item.supplierStockCode)).size).toBe(58);
    expect(HOOSIER_ROWS.filter((row) => row.category === 'Dirt Oval Tyres')).toHaveLength(10);
    expect(HOOSIER_ROWS.filter((row) => row.category === 'Drag Tyres')).toHaveLength(37);
    expect(HOOSIER_ROWS.filter((row) => row.category === 'Racing Tyres')).toHaveLength(10);
    expect(HOOSIER_ROWS.filter((row) => row.category === 'Pro Street')).toHaveLength(1);
  });

  it('preserves exact available quantities and marks backorders as preorder', () => {
    expect(items.filter((item) => item.supplierOrderStatus === 'AVAILABLE')).toHaveLength(39);
    expect(items.filter((item) => item.supplierOrderStatus === 'PREORDER')).toHaveLength(19);
    expect(items.reduce((total, item) => total + item.quantity, 0)).toBe(128);
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
});
