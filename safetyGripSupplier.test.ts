import { describe, expect, it } from 'vitest';
import { ProductType } from './types';
import { parseSafetyGripData } from './utils';

describe('Safety Grip catalogue pricing', () => {
  it('keeps the supplied nett price as cost and adds VAT once before rounding to R25', () => {
    const [item] = parseSafetyGripData([
      'CODE,DESCRPTION,QUANTITY,COST + VAT',
      'SG-TEST,215/60R16 ANNAITE AN600,7,R655.00'
    ].join('\n'));

    expect(item.type).toBe(ProductType.TYRE);
    expect(item.costPrice).toBe(655);
    expect(item.sellingPrice).toBe(750);
    expect(item.quantity).toBe(7);
  });
});
