import { describe, expect, it } from 'vitest';
import { ProductType, type TyreProduct, type WheelProduct } from './types';
import {
  extractSupplierTyreSizeQuery,
  extractSupplierWheelSizeQuery,
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

const wheel = (
  id: string,
  size: string,
  vehicleFitments: string,
  overrides: Partial<WheelProduct> = {}
): WheelProduct => ({
  id,
  type: ProductType.WHEEL,
  quantity: 8,
  sellingPrice: 6990,
  costPrice: 5590,
  lastUpdated: '2026-08-24',
  supplierName: 'ALINE',
  supplierStockCode: id,
  code: 'HYPE',
  brand: 'A-Line',
  finish: 'GLOSS BLACK',
  size,
  pcd: '5/100',
  offset: '35',
  centerBore: '73.1',
  colour: 'A-Line | GLOSS BLACK',
  setQuantity: 4,
  location: 'JHB: 8',
  vehicleFitments,
  ...overrides
});

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

describe('supplier wheel size, specification and fitment search', () => {
  const wheels = [
    wheel('15-vw', '15x8', 'VW Polo / Audi A1'),
    wheel('15-toyota', '15x7.5', 'ToyCorolla / Nissan Micra', { pcd: '4/100', offset: '32' }),
    wheel('17-vw', '17x8', 'VW Polo / Audi A1'),
    wheel('18-bmw', '18x8.5', 'BMW 3 Series', { pcd: '5/120', offset: '38', centerBore: '72.6' })
  ];

  it('recognises wheel diameter and full wheel-size formats', () => {
    expect(extractSupplierWheelSizeQuery('15 inch VW Polo')?.displaySize).toBe('15 inch');
    expect(extractSupplierWheelSizeQuery('show 15 inch wheels')?.diameter).toBe('15');
    expect(extractSupplierWheelSizeQuery('show 15 wheels')?.diameter).toBe('15');
    expect(extractSupplierWheelSizeQuery('15x7.5 4x100')?.displaySize).toBe('15x7.5');
    expect(extractSupplierWheelSizeQuery('5x100')).toBeNull();
  });

  it('returns only the exact requested wheel diameter', () => {
    expect(searchSupplierInventory(wheels, '15 inch').map((item) => item.id)).toEqual(['15-vw', '15-toyota']);
    expect(searchSupplierInventory(wheels, '15').map((item) => item.id)).toEqual(['15-vw', '15-toyota']);
    expect(searchSupplierInventory(wheels, '15x7.5').map((item) => item.id)).toEqual(['15-toyota']);
  });

  it('combines exact wheel size with vehicle and specification terms', () => {
    expect(searchSupplierInventory(wheels, '15 inch VW Polo').map((item) => item.id)).toEqual(['15-vw']);
    expect(searchSupplierInventory(wheels, '15x7.5 4x100 ET32').map((item) => item.id)).toEqual(['15-toyota']);
    expect(searchSupplierInventory(wheels, '18 inch BMW CB72.6').map((item) => item.id)).toEqual(['18-bmw']);
  });

  it('expands common A-Line vehicle abbreviations for search', () => {
    expect(searchSupplierInventory(wheels, '15 inch Toyota Corolla').map((item) => item.id)).toEqual(['15-toyota']);
  });
});
