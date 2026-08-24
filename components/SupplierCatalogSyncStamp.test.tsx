import { describe, expect, it } from 'vitest';
import { ProductType, type InventoryItem } from '../types';
import { formatCatalogSyncTime, latestCatalogItemDate } from './SupplierCatalogSyncStamp';

describe('supplier catalogue sync stamp', () => {
  it('formats live snapshot timestamps in South African time', () => {
    const formatted = formatCatalogSyncTime('2026-08-24T12:09:57.527776+00:00');
    expect(formatted).toContain('24 Aug 2026');
    expect(formatted).toContain('14:09');
  });

  it('uses the newest bundled catalogue date as a fallback', () => {
    const item = (id: string, lastUpdated: string): InventoryItem => ({
      id,
      type: ProductType.TYRE,
      brand: 'Test',
      pattern: 'Pattern',
      size: '205/55R16',
      loadSpeedIndex: '91V',
      location: 'Supplier',
      quantity: 1,
      costPrice: 100,
      sellingPrice: 115,
      lastUpdated
    });

    expect(latestCatalogItemDate([
      item('older', '2026-08-05'),
      item('newer', '2026-08-24'),
      item('invalid', 'not-a-date')
    ])).toBe('2026-08-24');
  });

  it('shows a clear empty state', () => {
    expect(formatCatalogSyncTime(null)).toBe('Never synced');
    expect(latestCatalogItemDate([])).toBeNull();
  });
});
