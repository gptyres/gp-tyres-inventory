import { describe, expect, it } from 'vitest';
import { TYRE_LIFE_RAW_DATA } from './supplier_data/tyreLifeData';
import { TYRE_LIFE_WHEELS_RAW_DATA } from './supplier_data/tyreLifeWheelsData';
import { APEX_RAW_DATA } from './supplier_data/apexData';
import { TREADS_RAW_DATA } from './supplier_data/treadsUnlimitedData';
import { TUBESTONE_RAW_DATA } from './supplier_data/tubestoneData';
import { TUBESTONE_SPECIALS_RAW_DATA } from './supplier_data/tubestoneSpecialsData';
import { EXOTIC_RAW_DATA } from './supplier_data/exoticData';
import { SAILUN_RAW_DATA } from './supplier_data/sailunData';
import { ROYAL_TYRES_RAW_DATA } from './supplier_data/royalTyresData';
import {
  parseApexData,
  parseExoticData,
  parseRoyalTyresData,
  parseSailunData,
  parseTreadsUnlimitedData,
  parseTubestoneData,
  parseTyreLifeData,
  parseTyreLifeWheelsData
} from './utils';

const nearestVatInclusiveRand = (costPrice: number) => Math.round((costPrice * 1.15) + 1e-9);

describe('supplier pricing refresh', () => {
  it('uses Royal Yellow prices and all four available warehouse balances without the stale supplement', () => {
    const items = parseRoyalTyresData(ROYAL_TYRES_RAW_DATA);
    expect(items).toHaveLength(1169);
    expect(new Set(items.map((item) => item.supplierStockCode)).size).toBe(1169);
    expect(items.reduce((total, item) => total + item.quantity, 0)).toBe(44676);
    expect(items.find((item) => item.supplierStockCode === '3001010040')).toMatchObject({
      brand: 'ASCENSO', size: '11.00-16', costPrice: 2795, sellingPrice: 3214,
      quantity: 3, stockByLocation: { 'RIVER TRUCK': 0, KZN: 3, JHB: 0, CPT: 0 }, lastUpdated: '2026-09-08'
    });
    expect(items.find((item) => item.supplierStockCode === '81U527')).toMatchObject({
      type: 'WHEEL', size: '22.50X11.75', pcd: '10/335', centerBore: '281', offset: '120',
      quantity: 8, costPrice: 0, stockByLocation: { 'RIVER TRUCK': 0, KZN: 7, JHB: 1, CPT: 0 }
    });
    expect(items.find((item) => item.supplierStockCode === '3ESN514F')).toMatchObject({
      quantity: 1, stockByLocation: { 'RIVER TRUCK': 0, KZN: 0, JHB: 1, CPT: 0 }
    });
    expect(items.find((item) => item.supplierStockCode === '229101')).toMatchObject({ size: '365/85R20' });
    expect(items.filter((item) => item.type === 'WHEEL')).toHaveLength(49);
    for (const [warehouse, total] of Object.entries({ 'RIVER TRUCK': 4071, KZN: 29378, JHB: 6236, CPT: 4991 })) {
      expect(items.reduce((sum, item) => sum + (item.stockByLocation?.[warehouse] || 0), 0)).toBe(total);
    }
    expect(items.filter((item) => item.costPrice > 0).every((item) => (
      item.sellingPrice === nearestVatInclusiveRand(item.costPrice)
    ))).toBe(true);
    expect(items.filter((item) => item.sellingPrice === 0)).toHaveLength(43);
    expect(items.filter((item) => item.sellingPrice === 0).every((item) => item.supplierLeadTime?.includes('Price to be confirmed'))).toBe(true);
    expect(ROYAL_TYRES_RAW_DATA).not.toMatch(/Orange|Purple|Green|Cash Price|Account Price/);
  });

  it('embeds the complete Sailun P2 catalogue with 100 units and rounded VAT-inclusive pricing', () => {
    const items = parseSailunData(SAILUN_RAW_DATA);
    const sample = items.find((item) => item.supplierStockCode === '3220002264');

    expect(items).toHaveLength(283);
    expect(items.reduce((total, item) => total + item.quantity, 0)).toBe(28300);
    expect(sample).toMatchObject({
      brand: 'SAILUN',
      pattern: 'ATREZZO SH406',
      size: '155/65R13',
      costPrice: 469,
      sellingPrice: 539,
      quantity: 100,
      stockByLocation: { Supplier: 100 }
    });
    expect(items.every((item) => item.quantity === 100)).toBe(true);
    expect(items.every((item) => item.sellingPrice === nearestVatInclusiveRand(item.costPrice))).toBe(true);
  });

  it('embeds the complete APEX snapshot with exact cost and rounded VAT-inclusive selling prices', () => {
    const items = parseApexData(APEX_RAW_DATA);
    const sample = items.find((item) => item.supplierStockCode === '307672');

    expect(items).toHaveLength(1762);
    expect(items.reduce((total, item) => total + item.quantity, 0)).toBe(16142);
    expect(sample).toMatchObject({ costPrice: 5991, sellingPrice: 6890, quantity: 1, supplierLeadTime: '6 Hours' });
    expect(items.every((item) => item.supplierLeadTime === '6 Hours')).toBe(true);
    expect(items.every((item) => item.sellingPrice === nearestVatInclusiveRand(item.costPrice))).toBe(true);
  });

  it('consolidates Treads Unlimited branch stock into one correctly priced listing per SKU', () => {
    const items = parseTreadsUnlimitedData(TREADS_RAW_DATA);
    const sample = items.find((item) => item.supplierStockCode === '75016STY0850');

    expect(items).toHaveLength(2092);
    expect(sample).toMatchObject({
      costPrice: 3415,
      sellingPrice: 3927,
      quantity: 8,
      stockByLocation: { Regional: 1, National: 7 }
    });
    expect(items.every((item) => item.sellingPrice === nearestVatInclusiveRand(item.costPrice))).toBe(true);
    expect(TREADS_RAW_DATA).not.toContain('Ã');
  });

  it('consolidates Tubestone branch stock into one correctly priced listing per SKU', () => {
    const items = parseTubestoneData(TUBESTONE_RAW_DATA);
    const sample = items.find((item) => item.supplierStockCode === '6016.301');
    const special = items.find((item) => item.supplierStockCode === 'DI0113115');
    const correctedCodeMatch = items.find((item) => item.supplierStockCode === 'MHT3512520');
    const missingPriceLine = items.find((item) => item.supplierStockCode === 'DI0113129');

    expect(items).toHaveLength(1163);
    expect(items.reduce((total, item) => total + item.quantity, 0)).toBe(22149);
    expect(sample).toMatchObject({
      costPrice: 2520,
      sellingPrice: 2898,
      quantity: 56,
      stockByLocation: { BFN: 48, CPT: 6, DBN: 0, JHB: 2, NWH: 0 }
    });
    expect(special).toMatchObject({ costPrice: 1571, sellingPrice: 1807 });
    expect(special?.tyreSpecs).toContain('SPECIAL');
    expect(correctedCodeMatch).toMatchObject({ costPrice: 3250, sellingPrice: 3738 });
    expect(items.filter((item) => item.type === 'TYRE' && /\bSPECIAL\b/.test(item.tyreSpecs || ''))).toHaveLength(44);
    expect(missingPriceLine?.tyreSpecs || '').not.toContain('SPECIAL');
    expect(TUBESTONE_SPECIALS_RAW_DATA.split('\n')).toHaveLength(45);
    expect(items.every((item) => item.sellingPrice === nearestVatInclusiveRand(item.costPrice))).toBe(true);
  });

  it('consolidates Exotic tyre stock while excluding its separate alloy-wheel catalogue', () => {
    const items = parseExoticData(EXOTIC_RAW_DATA);
    const sample = items.find((item) => item.supplierStockCode === 'Z2756517HT5000MAX115H');

    expect(items).toHaveLength(1259);
    expect(sample).toMatchObject({
      costPrice: 865.22,
      sellingPrice: 995,
      quantity: 2,
      stockByLocation: { CPT: 0, JHB: 2 }
    });
    expect(items.every((item) => item.sellingPrice === nearestVatInclusiveRand(item.costPrice))).toBe(true);
    expect(EXOTIC_RAW_DATA).not.toContain('Alloy Wheels');
  });
});

describe('Tyre Life catalogue refresh', () => {
  it('embeds the complete Tyre Life Wheels pricing and stock snapshot', () => {
    const items = parseTyreLifeWheelsData(TYRE_LIFE_WHEELS_RAW_DATA);
    const sample = items.find((item) => item.supplierStockCode === 'SAA8306-2983MB');

    expect(items).toHaveLength(199);
    expect(items.reduce((total, item) => total + item.quantity, 0)).toBe(3123);
    expect(sample).toMatchObject({
      brand: 'Dirty Life',
      code: 'A8306 MAYHEM RIDGELINE',
      finish: 'Satin Black',
      size: '20x9',
      pcd: '139.7',
      offset: '18',
      centerBore: '106',
      sellingPrice: 4850,
      costPrice: 4850,
      quantity: 8,
      stockByLocation: { JHB: 8, CPT: 0, DBN: 0 }
    });
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
