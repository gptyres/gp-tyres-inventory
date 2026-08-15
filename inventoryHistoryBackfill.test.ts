import { describe, expect, it } from 'vitest';
import { compareInventoryRevisionSnapshots } from './inventoryHistoryBackfill';
import { ProductType, type TyreProduct } from './types';

const tyre: TyreProduct = {
  id: 't-1', type: ProductType.TYRE, location: 'DECK', brand: 'DUNLOP', pattern: 'FM800',
  size: '195/50R15', loadSpeedIndex: '', quantity: 5, costPrice: 800, sellingPrice: 1200,
  lastUpdated: '2026-08-15', sheetRowNumber: 10, sheetFingerprint: 'deck|dunlopfm800|19550r15',
  sheetSyncedAt: '2026-08-15T08:00:00Z'
};

const bridgestone: TyreProduct = {
  ...tyre,
  id: 't-2',
  brand: 'BRIDGESTONE',
  pattern: 'TURANZA',
  size: '205/55R16',
  quantity: 4,
  sheetRowNumber: 12,
  sheetFingerprint: 'deck|bridgestoneturanza|20555r16'
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

  it('matches moved rows by product identity before sheet position', () => {
    const result = compareInventoryRevisionSnapshots(
      {
        revisionId: 'one',
        modifiedTime: '2026-08-14T08:00:00Z',
        rows: [
          { rowNumber: 10, values: ['DECK', '', 'DUNLOP FM800', '195/50R15', 5, 800, 1200] },
          { rowNumber: 11, values: ['DECK', '', 'BRIDGESTONE TURANZA', '205/55R16', 4, 900, 1400] }
        ]
      },
      {
        revisionId: 'two',
        modifiedTime: '2026-08-15T08:00:00Z',
        rows: [
          { rowNumber: 10, values: ['DECK', '', 'NEW PRODUCT', '225/45R17', 1, 1000, 1500] },
          { rowNumber: 11, values: ['DECK', '', 'DUNLOP FM800', '195/50R15', 3, 800, 1200] },
          { rowNumber: 12, values: ['DECK', '', 'BRIDGESTONE TURANZA', '205/55R16', 4, 900, 1400] }
        ]
      },
      [{ ...tyre, quantity: 3, sheetRowNumber: 11 }, bridgestone]
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ product_id: 't-1', event_type: 'SALE', quantity_delta: -2 });
  });

  it('excludes duplicate candidates for one product and revision pair', () => {
    const result = compareInventoryRevisionSnapshots(
      {
        revisionId: 'one',
        modifiedTime: '2026-08-14T08:00:00Z',
        rows: [
          { rowNumber: 10, portalId: 't-1', values: ['DECK', '', 'DUNLOP FM800', '195/50R15', 5, 800, 1200] },
          { rowNumber: 11, portalId: 't-1', values: ['DECK', '', 'DUNLOP FM800', '195/50R15', 4, 800, 1200] }
        ]
      },
      {
        revisionId: 'two',
        modifiedTime: '2026-08-15T08:00:00Z',
        rows: [
          { rowNumber: 10, portalId: 't-1', values: ['DECK', '', 'DUNLOP FM800', '195/50R15', 3, 800, 1200] },
          { rowNumber: 11, portalId: 't-1', values: ['DECK', '', 'DUNLOP FM800', '195/50R15', 2, 800, 1200] }
        ]
      },
      [tyre]
    );

    expect(result.events).toHaveLength(0);
    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: expect.stringContaining('Multiple historical rows') })
    ]));
  });
});
