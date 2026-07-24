import { describe, expect, it } from 'vitest';
import { ProductType, type TyreProduct } from './types';
import {
  extractSupplierTyreSizeQuery,
  getSupplierSizeSearchSummary,
  searchSupplierInventory
} from './supplierInventorySearch';

const tyre = (id: string, size: string, brand: string, supplierName: string, sellingPrice = 1000): TyreProduct => ({
  id,
  type: ProductType.TYRE,
  quantity: 8,
  sellingPrice,
  costPrice: sellingPrice / 1.15,
  lastUpdated: '2026-07-24',
  brand,
  pattern: `${brand} PATTERN`,
  size,
  loadSpeedIndex: '',
  location: `${supplierName}: Supplier`,
  supplierName
});

const stock = [
  tyre('dunlop', '205/55R16', 'DUNLOP', 'SUMITOMO/DUNLOP', 1500),
  tyre('michelin', '205/55R16', 'MICHELIN', 'APEX', 1650),
  tyre('sailun', '205/55R16', 'SAILUN', 'SAILUN', 1200),
  tyre('other-size', '205/60R16', 'DUNLOP', 'ATT', 1400)
];

describe('supplier size and brand search', () => {
  it('recognises formatted, spaced and compact tyre sizes', () => {
    expect(extractSupplierTyreSizeQuery('205/55R16 Dunlop')?.numericKey).toBe('2055516');
    expect(extractSupplierTyreSizeQuery('205 55 16 Michelin')?.numericKey).toBe('2055516');
    expect(extractSupplierTyreSizeQuery('2055516')?.displaySize).toBe('205/55R16');
    expect(extractSupplierTyreSizeQuery('31x10.50R15')?.numericKey).toBe('31105015');
  });

  it('shows every available brand for the requested size and ranks the requested brand first', () => {
    const results = searchSupplierInventory(stock, '205/55R16 Sailun');
    expect(results.map((item) => item.id)).toEqual(['sailun', 'dunlop', 'michelin']);
  });

  it('keeps normal AND matching when no tyre size is present', () => {
    expect(searchSupplierInventory(stock, 'Michelin Apex').map((item) => item.id)).toEqual(['michelin']);
  });

  it('summarises the brands and suppliers available for a size', () => {
    expect(getSupplierSizeSearchSummary(searchSupplierInventory(stock, '205 55 16'), '205 55 16')).toEqual({
      size: '205/55R16',
      brands: 3,
      suppliers: 3,
      options: 3
    });
  });
});
