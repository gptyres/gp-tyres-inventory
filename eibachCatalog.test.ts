import { describe, expect, it } from 'vitest';
import { EIBACH_CATALOG_SYNCED_AT, EIBACH_ROWS } from './supplier_data/eibachData';
import { calculateEibachSellingPrice } from './supplierPricing';
import { ProductType, type CoiloverProduct } from './types';
import { parseEibachData } from './utils';

describe('EIBACH supplier catalogue', () => {
  const items = parseEibachData(EIBACH_ROWS, EIBACH_CATALOG_SYNCED_AT) as CoiloverProduct[];

  it('imports every official product once with exact stock totals', () => {
    expect(items).toHaveLength(325);
    expect(new Set(items.map((item) => item.id)).size).toBe(325);
    expect(items.filter((item) => item.quantity > 0)).toHaveLength(152);
    expect(items.reduce((total, item) => total + item.quantity, 0)).toBe(219);
    expect(items.every((item) => item.type === ProductType.COILOVER)).toBe(true);
  });

  it('keeps official cost pricing VAT-free and applies 25% rounded to R50', () => {
    expect(calculateEibachSellingPrice(9655)).toBe(12050);
    expect(calculateEibachSellingPrice(1000)).toBe(1250);
    expect(items.every((item) => item.sellingPrice === calculateEibachSellingPrice(item.costPrice))).toBe(true);
  });

  it('maps stock, fitment, lowering details, and official visuals', () => {
    const kit = items.find((item) => item.id === 'eibach-3648');
    expect(kit).toMatchObject({
      supplierName: 'EIBACH',
      supplierStockCode: '2049-140',
      brand: 'EIBACH',
      series: 'PRO-KIT',
      vehicleBrand: 'BMW',
      vehicleModel: '7 Series',
      yearRange: '1994 - 2001',
      frontLowering: '30mm',
      rearLowering: '30mm',
      quantity: 1,
      stockStatus: '1 in stock',
      costPrice: 9655,
      sellingPrice: 12050,
      stockByLocation: { 'Eibach SA': 1 }
    });
    expect(kit?.imageUrl).toMatch(/^https:\/\/www\.eibachsa\.co\.za\/wp-content\/uploads\//);
    expect(kit?.sourceUrl).toMatch(/^https:\/\/www\.eibachsa\.co\.za\/index\.php\/product\//);
  });

  it('never publishes in-stock catalogue lines without a cost', () => {
    expect(items.filter((item) => item.quantity > 0).every((item) => item.costPrice > 0)).toBe(true);
  });
});
