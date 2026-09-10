import { describe, expect, it } from 'vitest';
import { ProductType, ViewMode, type Backorder, type TyreProduct } from './types';
import { matchesStockFilter, stockCounts, overdueBackorders, parseInventoryPreferences, preferenceKey, johannesburgDay } from './stockWorkspace';
import { overviewReducer, initialOverview } from './components/useWorkshopOverview';

const tyre = (quantity: number): TyreProduct => ({ id: `sample-${quantity}`, type: ProductType.TYRE,
  quantity, sellingPrice: 975, costPrice: 700, lastUpdated: '2026-09-10', brand: 'Sample', pattern: 'Touring', size: '205/55R16', loadSpeedIndex: '91V', location: 'Store' });

describe('owned stock availability', () => {
  it('separates unavailable, low and healthy stock at the boundaries', () => {
    const items = [-1, 0, 1, 3, 4, 12, NaN].map(tyre);
    expect(stockCounts(items)).toEqual({ ALL: 7, IN_STOCK: 4, LOW_STOCK: 2, OUT_OF_STOCK: 2 });
    expect(items.filter(item => matchesStockFilter(item, 'LOW_STOCK')).map(item => item.quantity)).toEqual([1, 3]);
    expect(matchesStockFilter(tyre(NaN), 'OUT_OF_STOCK')).toBe(false);
    expect(stockCounts([])).toEqual({ ALL: 0, IN_STOCK: 0, LOW_STOCK: 0, OUT_OF_STOCK: 0 });
  });
  it('keeps a product visible in All even when its quantity is invalid', () => {
    expect(matchesStockFilter(tyre(NaN), 'ALL')).toBe(true);
  });
});

describe('delivery priorities', () => {
  const backorder = (date: string, status: Backorder['status'] = 'PENDING'): Backorder => ({ id: date,
    supplier: 'Sample supplier', productDescription: 'Sample tyres', quantity: 4, expectedDate: date, status, createdAt: '2026-09-01' });
  it('uses Johannesburg midnight and excludes today, invalid dates and completed orders', () => {
    const now = new Date('2026-09-09T22:15:00Z');
    expect(johannesburgDay(now)).toBe('2026-09-10');
    expect(overdueBackorders([
      backorder('2026-09-09'), backorder('2026-09-10'), backorder('2026-09-07'),
      backorder('2026-09-08', 'RECEIVED'), backorder('2026-09-06', 'CANCELLED'),
      backorder('invalid'), backorder('2026-02-31')
    ], now).map(order => order.id)).toEqual(['2026-09-07', '2026-09-09']);
  });
});

describe('saved inventory views', () => {
  it('recovers from corrupt, outdated and malformed preferences', () => {
    expect(parseInventoryPreferences('{')).toEqual(parseInventoryPreferences(null));
    expect(parseInventoryPreferences('{"version":99,"viewMode":"TABLE"}').viewMode).toBe(ViewMode.GRID);
    const result = parseInventoryPreferences(JSON.stringify({ version: 2, viewMode: 'invalid', sort: { key: 'bad', direction: 'asc' }, columns: { cost: 'true', specs: false } }));
    expect(result.viewMode).toBe(ViewMode.GRID);
    expect(result.sort.key).toBe('price');
    expect(result.columns).toEqual({ specs: false, location: true, price: true, cost: false });
  });
  it('defaults to cards and ascending price on every screen and migrates old layouts once', () => {
    const defaults = parseInventoryPreferences(null);
    expect(defaults.viewMode).toBe(ViewMode.GRID);
    expect(defaults.sort).toEqual({ key: 'price', direction: 'asc' });
    const migrated = parseInventoryPreferences(JSON.stringify({ version: 1, viewMode: 'TABLE', sort: { key: 'price', direction: 'desc' }, groupBy: 'brand', columns: { specs: false } }));
    expect(migrated.viewMode).toBe(ViewMode.GRID);
    expect(migrated.sort).toEqual({ key: 'price', direction: 'asc' });
    expect(migrated.groupBy).toBe('none');
    expect(migrated.columns.specs).toBe(false);
    const saved = parseInventoryPreferences('{"version":2,"viewMode":"TABLE","groupBy":"location","sort":{"key":"quantity","direction":"desc"}}');
    expect(saved.viewMode).toBe(ViewMode.TABLE);
    expect(saved.sort).toEqual({ key: 'quantity', direction: 'desc' });
    expect(saved.groupBy).toBe('location');
  });
  it('isolates preferences by user and catalogue', () => {
    expect(preferenceKey('GP1', 'OWNED')).not.toBe(preferenceKey('GP2', 'OWNED'));
    expect(preferenceKey('GP1', 'OWNED')).not.toBe(preferenceKey('GP1', 'APEX'));
    expect(preferenceKey('A:B', 'C')).not.toBe(preferenceKey('A', 'B:C'));
  });
});

describe('workshop refresh state', () => {
  const board = { summary: { active: 7, today: 11, ready: 3, overdue: 2 }, jobs: [], agents: [], breaks: [] };
  it('does not fabricate zeros when the first load fails', () => {
    const state = overviewReducer(initialOverview, { type: 'failure', error: 'Unavailable' });
    expect(state.board).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.updatedAt).toBeNull();
  });
  it('preserves last successful figures and timestamp through failure and retry', () => {
    const success = overviewReducer(initialOverview, { type: 'success', board, at: '2026-09-10T08:00:00Z' });
    const failure = overviewReducer(success, { type: 'failure', error: 'Unavailable' });
    expect(failure.board?.summary.active).toBe(7);
    expect(failure.updatedAt).toBe(success.updatedAt);
    const retry = overviewReducer(failure, { type: 'loading' });
    expect(retry.error).toBe('Unavailable');
    const recovered = overviewReducer(retry, { type: 'success', board, at: '2026-09-10T08:02:00Z' });
    expect(recovered.error).toBeNull();
    expect(recovered.updatedAt).not.toBe(success.updatedAt);
  });
});
