import { describe, expect, it } from 'vitest';
import { calculateStockMovementReportTotals } from './stockMovementReport';
import type { DailySalesReportRow } from './types';

const row = (overrides: Partial<DailySalesReportRow> = {}): DailySalesReportRow => ({
  id: 'one', occurredAt: '2026-08-15T08:00:00Z', productId: 't-1', productDescription: '195/50R15 DUNLOP FM800',
  eventType: 'SALE', source: 'POS', units: 2, quantityBefore: 5, quantityAfter: 3,
  currentCostPrice: 800, currentSellingPrice: 1200, staffOrEditor: 'Rafiek', terminalOrSheet: 'GP2', confidence: 'VERIFIED',
  ...overrides
});

describe('daily stock movement PDF totals', () => {
  it('reports gross sales, refunds, net units and current values', () => {
    const totals = calculateStockMovementReportTotals([
      row(),
      row({ id: 'refund', eventType: 'REFUND', units: 1 }),
      row({ id: 'restock', eventType: 'RESTOCK', units: 4 })
    ]);
    expect(totals).toEqual({
      grossUnitsSold: 2,
      refundedUnits: 1,
      reservedUnits: 0,
      restockedUnits: 4,
      netUnitsSold: 1,
      costValue: 1600,
      retailValue: 2400
    });
  });
});
