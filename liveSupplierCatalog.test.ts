import { describe, expect, it } from 'vitest';
import {
  groupLiveSupplierCatalogRows,
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
  it('combines branch stock for the same SKU into one listing', () => {
    const rows = ['JHB', 'GLK', 'CPT', 'DBN'].map((location, index) => ({
      ...baseRow,
      id: index + 1,
      catalog_key: 'TYREWAREHOUSE',
      source_key: `source-${location.toLowerCase()}`,
      stock_location: location,
      stock_units: location === 'GLK' ? 4 : 0,
      stock_units_availability: location === 'GLK' ? 'Available' : 'Out of stock'
    }));

    const grouped = groupLiveSupplierCatalogRows(rows);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      stock_units: 4,
      stock_by_location: { JHB: 0, GLK: 4, CPT: 0, DBN: 0 },
      stock_location: 'JHB: 0 | GLK: 4 | CPT: 0 | DBN: 0'
    });

    const item = liveSupplierRowToInventoryItem(grouped[0]);
    expect(item).toMatchObject({
      quantity: 4,
      stockByLocation: { JHB: 0, GLK: 4, CPT: 0, DBN: 0 }
    });
    if (item.type !== ProductType.TYRE) throw new Error('Expected tyre item');
    expect(item.location).toBe('JHB: 0 | GLK: 4 | CPT: 0 | DBN: 0');
  });

  it('combines matching location rows for every supplier catalogue', () => {
    const grouped = groupLiveSupplierCatalogRows([
      { ...baseRow, source_key: 'apex-cape-town', stock_location: 'Cape Town' },
      { ...baseRow, id: 2, source_key: 'apex-johannesburg', stock_location: 'Johannesburg' }
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      stock_units: 16,
      stock_by_location: { 'Cape Town': 8, Johannesburg: 8 }
    });
  });

  it('keeps different sizes and prices as separate listings even when a supplier reuses a SKU', () => {
    const grouped = groupLiveSupplierCatalogRows([
      baseRow,
      { ...baseRow, id: 2, source_key: 'different-size', size: '225/45R17' },
      { ...baseRow, id: 3, source_key: 'different-price', selling_price: '1500.00' }
    ]);

    expect(grouped).toHaveLength(3);
  });

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
      wheel_pcd: '139.7',
      wheel_offset: '18',
      wheel_center_bore: '106',
      stock_by_location: { JHB: 5, CPT: 2, DBN: 1 },
      stock_location: 'JHB: 5 | CPT: 2 | DBN: 1',
      size: '18x8'
    });
    expect(item.type).toBe(ProductType.WHEEL);
    if (item.type !== ProductType.WHEEL) throw new Error('Expected wheel item');
    expect(item.code).toBe('A8306 MAYHEM RIDGELINE');
    expect(item.brand).toBe('Dirty Life');
    expect(item.finish).toBe('MACHINED BLACK');
    expect(item.size).toBe('18x8');
    expect(item.pcd).toBe('139.7');
    expect(item.offset).toBe('18');
    expect(item.centerBore).toBe('106');
    expect(item.stockByLocation).toEqual({ JHB: 5, CPT: 2, DBN: 1 });
    expect(item.supplierName).toBe('TYRE LIFE WHEELS');
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
