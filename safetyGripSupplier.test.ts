import { describe, expect, it } from 'vitest';
import { ProductType } from './types';
import { parseSafetyGripData } from './utils';
import { SAFETY_GRIP_RAW_DATA } from './supplier_data/safetygripData';

describe('Safety Grip catalogue pricing', () => {
  it('imports every Annaite row from the September PDF without duplicate products', () => {
    const items = parseSafetyGripData(SAFETY_GRIP_RAW_DATA);

    expect(items).toHaveLength(126);
    expect(new Set(items.map((item) => item.supplierStockCode)).size).toBe(126);
    expect(items.every((item) => item.brand === 'ANNAITE')).toBe(true);
    expect(items.every((item) => item.promotionLabel === undefined)).toBe(true);
    expect(items.every((item) => item.normalSellingPrice === undefined)).toBe(true);
  });

  it('keeps normal and special prices distinct and adds VAT once before rounding to the nearest rand', () => {
    const [item] = parseSafetyGripData([
      'CODE,DESCRPTION,QUANTITY,NORMAL COST EX VAT,SPECIAL COST EX VAT',
      'ANNA0042WS,215/60R16 ANNAITE AN600,7,R655.00,R637.00'
    ].join('\n'));

    expect(item.type).toBe(ProductType.TYRE);
    expect(item.costPrice).toBe(637);
    expect(item.sellingPrice).toBe(733);
    expect(item.normalSellingPrice).toBe(753);
    expect(item.promotionLabel).toBe('SPECIAL');
    if (item.type !== ProductType.TYRE) throw new Error('Expected tyre item');
    expect(item.tyreSpecs).toBe('SPECIAL');
    expect(item.quantity).toBe(7);
    expect(item.stockByLocation).toEqual({ CPT: 7 });
  });

  it('parses the new PDF price, flotation sizing and tyre specifications', () => {
    const items = parseSafetyGripData([
      'CODE,DESCRIPTION,QUANTITY,COST EX VAT',
      'SG-1,31X10.50R15LT (WL) ANNAITE EXPLORER MT1,14,2192.00',
      'SG-2,245/70R16 ANNAITE AN906 A/T,146,1110.00'
    ].join('\n'));

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      brand: 'ANNAITE',
      pattern: 'EXPLORER MT1',
      size: '31X10.50R15LT',
      quantity: 14,
      costPrice: 2192,
      sellingPrice: 2521
    });
    expect(items[1]).toMatchObject({
      brand: 'ANNAITE',
      pattern: 'AN906',
      size: '245/70R16',
      quantity: 146,
      costPrice: 1110,
      sellingPrice: 1277
    });
    if (items[0].type !== ProductType.TYRE || items[1].type !== ProductType.TYRE) {
      throw new Error('Expected tyre items');
    }
    expect(items[0].tyreSpecs).toBe('WL');
    expect(items[1].tyreSpecs).toBe('A/T');
  });
});
