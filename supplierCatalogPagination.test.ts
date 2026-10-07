import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), limit: vi.fn(), gt: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from: mocks.from } }));
import { loadLiveSupplierCatalogItems } from './liveSupplierCatalog';

const row = (id: number) => ({
  id, snapshot_id: 'active', catalog_key: 'APEX', source_key: `source-${id}`,
  product_type: 'TYRE', supplier: 'APEX', supplier_sku: `SKU-${id}`,
  brand: 'DUNLOP', product_name: 'DUNLOP AT3', tyre_pattern: 'AT3',
  size: '265/60R18', stock_units: 4, cost_price: 1000, selling_price: 1200,
  imported_at: '2026-10-07T10:00:00Z', stock_location: 'CPT',
});

describe('complete live catalogue pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limit.mockReset();
    const query: any = {
      select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(() => query),
      gt: mocks.gt.mockImplementation(() => query), limit: mocks.limit,
      maybeSingle: vi.fn(async () => ({ data: { active_snapshot_id: 'active' }, error: null })),
    };
    mocks.from.mockReturnValue(query);
  });
  it('reads beyond a short page and binds each request to the active snapshot', async () => {
    mocks.limit.mockResolvedValueOnce({ data: [row(1), row(2)] })
      .mockResolvedValueOnce({ data: [row(3)] }).mockResolvedValueOnce({ data: [] });
    const items = await loadLiveSupplierCatalogItems('APEX');
    expect(items).toHaveLength(3);
    expect(mocks.gt.mock.calls).toEqual([['id', 0], ['id', 2], ['id', 3]]);
    const query = mocks.from.mock.results[0].value;
    expect(query.eq.mock.calls.filter(([key]: string[]) => key === 'snapshot_id')).toEqual([
      ['snapshot_id', 'active'], ['snapshot_id', 'active'], ['snapshot_id', 'active'],
    ]);
  });
  it('rejects partial results on a later page error', async () => {
    mocks.limit.mockResolvedValueOnce({ data: [row(1)] }).mockResolvedValueOnce({ error: { message: 'request failed' } });
    await expect(loadLiveSupplierCatalogItems('APEX')).rejects.toThrow('request failed');
  });
  it('stops a non-advancing cursor instead of repeating forever', async () => {
    mocks.limit.mockResolvedValue({ data: [row(1)] });
    await expect(loadLiveSupplierCatalogItems('APEX')).rejects.toThrow('did not advance');
    expect(mocks.limit).toHaveBeenCalledTimes(2);
  });
});
