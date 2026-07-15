import { describe, expect, it } from 'vitest';
import { TYRE_LIFE_RAW_DATA } from './supplier_data/tyreLifeData';
import { TYRE_LIFE_WHEELS_RAW_DATA } from './supplier_data/tyreLifeWheelsData';
import { APEX_RAW_DATA } from './supplier_data/apexData';
import { TREADS_RAW_DATA } from './supplier_data/treadsUnlimitedData';
import { TUBESTONE_RAW_DATA } from './supplier_data/tubestoneData';
import {
  parseApexData,
  parseTreadsUnlimitedData,
  parseTubestoneData,
  parseTyreLifeData,
  parseTyreLifeWheelsData
} from './utils';

const nearestVatInclusive25 = (costPrice: number) => Math.round((costPrice * 1.15 / 25) + 1e-9) * 25;

describe('15 July supplier pricing refresh', () => {
  it('embeds the complete APEX snapshot with exact cost and rounded VAT-inclusive selling prices', () => {
    const items = parseApexData(APEX_RAW_DATA);
    const sample = items.find((item) => item.supplierStockCode === '307672');

    expect(items).toHaveLength(1547);
    expect(sample).toMatchObject({ costPrice: 5991, sellingPrice: 6900, quantity: 1 });
    expect(items.every((item) => item.sellingPrice === nearestVatInclusive25(item.costPrice))).toBe(true);
  });

  it('consolidates Treads Unlimited branch stock into one correctly priced listing per SKU', () => {
    const items = parseTreadsUnlimitedData(TREADS_RAW_DATA);
    const sample = items.find((item) => item.supplierStockCode === '75016STY0850');

    expect(items).toHaveLength(2092);
    expect(sample).toMatchObject({
      costPrice: 3415,
      sellingPrice: 3925,
      quantity: 8,
      stockByLocation: { Regional: 1, National: 7 }
    });
    expect(items.every((item) => item.sellingPrice === nearestVatInclusive25(item.costPrice))).toBe(true);
    expect(TREADS_RAW_DATA).not.toContain('Ã');
  });

  it('consolidates Tubestone branch stock into one correctly priced listing per SKU', () => {
    const items = parseTubestoneData(TUBESTONE_RAW_DATA);
    const sample = items.find((item) => item.supplierStockCode === '6016.35');

    expect(items).toHaveLength(1163);
    expect(sample).toMatchObject({
      costPrice: 3341.47,
      sellingPrice: 3850,
      quantity: 10,
      stockByLocation: { BFN: 4, CPT: 0, DBN: 0, JHB: 6, NWH: 0 }
    });
    expect(items.every((item) => item.sellingPrice === nearestVatInclusive25(item.costPrice))).toBe(true);
  });
});

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
