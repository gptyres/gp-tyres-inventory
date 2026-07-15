import { describe, expect, it } from 'vitest';
import { TYRE_LIFE_RAW_DATA } from './supplier_data/tyreLifeData';
import { TYRE_LIFE_WHEELS_RAW_DATA } from './supplier_data/tyreLifeWheelsData';
import { parseTyreLifeData, parseTyreLifeWheelsData } from './utils';

describe('Tyre Life catalogue refresh', () => {
  it('embeds the complete Tyre Life Wheels pricing and stock snapshot', () => {
    const items = parseTyreLifeWheelsData(TYRE_LIFE_WHEELS_RAW_DATA);
    const sample = items.find((item) => item.supplierStockCode === 'SAA8306-2983MB');

    expect(items).toHaveLength(199);
    expect(items.reduce((total, item) => total + item.quantity, 0)).toBe(3123);
    expect(sample).toMatchObject({ sellingPrice: 4850, costPrice: 4850, quantity: 8 });
    expect(TYRE_LIFE_WHEELS_RAW_DATA).not.toContain('â€');
  });

  it('embeds the complete Tyre Life tyre pricing and stock snapshot', () => {
    const items = parseTyreLifeData(TYRE_LIFE_RAW_DATA);
    const sample = items.find((item) => item.supplierStockCode === 'PANCCN0164');

    expect(items).toHaveLength(476);
    expect(items.reduce((total, item) => total + item.quantity, 0)).toBe(18572);
    expect(sample).toMatchObject({
      sellingPrice: 5750,
      costPrice: 5750,
      quantity: 13,
      stockByLocation: { JHB: 11, CPT: 0, DBN: 2 }
    });
  });
});
