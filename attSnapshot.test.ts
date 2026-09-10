import { describe, expect, it } from 'vitest';
import { ATT_SNAPSHOT_ROWS } from './supplier_data/attSnapshot';
import { groupLiveSupplierCatalogRows, liveSupplierRowToInventoryItem } from './liveSupplierCatalog';
import { calculateSupplierSellingPrice } from './supplierMarkup';

describe('verified ATT catalogue including unavailable products', () => {
  const rows = ATT_SNAPSHOT_ROWS.map((row, index) => ({ ...row, id: index + 1, snapshot_id: 'att-test' }));

  it('includes 698 unique products, excluding only the training/demo item', () => {
    expect(rows).toHaveLength(698);
    expect(new Set(rows.map(row => row.supplier_sku)).size).toBe(698);
    expect(groupLiveSupplierCatalogRows(rows)).toHaveLength(698);
    expect(rows.some(row => row.supplier_sku === 'TY-TBRMIDTEST')).toBe(false);
  });

  it('retains all 108 unavailable entries with zero quantity and undisclosed prices', () => {
    const unavailable = rows.filter(row => JSON.parse(row.source_stock_detail!).price_available === false);
    expect(unavailable).toHaveLength(108);
    for (const row of unavailable) {
      expect(row.stock_units).toBe(0);
      expect(row.stock_by_location).toEqual({ CPT: 0 });
      expect(row.cost_price).toBe(0);
      expect(row.selling_price).toBe(0);
      const item = liveSupplierRowToInventoryItem(row);
      expect(item.quantity).toBe(0);
      expect(item.costPrice).toBe(0);
      expect(item.sellingPrice).toBe(0);
      expect(calculateSupplierSellingPrice(item, { mode: 'FIXED', value: 500 }, 'ATT')).toBe(0);
      expect(calculateSupplierSellingPrice(item, { mode: 'PERCENT', value: 20 }, 'ATT')).toBe(0);
    }
  });

  it('keeps verified stock and applies VAT once, rounded to the nearest rand', () => {
    const stocked = rows.filter(row => row.stock_units > 0);
    expect(stocked).toHaveLength(590);
    expect(stocked.reduce((total, row) => total + row.stock_units, 0)).toBe(15949);
    for (const row of stocked) {
      expect(row.selling_price).toBe(Math.round(Number(row.cost_price) * 1.15));
      expect(liveSupplierRowToInventoryItem(row).sellingPrice).toBe(row.selling_price);
    }
  });
});
