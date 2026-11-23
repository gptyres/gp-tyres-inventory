import { describe, expect, it } from 'vitest';
import { MAXXIS_RAW_DATA } from './supplier_data/maxxisData';
import { parseMaxxisData } from './utils';

const vatInclusiveRand = (costPrice: number) => Math.round((costPrice * 1.15) + 1e-9);

describe('MAXXIS supplier catalogue', () => {
  it('imports the November 4x4/SUV catalogue plus the retained ATV and motorcycle categories', () => {
    const items = parseMaxxisData(MAXXIS_RAW_DATA);
    const categories = items.reduce<Record<string, number>>((counts, item) => {
      const category = item.type === 'TYRE' ? (item.tyreSpecs || '').split(' / ')[0] : '';
      counts[category] = (counts[category] || 0) + 1;
      return counts;
    }, {});

    expect(items).toHaveLength(182);
    expect(categories).toEqual({ '4X4 & SUV': 104, ATV: 58, MOTORCYCLE: 20 });
    expect(items.filter((item) => item.type === 'TYRE' && item.brand === 'MAXXIS')).toHaveLength(146);
    expect(items.filter((item) => item.type === 'TYRE' && item.brand === 'CST')).toHaveLength(34);
    expect(items.filter((item) => item.type === 'TYRE' && item.brand === 'ACIMUT')).toHaveLength(2);
  });

  it('uses November NETT PRICE, adds VAT once, rounds to R1, and does not claim stock', () => {
    const items = parseMaxxisData(MAXXIS_RAW_DATA);
    const fourByFour = items.find((item) => item.supplierStockCode === 'AT811-02');
    const atv = items.find((item) => item.supplierStockCode === 'M301-02');
    const motorcycle = items.find((item) => item.supplierStockCode === 'M7324-03');

    expect(fourByFour).toMatchObject({
      brand: 'MAXXIS',
      pattern: 'RAZR AT811',
      size: 'LT245/70R16',
      tyreRating: '10PR',
      tyreIndex: '118/115R',
      costPrice: 3275,
      sellingPrice: 3766,
      supplierStockCode: 'AT811-02'
    });
    expect(atv).toMatchObject({
      pattern: 'BIGHORN 3.0 M301',
      size: '26X9.00R12',
      tyreRating: '6PR',
      tyreSpecs: 'ATV / UTILITY / FRONT',
      costPrice: 2616.9,
      sellingPrice: 3009
    });
    expect(motorcycle).toMatchObject({
      pattern: 'MAXX ENDURO SUPER SOFT M7324',
      size: '140/80-18',
      tyreIndex: '70R',
      tyreSpecs: 'MOTORCYCLE / OFF ROAD / REAR',
      costPrice: 1295,
      sellingPrice: 1489
    });
    expect(items.every((item) => item.quantity === 0)).toBe(true);
    expect(items.every((item) => item.supplierLeadTime === 'Stock not supplied')).toBe(true);
    expect(items.every((item) => item.sellingPrice === vatInclusiveRand(item.costPrice))).toBe(true);
  });

  it('uses the 4+ Black Friday tier and retains normal and 20+ mix pricing metadata', () => {
    const items = parseMaxxisData(MAXXIS_RAW_DATA);
    const special = items.find((item) => item.supplierStockCode === 'AT811-15');
    const sameTierSpecial = items.find((item) => item.supplierStockCode === 'MT772-02');

    expect(special).toMatchObject({
      costPrice: 4450,
      sellingPrice: 5118,
      normalSellingPrice: 5417,
      promotionLabel: 'BLACK FRIDAY 4+ UNITS | NORMAL COST EX VAT R4710 | 20+ MIX EX VAT R4250'
    });
    expect(special?.type === 'TYRE' ? special.tyreSpecs : '').toContain('SPECIAL');
    expect(sameTierSpecial).toMatchObject({
      costPrice: 6195,
      sellingPrice: 7124,
      normalSellingPrice: 7929,
      promotionLabel: 'BLACK FRIDAY 4+ UNITS | NORMAL COST EX VAT R6895 | 20+ MIX EX VAT R6195'
    });
    expect(items.filter((item) => /BLACK FRIDAY/.test(item.promotionLabel || ''))).toHaveLength(17);
  });

  it('includes the two new November 4x4/SUV SKUs', () => {
    const items = parseMaxxisData(MAXXIS_RAW_DATA);

    expect(items.find((item) => item.supplierStockCode === 'AT781-09')).toMatchObject({
      size: '255/55R20',
      pattern: 'RAZR AT781',
      costPrice: 3795,
      sellingPrice: 4364
    });
    expect(items.find((item) => item.supplierStockCode === 'MT772-33')).toMatchObject({
      size: '35X13.50R17LT',
      pattern: 'RAZR MT772',
      costPrice: 6800,
      sellingPrice: 7820
    });
  });
});
