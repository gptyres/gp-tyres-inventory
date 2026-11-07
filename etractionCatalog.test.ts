import { describe, expect, it } from 'vitest';
import { isLiveSupplierCatalog } from './supplierCatalogMapping';
import { SUPPLIER_CATALOG_OPTIONS } from './supplierCatalogLoader';
import { groupLiveSupplierCatalogRows, liveSupplierRowToInventoryItem, type LiveSupplierCatalogRow } from './liveSupplierCatalog';
import { formatItemStockQuantity } from './components/InventoryView';
import { normalizeManualSupplierGrid } from './manualSupplierImport';

describe('E-TRACTION catalogue integration', () => {
  it('retains a stock lower bound when an E-TRACTION file is uploaded later', () => {
    const parsed = normalizeManualSupplierGrid('E_TRACTION_TYRES' as any, [
      ['SKU', 'Size', 'Brand', 'Pattern', 'Quantity', 'Cost Price Ex VAT'],
      ['EXAMPLE-SKU', '000/00R00', 'EXAMPLE-BRAND', 'EXAMPLE-PATTERN', '100+', '123']
    ]);
    expect(parsed.rows[0].stockUnits).toBe(100);
    expect(parsed.rows[0].stockAvailability).toContain('portal stock counts are capped');
  });
  it('allows separate tyre and wheel inventories in supplier selection and live loading', () => {
    expect(isLiveSupplierCatalog('E_TRACTION_TYRES' as any)).toBe(true);
    expect(isLiveSupplierCatalog('E_TRACTION_WHEELS' as any)).toBe(true);
    expect(SUPPLIER_CATALOG_OPTIONS.map(x => x.catalog)).toContain('E_TRACTION_TYRES');
    expect(SUPPLIER_CATALOG_OPTIONS.map(x => x.catalog)).toContain('E_TRACTION_WHEELS');
  });

  it('preserves a capped quantity and adds VAT exactly once', () => {
    const row: LiveSupplierCatalogRow = {
      id: 1, snapshot_id: 'snapshot', catalog_key: 'E_TRACTION_TYRES', source_key: 'SKU',
      product_type: 'TYRE', supplier: 'E-TRACTION TYRES', supplier_sku: 'SKU',
      brand: 'EXAMPLE-BRAND', product_name: 'Example tyre',
      size: '000/00R00', tyre_pattern: 'EXAMPLE-PATTERN', stock_units: 100,
      stock_location: 'Supplier Network', stock_units_availability: 'At least 100; portal stock counts are capped',
      cost_price: 123, selling_price: 141, source_file: 'example',
      imported_at: '2026-11-06T10:00:00Z'
    };
    const item = liveSupplierRowToInventoryItem(groupLiveSupplierCatalogRows([row])[0]);
    expect(formatItemStockQuantity(item)).toBe('100+');
    expect(item.costPrice).toBe(123);
    expect(item.sellingPrice).toBe(141);
  });
});

