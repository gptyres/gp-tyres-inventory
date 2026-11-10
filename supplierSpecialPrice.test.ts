import { describe, expect, it, vi } from 'vitest';
import { groupLiveSupplierCatalogRows, liveSupplierRowToInventoryItem, type LiveSupplierCatalogRow } from './liveSupplierCatalog';
import { formatBulkClipboardText } from './components/InventoryView';
import { calculateSupplierSellingPrice } from './supplierMarkup';
import { getActiveSupplierSpecial } from './supplierSpecialPrice';

const startsAt = '2026-11-01T00:00:00+02:00';
const endsAt = '2026-12-01T00:00:00+02:00';
const source_stock_detail = JSON.stringify({
  gp_supplier_special_v1: { costExVat: 545, startsAt, endsAt }
});
const regular: LiveSupplierCatalogRow = {
  id: 1, snapshot_id: 'test', catalog_key: 'EXCLUSIVE_TYRES_NEW', source_key: 'cpt',
  product_type: 'TYRE', supplier: 'EXCLUSIVE TYRES', supplier_sku: 'F0634HB',
  brand: 'FIREMAX', product_name: '205/55R16 FIREMAX FM601 91V', size: '205/55R16',
  stock_location: 'CAPE TOWN', stock_units: 4, cost_price: 1609.5, selling_price: 1851,
  source_file: 'test', imported_at: '2026-11-10'
};

describe('dated supplier specials', () => {
  it('uses the valid special in display, markup and clipboard without changing stock', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(startsAt));
      const item = liveSupplierRowToInventoryItem({ ...regular, source_stock_detail });
      expect(item).toMatchObject({ quantity: 4, costPrice: 545, sellingPrice: 627, normalSellingPrice: 1851, promotionLabel: 'SPECIAL' });
      expect(formatBulkClipboardText([item])).toMatch(/@ R627$/);
      expect(calculateSupplierSellingPrice(item, { mode: 'FIXED', value: 100 }, 'ALL_SUPPLIERS')).toBe(742);
      expect(groupLiveSupplierCatalogRows([
        { ...regular, source_stock_detail },
        { ...regular, id: 2, source_key: 'jhb', stock_location: 'JHB' }
      ])).toHaveLength(2);

      vi.setSystemTime(new Date(endsAt));
      const expired = liveSupplierRowToInventoryItem({ ...regular, source_stock_detail });
      expect(expired).toMatchObject({ costPrice: 1609.5, sellingPrice: 1851 });
      expect(expired.promotionLabel).toBeUndefined();
      expect(formatBulkClipboardText([expired])).toMatch(/@ R1851$/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores future or invalid notes and accepts appended provenance', () => {
    expect(getActiveSupplierSpecial(source_stock_detail, Date.parse(startsAt) - 1)).toBeUndefined();
    expect(getActiveSupplierSpecial('"gp_supplier_special_v1":{oops}', Date.parse(startsAt))).toBeUndefined();
    expect(getActiveSupplierSpecial('Historical note | ' + source_stock_detail, Date.parse(startsAt))?.costExVat).toBe(545);
  });
});
