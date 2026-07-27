import { describe, expect, it } from 'vitest';
import { BRIDGESTONE_RAW_DATA } from './supplier_data/bridgestoneData';
import { ProductType, type TyreProduct } from './types';
import { parseBridgestoneData, searchInventory } from './utils';

describe('Bridgestone supplier catalogue', () => {
  it('loads every supplied SKU with VAT-inclusive R25 pricing', () => {
    const items = parseBridgestoneData(BRIDGESTONE_RAW_DATA) as TyreProduct[];
    const sample = items.find((item) => item.supplierStockCode === '021640');

    expect(items).toHaveLength(200);
    expect(items.every((item) => item.type === ProductType.TYRE)).toBe(true);
    expect(items.every((item) => item.costPrice > 0 && item.sellingPrice % 25 === 0)).toBe(true);
    expect(items.reduce((total, item) => total + item.quantity, 0)).toBe(279);
    expect(items.filter((item) => item.brand === 'FIRESTONE')).toHaveLength(22);
    expect(sample).toMatchObject({
      supplierName: 'BRIDGESTONE',
      brand: 'BRIDGESTONE',
      pattern: 'ALENZA 001',
      size: '215/60R17',
      quantity: 0,
      costPrice: 1725.58,
      sellingPrice: 1975
    });
  });

  it('includes searchable Bridgestone and Firestone TBR stock', () => {
    const items = parseBridgestoneData(BRIDGESTONE_RAW_DATA) as TyreProduct[];
    const tbrItems = searchInventory(items, 'TBR') as TyreProduct[];
    const bridgestoneTbr = items.find((item) => item.supplierStockCode === '810120');
    const firestoneTbr = items.find((item) => item.supplierStockCode === '126190');

    expect(items.every((item) => Boolean(item.size))).toBe(true);
    expect(tbrItems).toHaveLength(31);
    expect(tbrItems.filter((item) => item.brand === 'BRIDGESTONE')).toHaveLength(25);
    expect(tbrItems.filter((item) => item.brand === 'FIRESTONE')).toHaveLength(6);
    expect(bridgestoneTbr).toMatchObject({
      brand: 'BRIDGESTONE',
      size: '10.00R20',
      pattern: 'M840',
      tyreIndex: '146/143K',
      tyreSpecs: 'TBR / TCF',
      quantity: 3,
      stockByLocation: { Local: 3 },
      costPrice: 7881,
      sellingPrice: 9075
    });
    expect(firestoneTbr).toMatchObject({
      brand: 'FIRESTONE',
      size: '11R22.5',
      pattern: 'FS404',
      tyreRating: '16PR',
      tyreIndex: '148/145L',
      quantity: 4,
      costPrice: 6603,
      sellingPrice: 7600
    });
  });
});
