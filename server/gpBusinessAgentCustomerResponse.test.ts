import { describe, expect, it } from 'vitest';
import { formatCustomerStockOption, getAgentProductOptions } from './gpBusinessAgent';

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

  it('normalises slash-separated tyre sizes and omits incomplete product rows', () => {
    expect(formatCustomerStockOption({
      size: '265/65/17', brand: 'Sailun', pattern: 'Terramax RT', sellingPrice: 2600, stockUnits: 8
    })).toBe('265/65R17 Sailun Terramax RT @ R2600');
    expect(formatCustomerStockOption({
      size: '265/65R17', brand: 'Trazano', pattern: '', sellingPrice: 1850, stockUnits: 8
    })).toBeNull();
  });

  it('collects direct and grouped stock-tool options', () => {
    expect(getAgentProductOptions({
      products: [{ productId: 'direct' }],
      gpStockOptions: [{ productId: 'gp' }],
      supplierStockOptions: [{ productId: 'supplier' }],
      bestAvailableOption: { productId: 'best' }
    }).map((product) => product.productId)).toEqual(['direct', 'gp', 'supplier', 'best']);
  });
});
