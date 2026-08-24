import { describe, expect, it } from 'vitest';
import { ALINE_RAW_DATA } from './supplier_data/alineData';
import { parseAlineData } from './utils';

describe('ALINE supplier data', () => {
  it('contains the complete latest grouped supplier export', () => {
    const items = parseAlineData(ALINE_RAW_DATA);

    expect(items).toHaveLength(697);
    expect(new Set(items.map((item) => item.supplierStockCode)).size).toBe(697);
    expect(items.reduce((total, item) => total + item.quantity, 0)).toBe(124607);
  });

  it('shows supplier cost and recommended selling price as totals for four rims', () => {
    const item = parseAlineData(ALINE_RAW_DATA).find((candidate) => candidate.supplierStockCode === '82410224');

    expect(item).toMatchObject({
      code: '82410224',
      size: '15x8',
      pcd: '4/100',
      quantity: 6,
      location: 'JHB: 6 | CPT: 0 | DBN: 0',
      setQuantity: 4,
      costPrice: 22360,
      sellingPrice: 27960
    });
  });

  it('does not multiply accessory prices by the four-rim set quantity', () => {
    const item = parseAlineData(ALINE_RAW_DATA).find((candidate) => candidate.supplierStockCode === '82440005');

    expect(item).toMatchObject({
      size: 'Accessory',
      setQuantity: 1,
      costPrice: 7.8,
      sellingPrice: 8
    });
  });
});
