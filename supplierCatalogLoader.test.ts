import { describe, expect, it } from 'vitest';
import { loadSupplierCatalogItems, normalizeBundledSupplierTyres } from './supplierCatalogLoader';
import { ProductType, type BatteryProduct, type TyreProduct } from './types';

const bundledTyre: TyreProduct = {
  id: 'bundled-1',
  type: ProductType.TYRE,
  quantity: 8,
  sellingPrice: 4500,
  costPrice: 4000,
  lastUpdated: '2026-07-14',
  brand: 'COMPASAL',
  pattern: 'CPS60',
  size: '10.00R20',
  loadSpeedIndex: '18PR',
  location: 'Supplier'
};

describe('site-wide supplier catalogue formatting', () => {
  it('normalizes bundled fallback catalogues with the same fields as live catalogues', () => {
    const [item] = normalizeBundledSupplierTyres('APEX', [bundledTyre]);
    if (item.type !== ProductType.TYRE) throw new Error('Expected tyre item');
    expect(item).toMatchObject({
      supplierName: 'APEX',
      size: '10.00R20',
      brand: 'COMPASAL',
      pattern: 'CPS60',
      tyreRating: '18PR',
      tyreIndex: '',
      loadSpeedIndex: '18PR'
    });
  });

  it('loads the Dixon catalogue with only the requested battery price fields', async () => {
    const items = await loadSupplierCatalogItems('DIXON_BATTERIES');
    expect(items).toHaveLength(32);
    expect(items.every((item) => item.type === ProductType.BATTERY)).toBe(true);

    const battery = items[0] as BatteryProduct;
    expect(battery).toMatchObject({
      batteryType: '612',
      batteryDescription: 'SMF CaCa 12V 46Ah, 355 CCA, LWH: 207x175x190',
      nettPrice: 1398,
      grossPrice: 1568,
      costIncluding: 1607.70,
      sellingPrice: 1807.70,
      supplierName: 'DIXON BATTERIES'
    });
    expect(battery).not.toHaveProperty('scrapLoading');
  });
});
