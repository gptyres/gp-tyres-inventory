import { describe, expect, it } from 'vitest';
import { ProductType, type InventoryItem } from '../types';
import { formatCatalogSyncTime, latestCatalogItemDate, resolveCatalogSyncStamp } from './SupplierCatalogSyncStamp';

describe('resolveCatalogSyncStamp', () => {
  const snapshot = '2026-10-27T09:12:00Z';
  const update = '2026-11-10T11:25:00Z';

  it('shows later catalogue additions without changing the snapshot date', () => {
    expect(resolveCatalogSyncStamp(snapshot, update)).toEqual({
      at: update, label: 'Last updated', snapshotAt: snapshot
    });
  });

  it('keeps the existing sync label for unchanged, earlier, or invalid dates', () => {
    for (const date of [null, snapshot, '2026-10-26T09:12:00Z', 'invalid']) {
      expect(resolveCatalogSyncStamp(snapshot, date)).toEqual({
        at: snapshot, label: 'Last synced', snapshotAt: null
      });
    }
  });

  it('keeps the existing fallback for catalogues without live sync status', () => {
    expect(resolveCatalogSyncStamp(null, null, '2026-11-05')).toEqual({
      at: '2026-11-05', label: 'Last synced', snapshotAt: null
    });
  });
});

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
