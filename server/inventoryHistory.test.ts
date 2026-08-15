import { describe, expect, it } from 'vitest';
import type { InventoryChangeEvent } from '../types';
import {
  buildStockMovementLedgerRows,
  buildDailySalesReportRows,
  getJohannesburgDayBounds,
  summarizeStockMovements
} from './inventoryHistory';

const event = (overrides: Partial<InventoryChangeEvent> = {}): InventoryChangeEvent => ({
  id: 'event-1',
  productId: 't-1',
  productType: 'TYRE',
  productSnapshot: { id: 't-1', type: 'TYRE', size: '195/50R15', brand: 'DUNLOP', pattern: 'FM800' },
  eventType: 'SALE',
  source: 'GOOGLE_SHEET',
  quantityBefore: 5,
  quantityAfter: 3,
  quantityDelta: -2,
  costPriceAtChange: 800,
  sellingPriceAtChange: 1200,
  changedFields: ['quantity'],
  oldValues: { quantity: 5 },
  newValues: { quantity: 3 },
  confidence: 'VERIFIED',
  occurredAt: '2026-08-15T08:00:00.000Z',
  metadata: {},
  ...overrides
});

describe('inventory history summaries', () => {
  it('groups movement by Johannesburg calendar days and zero-fills the range', () => {
    const summary = summarizeStockMovements([
      event(),
      event({ id: 'restock', eventType: 'RESTOCK', quantityDelta: 4, occurredAt: '2026-08-14T11:00:00.000Z' })
    ], 5, new Date('2026-08-15T12:00:00.000Z'));

    expect(summary.daily).toHaveLength(5);
    expect(summary.soldUnitsToday).toBe(2);
    expect(summary.costValueToday).toBe(1600);
    expect(summary.retailValueToday).toBe(2400);
    expect(summary.soldUnits).toBe(2);
    expect(summary.uniqueProducts).toBe(1);
    expect(summary.costValue).toBe(1600);
    expect(summary.retailValue).toBe(2400);
    expect(summary.restockedUnits).toBe(4);
    expect(summary.daily.find((day) => day.date === '2026-08-14')?.restockedUnits).toBe(4);
    expect(summary.movements).toHaveLength(2);
  });

  it('builds a tyre-only top ten with the stock location', () => {
    const summary = summarizeStockMovements([
      event({ id: 'sale-a', productSnapshot: { type: 'TYRE', size: '195/50R15', brand: 'DUNLOP', pattern: 'FM800', location: 'Deck' } }),
      event({ id: 'sale-b', productId: 't-2', quantityBefore: 9, quantityAfter: 6, quantityDelta: -3, productSnapshot: { type: 'TYRE', size: '195/50R15', brand: 'DUNLOP', pattern: 'FM800', location: 'Store' } }),
      event({ id: 'wheel-sale', productId: 'w-1', productType: 'WHEEL', productSnapshot: { type: 'WHEEL', brand: 'MOMO', code: 'REVENGE', location: 'Deck' } })
    ], 1, new Date('2026-08-15T12:00:00.000Z'));

    expect(summary.topTyres).toEqual([expect.objectContaining({
      description: '195/50R15 DUNLOP FM800',
      units: 5,
      location: 'Deck, Store'
    })]);
  });

  it('orders movement rows newest first and includes location and actor context', () => {
    const rows = buildStockMovementLedgerRows([
      event({ id: 'older', productSnapshot: { type: 'TYRE', size: '195/50R15', location: 'Deck' } }),
      event({ id: 'newer', occurredAt: '2026-08-15T10:00:00.000Z', staffName: 'Rafiek', terminalId: 'GP2', productSnapshot: { type: 'TYRE', size: '205/40R17', location: 'Store' } })
    ]);

    expect(rows.map((row) => row.id)).toEqual(['newer', 'older']);
    expect(rows[0]).toMatchObject({ location: 'Store', actor: 'Rafiek', terminalOrSheet: 'GP2 / Rafiek' });
  });

  it('uses South African midnight boundaries', () => {
    expect(getJohannesburgDayBounds('2026-08-15')).toEqual({
      start: '2026-08-14T22:00:00.000Z',
      end: '2026-08-15T22:00:00.000Z'
    });
  });

  it('uses current prices in daily report rows and retains reconstructed labels', () => {
    const rows = buildDailySalesReportRows([
      event({ confidence: 'RECONSTRUCTED', editorEmail: 'staff@example.com', sheetRowNumber: 22 })
    ], new Map([['t-1', { costPrice: 900, sellingPrice: 1350 }]]));
    expect(rows[0]).toMatchObject({
      currentCostPrice: 900,
      currentSellingPrice: 1350,
      staffOrEditor: 'staff@example.com',
      terminalOrSheet: 'Sheet row 22',
      confidence: 'RECONSTRUCTED'
    });
  });
});
