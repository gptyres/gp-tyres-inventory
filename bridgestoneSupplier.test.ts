import { describe, expect, it } from 'vitest';
import { BRIDGESTONE_RAW_DATA } from './supplier_data/bridgestoneData';
import { ProductType, type TyreProduct } from './types';
import { parseBridgestoneData } from './utils';

describe('Bridgestone supplier catalogue', () => {
  it('loads every supplied SKU with VAT-inclusive R25 pricing', () => {
    const items = parseBridgestoneData(BRIDGESTONE_RAW_DATA) as TyreProduct[];
    const sample = items.find((item) => item.supplierStockCode === '021640');

    expect(items).toHaveLength(406);
    expect(items.every((item) => item.type === ProductType.TYRE)).toBe(true);
    expect(items.reduce((total, item) => total + item.quantity, 0)).toBe(1198);
    expect(items.filter((item) => item.brand === 'FIRESTONE')).toHaveLength(15);
    expect(sample).toMatchObject({
      supplierName: 'BRIDGESTONE',
      brand: 'BRIDGESTONE',
      pattern: 'ALENZA 001',
      size: '215/60R17',
      quantity: 4,
      costPrice: 1725.58,
      sellingPrice: 1975
    });
  });

  it('recovers HL-prefixed sizes from product descriptions', () => {
    const items = parseBridgestoneData(BRIDGESTONE_RAW_DATA) as TyreProduct[];
    const hlItem = items.find((item) => item.supplierStockCode === '835250');

    expect(items.every((item) => Boolean(item.size))).toBe(true);
    expect(hlItem).toMatchObject({
      size: '255/35R19',
      pattern: 'TURANZA 6',
      sellingPrice: 3100
    });
  });
});
