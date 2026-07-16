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

  it('keeps supplier cost separate from recommended selling price', () => {
    const item = parseAlineData(ALINE_RAW_DATA).find((candidate) => candidate.supplierStockCode === '82410224');

    expect(item).toMatchObject({
      code: '82410224',
      size: '15x8',
      pcd: '4/100',
      quantity: 6,
      location: 'JHB: 6 | CPT: 0 | DBN: 0',
      costPrice: 5590,
      sellingPrice: 6990
    });
  });
});
