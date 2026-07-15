import { describe, expect, it } from 'vitest';
import { getItemDisplayName, getItemSecondaryLine } from './InventoryView';
import { ProductType, type TyreProduct, type WheelProduct } from '../types';

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

describe('supplier wheel card formatting', () => {
  const dirtyLifeWheel: WheelProduct = {
    id: 'live-tyre-life-wheels-a9303',
    type: ProductType.WHEEL,
    quantity: 8,
    sellingPrice: 4850,
    costPrice: 4850,
    lastUpdated: '2026-07-15',
    supplierName: 'TYRE LIFE WHEELS',
    supplierStockCode: 'SAA8306-2983MB',
    imageDesignKey: 'A8306 MAYHEM RIDGELINE',
    imageFinishKey: 'SATIN BLACK',
    code: 'A8306 MAYHEM RIDGELINE',
    brand: 'Dirty Life',
    finish: 'Satin Black',
    size: '20X9',
    pcd: '139.7',
    offset: '18',
    centerBore: '106',
    colour: 'Dirty Life | Satin Black',
    setQuantity: 1,
    location: 'JHB: 8 | CPT: 0 | DBN: 0',
    stockByLocation: { JHB: 8, CPT: 0, DBN: 0 }
  };

  it('shows brand, finish, size, PCD, offset and centre bore', () => {
    expect(getItemDisplayName(dirtyLifeWheel)).toBe('A8306 MAYHEM RIDGELINE');
    expect(getItemSecondaryLine(dirtyLifeWheel)).toBe('Dirty Life / SATIN BLACK / 20X9 / 139.7 / ET18 / CB 106');
  });
});
