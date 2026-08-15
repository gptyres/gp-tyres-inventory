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
import { ROYAL_TYRES_CAPE_TOWN_RAW_DATA } from './supplier_data/royalTyresCapeTownData';
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
  it('embeds the complete Royal Tyres PCR and TBR catalogues with VAT added to normal prices', () => {
    const items = parseRoyalTyresData(ROYAL_TYRES_RAW_DATA);
    const pcrSample = items.find((item) => item.supplierStockCode === 'RT-PCR-EA548652F1');
    const tbrSample = items.find((item) => item.supplierStockCode === 'RT-TBR-C2A30F4C0F');
    const cptTbrSample = items.find((item) => item.supplierStockCode === 'RT-TBR-BC2EB611B0');
    const newCptTyre = items.find((item) => item.type === 'TYRE' && item.pattern === 'AC808' && item.size === '175/70R14');
    const newCptWheel = items.find((item) => item.type === 'WHEEL' && item.size === '17.50X6.75');
    const newCptOtr = items.find((item) => item.type === 'TYRE' && item.brand === 'AEOLUS' && item.size === '14.00-24');

    expect(items).toHaveLength(247);
    expect(items.reduce((total, item) => total + item.quantity, 0)).toBe(30421);
    expect(pcrSample).toMatchObject({
      brand: 'ANCHEE',
      pattern: 'AC808',
      size: '155/70R13',
      tyreIndex: '75T',
      tyreSpecs: 'PCR / H/T',
      costPrice: 399,
      sellingPrice: 459,
      quantity: 96,
      stockByLocation: { DBN: 76, CPT: 20 }
    });
    expect(tbrSample).toMatchObject({
      brand: 'TAITONG',
      pattern: 'HS268',
      size: '7.00R16',
      tyreRating: '14PR',
      tyreIndex: '118/114L',
      tyreSpecs: 'TBR / MP / TTF',
      costPrice: 1740,
      sellingPrice: 2001,
      quantity: 58,
      stockByLocation: { DBN: 58 }
    });
    expect(cptTbrSample).toMatchObject({
      costPrice: 4495,
      sellingPrice: 5169,
      quantity: 22,
      stockByLocation: { DBN: 16, CPT: 6 }
    });
    expect(newCptTyre).toMatchObject({ costPrice: 445, sellingPrice: 512, quantity: 10, stockByLocation: { CPT: 10 } });
    expect(newCptWheel).toMatchObject({ pcd: '6/222', offset: '135', centerBore: '116.4', costPrice: 910, sellingPrice: 1047, quantity: 10 });
    expect(newCptOtr).toMatchObject({ pattern: 'IND4 AIND41', tyreRating: '28PR', tyreSpecs: 'OTR / TL', quantity: 8, costPrice: 15980, sellingPrice: 18377 });
    expect(items.filter((item) => item.stockByLocation && Object.hasOwn(item.stockByLocation, 'CPT'))).toHaveLength(87);
    expect(items.reduce((total, item) => total + (item.stockByLocation?.CPT || 0), 0)).toBe(2276);
    expect(items.filter((item) => item.type === 'WHEEL')).toHaveLength(3);
    expect(items.filter((item) => item.costPrice > 0).every((item) => (
      item.sellingPrice === nearestVatInclusiveRand(item.costPrice)
    ))).toBe(true);
    expect(items.filter((item) => item.sellingPrice === 0)).toHaveLength(1);
    expect(ROYAL_TYRES_RAW_DATA).not.toMatch(/bulk/i);
    expect(ROYAL_TYRES_CAPE_TOWN_RAW_DATA.split('\n')).toHaveLength(88);
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
