import { describe, expect, it } from 'vitest';
import { TREADS_UNLIMITED_RAW_DATA } from './supplier_data/treadsUnlimitedData';
import { TYRE_LIFE_WHEELS_RAW_DATA } from './supplier_data/tyreLifeWheelsData';
import { parseTreadsUnlimitedData, parseTyreLifeWheelsData } from './utils';

describe('Tyre Life and Treads catalogue refresh', () => {
  it('embeds the complete Tyre Life Wheels pricing and stock snapshot', () => {
    const items = parseTyreLifeWheelsData(TYRE_LIFE_WHEELS_RAW_DATA);
    const sample = items.find((item) => item.supplierStockCode === 'SAA8306-2983MB');

    expect(items).toHaveLength(199);
    expect(items.reduce((total, item) => total + item.quantity, 0)).toBe(3123);
    expect(sample).toMatchObject({ sellingPrice: 4850, costPrice: 4850, quantity: 8 });
    expect(TYRE_LIFE_WHEELS_RAW_DATA).not.toContain('â€');
  });

  it('embeds the complete Treads Unlimited national pricing and stock snapshot', () => {
    const items = parseTreadsUnlimitedData(TREADS_UNLIMITED_RAW_DATA);
    const sample = items.find((item) => item.supplierStockCode === '2358516SBFATKO3RWL');

    expect(items).toHaveLength(2390);
    expect(items.reduce((total, item) => total + item.quantity, 0)).toBe(155285);
    expect(sample).toMatchObject({ sellingPrice: 4500, costPrice: 4500, quantity: 12 });
    expect(TREADS_UNLIMITED_RAW_DATA).toContain('BFGoodrich®');
    expect(TREADS_UNLIMITED_RAW_DATA).not.toContain('Ã');
  });
});
