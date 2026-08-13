import { describe, expect, it } from 'vitest';
import { dedupeSheetSyncedInventoryItems } from './inventorySync';
import { InventoryItem, ProductType, TyreProduct } from './types';

const syncedTyre = (overrides: Partial<TyreProduct> = {}): TyreProduct => ({
  id: 'sheet-current',
  type: ProductType.TYRE,
  brand: 'SAILUN',
  pattern: 'TERRAMAX RT OWL',
  size: '31/10.5/15',
  loadSpeedIndex: '',
  location: 'HOME',
  quantity: 7,
  costPrice: 1950,
  sellingPrice: 2999,
  lastUpdated: '2026-08-13',
  sheetSyncedAt: '2026-08-13T14:28:00.000Z',
  sheetRowNumber: 1205,
  sheetFingerprint: 'home|sailunterramaxrtowl|3110515',
  ...overrides
});

describe('sheet-synced inventory deduplication', () => {
  it('keeps only the newest exact location, product and size record', () => {
    const stale = syncedTyre({
      id: 'sheet-stale',
      quantity: 17,
      sheetSyncedAt: '2026-07-06T10:04:47.018Z',
      sheetRowNumber: 1208
    });
    const current = syncedTyre({ quantity: 7 });

    expect(dedupeSheetSyncedInventoryItems([stale, current])).toEqual([current]);
  });

  it('keeps a newer zero-stock update instead of reviving stale positive stock', () => {
    const stale = syncedTyre({
      id: 'sheet-stale',
      quantity: 12,
      sheetSyncedAt: '2026-08-12T10:00:00.000Z'
    });
    const soldOut = syncedTyre({ id: 'sheet-sold-out', quantity: 0 });

    expect(dedupeSheetSyncedInventoryItems([stale, soldOut])).toEqual([soldOut]);
  });

  it('does not merge identical tyres stored at different locations', () => {
    const home = syncedTyre();
    const deck = syncedTyre({
      id: 'sheet-deck',
      location: 'DECK',
      sheetFingerprint: 'deck|sailunterramaxrtowl|3110515'
    });

    expect(dedupeSheetSyncedInventoryItems([home, deck])).toEqual([home, deck]);
  });

  it('uses normalized tyre fields when an older synced row has no fingerprint', () => {
    const stale = syncedTyre({
      id: 'sheet-stale',
      brand: 'Sailun',
      pattern: 'Terramax RT+ OWL',
      size: '31X10.50R15',
      sheetFingerprint: undefined,
      sheetSyncedAt: '2026-08-12T10:00:00.000Z'
    });
    const current = syncedTyre({
      id: 'sheet-current',
      pattern: 'Terramax RT + OWL',
      size: '31x10.50R15',
      sheetFingerprint: undefined
    });

    expect(dedupeSheetSyncedInventoryItems([stale, current])).toEqual([current]);
  });

  it('leaves non-sheet inventory records unchanged', () => {
    const manual = syncedTyre({ id: 'manual-1', sheetSyncedAt: undefined, sheetFingerprint: undefined });
    const wheel = {
      id: 'wheel-1',
      type: ProductType.WHEEL,
      code: 'DAZZLE',
      size: '15x6.5',
      pcd: '4/100',
      offset: '',
      centerBore: '',
      colour: 'Black',
      setQuantity: 4,
      quantity: 4,
      costPrice: 1000,
      sellingPrice: 1800,
      lastUpdated: '2026-08-13'
    } as InventoryItem;

    expect(dedupeSheetSyncedInventoryItems([manual, wheel])).toEqual([manual, wheel]);
  });
});
