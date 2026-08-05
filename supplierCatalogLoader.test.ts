import { describe, expect, it } from 'vitest';
import {
  loadSupplierCatalogItems,
  normalizeBundledSupplierTyres,
  restoreAttStockFromBundledCatalog,
  restoreSupplierWheelSpecsFromBundledCatalog
} from './supplierCatalogLoader';
import { ProductType, type BatteryProduct, type TyreProduct, type WheelProduct } from './types';

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

  it('restores ATT quantities when the entire live snapshot incorrectly reports zero stock', () => {
    const liveItem: TyreProduct = {
      ...bundledTyre,
      id: 'live-att-1',
      brand: '',
      pattern: 'CEAT AAYUSHMAAN',
      size: '18.4-30',
      quantity: 0,
      costPrice: 9159.60,
      sellingPrice: 10525,
      location: 'Supplier network | Out of stock'
    };
    const bundledItem: TyreProduct = {
      ...liveItem,
      id: 'att-1',
      brand: 'CEAT',
      pattern: 'AAYUSHMAAN',
      quantity: 10,
      costPrice: 10500,
      sellingPrice: 10500,
      location: 'Agricultural'
    };

    expect(restoreAttStockFromBundledCatalog([liveItem], [bundledItem])).toEqual([
      expect.objectContaining({
        id: 'live-att-1',
        quantity: 10,
        costPrice: 9159.60,
        sellingPrice: 10525,
        stockByLocation: { 'Supplier network': 10 }
      })
    ]);
  });

  it('does not replace ATT stock when the live snapshot already contains available units', () => {
    const liveItem: TyreProduct = { ...bundledTyre, id: 'live-att-2', quantity: 3 };
    const bundledItem: TyreProduct = { ...bundledTyre, id: 'att-2', quantity: 10 };

    expect(restoreAttStockFromBundledCatalog([liveItem], [bundledItem])).toEqual([liveItem]);
  });

  it('restores missing Dirty Life wheel specs without replacing live stock or pricing', () => {
    const liveWheel: WheelProduct = {
      id: 'live-tyre-life-wheels-a9303',
      type: ProductType.WHEEL,
      supplierName: 'TYRE LIFE WHEELS',
      supplierStockCode: 'SAA9303-7983MB12K',
      code: 'A9303 DT1',
      brand: 'Dirty Life',
      finish: '',
      size: '',
      pcd: '',
      offset: '',
      centerBore: '',
      colour: '',
      setQuantity: 1,
      location: 'JHB: 20 | CPT: 1 | DBN: 0',
      stockByLocation: { JHB: 20, CPT: 1, DBN: 0 },
      quantity: 21,
      costPrice: 5200,
      sellingPrice: 6000,
      lastUpdated: '2026-08-05'
    };
    const bundledWheel: WheelProduct = {
      ...liveWheel,
      id: 'tyrelifewheels-1',
      finish: 'Matte Black W/Simulated Ring',
      size: '17X9',
      pcd: '139.7',
      offset: '-12',
      centerBore: '110.1',
      colour: 'Dirty Life | Matte Black W/Simulated Ring | Wheels | SAA9303-7983MB12K',
      imageDesignKey: 'A9303 DT1',
      imageFinishKey: 'MATTE BLACK W SIMULATED RING',
      quantity: 0,
      costPrice: 1,
      sellingPrice: 1
    };

    expect(restoreSupplierWheelSpecsFromBundledCatalog([liveWheel], [bundledWheel])).toEqual([
      expect.objectContaining({
        id: liveWheel.id,
        finish: 'Matte Black W/Simulated Ring',
        size: '17X9',
        pcd: '139.7',
        offset: '-12',
        centerBore: '110.1',
        quantity: 21,
        costPrice: 5200,
        sellingPrice: 6000,
        stockByLocation: { JHB: 20, CPT: 1, DBN: 0 }
      })
    ]);
  });
});
