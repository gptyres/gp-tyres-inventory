import { describe, expect, it } from 'vitest';
import type { StockMovementSummary } from './types';
import { canViewStockMovementFinancials, maskStockMovementFinancials } from './stockMovementAccess';

const summary: StockMovementSummary = {
  timezone: 'Africa/Johannesburg',
  days: 1,
  from: '2026-08-15T00:00:00.000+02:00',
  to: '2026-08-15T23:59:59.999+02:00',
  soldUnitsToday: 6,
  refundUnitsToday: 0,
  uniqueProductsToday: 3,
  costValueToday: 4500,
  retailValueToday: 7200,
  restockedUnitsToday: 2,
  editCountToday: 1,
  daily: [],
  topItems: []
};

describe('stock movement financial access', () => {
  it.each(['GP1', 'GP2', 'GP6', 'Noor', 'Mac', 'Rafiek', ' rafiek '])(
    'allows authorized staff identity %s without admin mode',
    (identity) => expect(canViewStockMovementFinancials(identity)).toBe(true)
  );

  it('allows any logged-in terminal while admin mode is active', () => {
    expect(canViewStockMovementFinancials('GP5', true)).toBe(true);
  });

  it.each(['GP4', 'GP5', 'GP7', 'GP8', 'Yaseen', ''])('denies other staff identity %s', (identity) => {
    expect(canViewStockMovementFinancials(identity)).toBe(false);
  });

  it('removes financial totals without changing operational movement data', () => {
    const masked = maskStockMovementFinancials(summary, false);
    expect(masked.costValueToday).toBe(0);
    expect(masked.retailValueToday).toBe(0);
    expect(masked.soldUnitsToday).toBe(6);
    expect(masked.topItems).toEqual([]);
    expect(summary.costValueToday).toBe(4500);
  });

  it('keeps the full summary for authorized staff', () => {
    expect(maskStockMovementFinancials(summary, true)).toBe(summary);
  });
});
