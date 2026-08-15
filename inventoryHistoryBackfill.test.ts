import { describe, expect, it } from 'vitest';
import { compareInventoryRevisionSnapshots } from './inventoryHistoryBackfill';
import { ProductType, type TyreProduct } from './types';

const tyre: TyreProduct = {
  id: 't-1', type: ProductType.TYRE, location: 'DECK', brand: 'DUNLOP', pattern: 'FM800',
  size: '195/50R15', loadSpeedIndex: '', quantity: 5, costPrice: 800, sellingPrice: 1200,
  lastUpdated: '2026-08-15', sheetRowNumber: 10, sheetFingerprint: 'deck|dunlopfm800|19550r15',
  sheetSyncedAt: '2026-08-15T08:00:00Z'
};

describe('Google Sheet history backfill', () => {
  it('classifies a quantity decrease as a reconstructed sale', () => {
    const result = compareInventoryRevisionSnapshots(
      { revisionId: 'one', modifiedTime: '2026-08-14T08:00:00Z', rows: [{ rowNumber: 10, portalId: 't-1', values: ['DECK', '', 'DUNLOP FM800', '195/50R15', 5, 800, 1200] }] },
      { revisionId: 'two', modifiedTime: '2026-08-15T08:00:00Z', editorEmail: 'staff@example.com', rows: [{ rowNumber: 10, portalId: 't-1', values: ['DECK', '', 'DUNLOP FM800', '195/50R15', 3, 800, 1200] }] },
      [tyre]
    );
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ event_type: 'SALE', quantity_delta: -2, confidence: 'RECONSTRUCTED', product_id: 't-1' });
  });

  it('is deterministic across reruns and skips unmatched products', () => {
    const previous = { revisionId: 'one', modifiedTime: '2026-08-14T08:00:00Z', rows: [{ rowNumber: 99, values: ['HOME', '', 'UNKNOWN TYRE', '1', 1, 1, 1] }] };
    const current = { revisionId: 'two', modifiedTime: '2026-08-15T08:00:00Z', rows: [{ rowNumber: 99, values: ['HOME', '', 'UNKNOWN TYRE', '1', 0, 1, 1] }] };
    const first = compareInventoryRevisionSnapshots(previous, current, []);
    const second = compareInventoryRevisionSnapshots(previous, current, []);
    expect(first.events).toEqual(second.events);
    expect(first.skipped).toHaveLength(1);
  });
});
