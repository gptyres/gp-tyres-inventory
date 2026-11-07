import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLiveSupplierCatalogItems } from './liveSupplierCatalog';

vi.mock('./supabaseClient', () => ({ supabase: { from: () => { throw new Error('anonymous supplier query must not be used'); } } }));
afterEach(() => vi.unstubAllGlobals());

describe('private E-TRACTION catalogue client', () => {
  it('retrieves catalogue rows through the staff-session API', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ rows: [{
        id: 1, snapshot_id: 'snapshot', catalog_key: 'E_TRACTION_TYRES', source_key: 'SKU',
        product_type: 'TYRE', supplier: 'E-TRACTION TYRES', supplier_sku: 'SKU',
        brand: 'EXAMPLE-BRAND', product_name: 'Example tyre', tyre_pattern: 'EXAMPLE-PATTERN',
        size: '000/00R00', stock_units: 100, stock_location: 'Supplier Network',
        stock_units_availability: 'At least 100; portal stock counts are capped',
        cost_price: 123, selling_price: 141, source_file: 'example',
        imported_at: '2026-11-06T10:00:00Z'
      }] })
    })));
    const items = await loadLiveSupplierCatalogItems('E_TRACTION_TYRES' as any);
    expect(items?.[0]).toMatchObject({ supplierName: 'E-TRACTION TYRES', quantity: 100, stockQuantityIsMinimum: true, sellingPrice: 141 });
  });
});

