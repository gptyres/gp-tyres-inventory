import { describe, expect, it } from 'vitest';
import { formatCustomerStockOption } from './gpBusinessAgent';

describe('customer-ready stock formatting', () => {
  it('uses the exact size brand pattern and selling price format', () => {
    expect(formatCustomerStockOption({
      size: '265/65R17',
      brand: 'Bridgestone',
      pattern: 'Dueler A/T 002',
      sellingPrice: 2675,
      stockUnits: 4
    })).toBe('265/65R17 Bridgestone Dueler A/T 002 @ R2675');
  });

  it('excludes products with fewer than two units', () => {
    expect(formatCustomerStockOption({
      size: '265/65R17', brand: 'Bridgestone', pattern: 'Dueler A/T 002', sellingPrice: 2675, stockUnits: 1
    })).toBeNull();
    expect(formatCustomerStockOption({
      size: '265/65R17', brand: 'Bridgestone', pattern: 'Dueler A/T 002', sellingPrice: 2675, stockUnits: 0
    })).toBeNull();
  });

  it('supports normalised store-inventory specification fields', () => {
    expect(formatCustomerStockOption({
      specifications: { size: '205/55R16', brand: 'Continental', pattern: 'UltraContact' },
      sellingPrice: 1525,
      stockUnits: 2
    })).toBe('205/55R16 Continental UltraContact @ R1525');
  });
});
