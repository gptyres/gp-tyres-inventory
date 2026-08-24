import { describe, expect, it } from 'vitest';
import { ProductType } from './types';
import { parseSafetyGripData } from './utils';
import { SAFETY_GRIP_RAW_DATA } from './supplier_data/safetygripData';

describe('Safety Grip catalogue pricing', () => {
  it('imports every verified PDF special with a normal comparison price', () => {
    const items = parseSafetyGripData(SAFETY_GRIP_RAW_DATA);

    expect(items).toHaveLength(116);
    expect(new Set(items.map((item) => item.supplierStockCode)).size).toBe(116);
    expect(items.every((item) => item.promotionLabel === 'SPECIAL')).toBe(true);
    expect(items.every((item) => Number(item.normalSellingPrice) > item.sellingPrice)).toBe(true);
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
});
