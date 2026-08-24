import { describe, expect, it } from 'vitest';
import {
  applySupplierMarkup,
  calculateSupplierSellingPrice,
  getSupplierCostIncludingVat,
  getSupplierMarkupPriceLabel
} from './supplierMarkup';
import { ProductType, type TyreProduct } from './types';

const tyre = (overrides: Partial<TyreProduct> = {}): TyreProduct => ({
  id: 'supplier-item',
  type: ProductType.TYRE,
  brand: 'TEST',
  pattern: 'PATTERN',
  size: '205/55R16',
  loadSpeedIndex: '91V',
  location: 'Supplier',
  quantity: 4,
  costPrice: 1000,
  sellingPrice: 1250,
  lastUpdated: '2026-08-05',
  ...overrides
});

describe('supplier markup pricing', () => {
  it('adds VAT before applying a percentage to ex-VAT supplier cost', () => {
    expect(getSupplierCostIncludingVat(tyre(), 'APEX')).toBeCloseTo(1150);
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'PERCENT', value: 20 }, 'APEX')).toBe(1380);
  });

  it('uses cost plus 15% VAT as the base for percentage and Rand markup', () => {
    expect(getSupplierCostIncludingVat(tyre(), 'REVOLUTION_TYRES')).toBeCloseTo(1150);
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'PERCENT', value: 10 }, 'REVOLUTION_TYRES')).toBe(1265);
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'FIXED', value: 300 }, 'REVOLUTION_TYRES')).toBe(1450);
  });

  it('includes VAT in the MAXXIS and Royal Tyres markup base', () => {
    expect(getSupplierCostIncludingVat(tyre(), 'MAXXIS')).toBeCloseTo(1150);
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'FIXED', value: 300 }, 'MAXXIS')).toBe(1450);
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'PERCENT', value: 20 }, 'MAXXIS')).toBe(1380);
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'FIXED', value: 300 }, 'ROYAL_TYRES')).toBe(1450);
  });

  it('does not add VAT twice when supplier cost already includes VAT', () => {
    expect(getSupplierCostIncludingVat(tyre(), 'ALINE')).toBe(1000);
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'PERCENT', value: 15 }, 'ALINE')).toBe(1150);
  });

  it('resolves VAT treatment per supplier in all-supplier stock', () => {
    expect(calculateSupplierSellingPrice(
      tyre({ supplierName: 'SUMITOMO/DUNLOP' }),
      { mode: 'FIXED', value: 250 },
      'ALL_SUPPLIERS'
    )).toBe(1400);
    expect(calculateSupplierSellingPrice(
      tyre({ supplierName: 'TYRE LIFE' }),
      { mode: 'FIXED', value: 250 },
      'ALL_SUPPLIERS'
    )).toBe(1250);
    expect(calculateSupplierSellingPrice(
      tyre({ supplierName: 'Revolution Tyres' }),
      { mode: 'FIXED', value: 250 },
      'ALL_SUPPLIERS'
    )).toBe(1400);
    expect(calculateSupplierSellingPrice(
      tyre({ supplierName: 'MAXXIS' }),
      { mode: 'FIXED', value: 250 },
      'ALL_SUPPLIERS'
    )).toBe(1400);
    expect(calculateSupplierSellingPrice(
      tyre({ supplierName: 'Royal Tyres' }),
      { mode: 'FIXED', value: 250 },
      'ALL_SUPPLIERS'
    )).toBe(1400);
  });

  it('does not add VAT to EIBACH cost pricing', () => {
    expect(getSupplierCostIncludingVat(tyre(), 'EIBACH')).toBe(1000);
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'PERCENT', value: 25 }, 'EIBACH')).toBe(1250);
  });

  it('preserves source selling prices in base mode without cloning the list', () => {
    const items = [tyre()];
    expect(applySupplierMarkup(items, { mode: 'BASE', value: 0 }, 'APEX')).toBe(items);
    expect(items[0].sellingPrice).toBe(1250);
  });

  it('sanitizes invalid custom values and labels adjusted prices clearly', () => {
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'FIXED', value: Number.NaN }, 'ALINE')).toBe(1000);
    expect(getSupplierMarkupPriceLabel({ mode: 'PERCENT', value: 25 })).toBe('VAT Inclusive Price (+25%)');
    expect(getSupplierMarkupPriceLabel({ mode: 'FIXED', value: 300 })).toBe('VAT Inclusive Price (+R300)');
  });
});
