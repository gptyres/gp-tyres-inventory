import { describe, expect, it } from 'vitest';
import { EIBACH_CATALOG_SYNCED_AT, EIBACH_ROWS } from './supplier_data/eibachData';
import { ProductType } from './types';
import { parseEibachData, type EibachSupplierRow } from './utils';

const sample: EibachSupplierRow = {
  websiteProductId: 1,
  supplierSku: 'TEST-KIT',
  vehicleBrand: 'Test Make',
  vehicleModel: 'Test Model',
  productName: 'Pro-Kit Test Model',
  productLine: 'PRO-KIT',
  vehicleCompatibility: 'Test Make Test Model',
  yearRange: '2000 - 2005',
  frontLowering: '30mm',
  rearLowering: '25mm',
  details: 'Test fitment details',
  stockUnits: 3,
  stockStatus: '3 in stock',
  costPrice: 1234.56,
  imageUrl: 'https://example.test/kit.webp',
  sourceUrl: 'https://example.test/test-kit',
};

describe('EIBACH supplier catalogue', () => {
  const items = parseEibachData(EIBACH_ROWS, EIBACH_CATALOG_SYNCED_AT);

  it('imports every official product once and preserves reported quantities', () => {
    const byId = new Map(items.map(item => [item.id, item]));
    expect(byId.size).toBe(EIBACH_ROWS.length);
    for (const row of EIBACH_ROWS) {
      expect(byId.get(`eibach-${row.websiteProductId}`)).toMatchObject({
        type: ProductType.COILOVER,
        quantity: row.stockUnits,
        stockStatus: row.stockStatus,
      });
    }
  });

  it('adds VAT to the ex-VAT cost without the old markup', () => {
    const [item] = parseEibachData([sample], EIBACH_CATALOG_SYNCED_AT);
    expect(item).toMatchObject({
      costPrice: 1234.56,
      sellingPrice: 1420,
      supplierCostTaxBasis: 'EXCLUDES_VAT',
    });
  });

  it('maps the supplied fitment, lowering details, and visuals', () => {
    const [item] = parseEibachData([sample], EIBACH_CATALOG_SYNCED_AT);
    expect(item).toMatchObject({
      supplierName: 'EIBACH',
      supplierStockCode: sample.supplierSku,
      vehicleCompatibility: sample.vehicleCompatibility,
      frontLowering: sample.frontLowering,
      rearLowering: sample.rearLowering,
      imageUrl: sample.imageUrl,
      sourceUrl: sample.sourceUrl,
    });
  });

  it('leaves missing prices unquoted', () => {
    const [item] = parseEibachData([{ ...sample, costPrice: 0 }], EIBACH_CATALOG_SYNCED_AT);
    expect(item).toMatchObject({ costPrice: 0, sellingPrice: 0 });
  });
});
