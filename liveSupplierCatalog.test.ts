import { describe, expect, it } from 'vitest';
import {
  liveSupplierRowToInventoryItem,
  LiveSupplierCatalogRow
} from './liveSupplierCatalog';
import { ProductType } from './types';

const baseRow: LiveSupplierCatalogRow = {
  id: 1,
  snapshot_id: 'snapshot-1',
  catalog_key: 'APEX',
  source_key: 'source-1',
  product_type: 'TYRE',
  supplier: 'Apex',
  supplier_sku: 'SKU-1',
  brand: 'Michelin',
  product_name: 'Michelin Primacy 4',
  category: 'Passenger',
  size: '205/55R16',
  stock_location: 'Cape Town',
  stock_units_availability: 'In stock',
  stock_units: 8,
  cost_price: '1100.00',
  selling_price: '1450.00',
  source_file: 'apex_inventory_sync.csv',
  imported_at: '2026-07-13T10:00:00Z'
};

describe('live supplier catalogue conversion', () => {
  it('converts normalized tyre rows into portal inventory items', () => {
    const item = liveSupplierRowToInventoryItem(baseRow);
    expect(item.type).toBe(ProductType.TYRE);
    if (item.type !== ProductType.TYRE) throw new Error('Expected tyre item');
    expect(item.pattern).toBe('Primacy 4');
    expect(item.quantity).toBe(8);
    expect(item.costPrice).toBe(1100);
    expect(item.sellingPrice).toBe(1450);
    expect(item.location).toBe('Cape Town | In stock');
  });

  it('keeps wheel rows separate from tyre rows', () => {
    const item = liveSupplierRowToInventoryItem({
      ...baseRow,
      catalog_key: 'TYRE_LIFE_WHEELS',
      product_type: 'WHEEL',
      brand: 'Dirty Life',
      product_name: 'Dirty Life A8306 MAYHEM RIDGELINE MACHINED BLACK',
      tyre_pattern: 'A8306 MAYHEM RIDGELINE',
      tyre_specs: 'MACHINED BLACK',
      size: '18x8'
    });
    expect(item.type).toBe(ProductType.WHEEL);
    if (item.type !== ProductType.WHEEL) throw new Error('Expected wheel item');
    expect(item.code).toBe('A8306 MAYHEM RIDGELINE');
    expect(item.size).toBe('18x8');
    expect(item.imageDesignKey).toBe('A8306 MAYHEM RIDGELINE');
    expect(item.imageFinishKey).toBe('MACHINED BLACK');
  });

  it('parses legacy APEX product names into the requested card fields', () => {
    const item = liveSupplierRowToInventoryItem({
      ...baseRow,
      brand: 'COMPASAL',
      product_name: 'CPS60 / 18PR',
      size: '10.00R20'
    });

    if (item.type !== ProductType.TYRE) throw new Error('Expected tyre item');
    expect(item).toMatchObject({
      size: '10.00R20',
      brand: 'COMPASAL',
      pattern: 'CPS60',
      tyreRating: '18PR',
      tyreIndex: '',
      tyreSpecs: '',
      loadSpeedIndex: '18PR'
    });
  });

  it('repairs previously split truck sizes while preserving rating, index, and specs', () => {
    const item = liveSupplierRowToInventoryItem({
      ...baseRow,
      brand: 'COMPASAL',
      product_name: 'COMPASAL 10. CPS60 149/146K 18PR TL',
      size: '00R20'
    });

    if (item.type !== ProductType.TYRE) throw new Error('Expected tyre item');
    expect(item).toMatchObject({
      size: '10.00R20',
      pattern: 'CPS60',
      tyreRating: '18PR',
      tyreIndex: '149/146K',
      tyreSpecs: 'TL',
      loadSpeedIndex: '18PR / 149/146K'
    });
  });

  it('removes missing-value placeholders instead of showing invented tyre details', () => {
    const item = liveSupplierRowToInventoryItem({
      ...baseRow,
      brand: 'Unknown',
      product_name: 'Standard',
      size: '195/65R15'
    });

    if (item.type !== ProductType.TYRE) throw new Error('Expected tyre item');
    expect(item).toMatchObject({
      size: '195/65R15',
      brand: '',
      pattern: '',
      tyreRating: '',
      tyreIndex: '',
      tyreSpecs: '',
      loadSpeedIndex: ''
    });
  });
});
