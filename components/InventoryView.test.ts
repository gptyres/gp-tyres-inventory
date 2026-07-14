import { describe, expect, it } from 'vitest';
import { getItemDisplayName, getItemSecondaryLine } from './InventoryView';
import { ProductType, type TyreProduct } from '../types';

const supplierTyre: TyreProduct = {
  id: 'live-apex-cps60',
  type: ProductType.TYRE,
  quantity: 20,
  sellingPrice: 4500,
  costPrice: 4000,
  lastUpdated: '2026-07-14',
  supplierName: 'Apex',
  brand: 'COMPASAL',
  pattern: 'CPS60',
  size: '10.00R20',
  loadSpeedIndex: '18PR / 149/146K',
  tyreRating: '18PR',
  tyreIndex: '149/146K',
  tyreSpecs: 'TL',
  location: 'Apex | In stock'
};

describe('supplier tyre card formatting', () => {
  it('uses size, brand, and pattern for the primary line', () => {
    expect(getItemDisplayName(supplierTyre)).toBe('10.00R20 COMPASAL CPS60');
  });

  it('uses rating, index, and remaining specs for the secondary line', () => {
    expect(getItemSecondaryLine(supplierTyre)).toBe('18PR / 149/146K / TL');
  });

  it('leaves unavailable supplier fields blank', () => {
    const incomplete = {
      ...supplierTyre,
      brand: 'Unknown',
      pattern: 'Standard',
      tyreRating: '',
      tyreIndex: '',
      tyreSpecs: '',
      loadSpeedIndex: ''
    };
    expect(getItemDisplayName(incomplete)).toBe('10.00R20');
    expect(getItemSecondaryLine(incomplete)).toBe('');
  });
});
