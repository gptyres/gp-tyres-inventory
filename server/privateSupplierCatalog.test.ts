import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../api/supplier-sync';
import { verifyStaffSession } from './staffSession';
import { createSupabaseAdmin } from './supabaseAdmin';

vi.mock('./staffSession', () => ({ verifyStaffSession: vi.fn() }));
vi.mock('./supabaseAdmin', () => ({ createSupabaseAdmin: vi.fn() }));

const response = () => {
  const out: any = { setHeader: vi.fn() };
  out.status = vi.fn(() => out);
  out.json = vi.fn(() => out);
  return out;
};
afterEach(() => vi.resetAllMocks());

describe('private E-TRACTION catalogue endpoint', () => {
  it('rejects a caller without a staff session before accessing private data', async () => {
    vi.mocked(verifyStaffSession).mockReturnValue(null);
    const res = response();
    await handler({ method: 'GET', url: '/api/supplier-sync?resource=private-catalog&catalog=E_TRACTION_TYRES' }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('returns an empty catalogue to authenticated staff when no snapshot exists', async () => {
    vi.mocked(verifyStaffSession).mockReturnValue({ terminalId: 'GP1', staffName: 'Staff' } as any);
    const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: null }) };
    vi.mocked(createSupabaseAdmin).mockReturnValue({ from: () => query } as any);
    const res = response();
    await handler({ method: 'GET', url: '/api/supplier-sync?resource=private-catalog&catalog=E_TRACTION_TYRES' }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ rows: [] });
  });

  it('rejects requests for any catalogue outside the private allowlist', async () => {
    vi.mocked(verifyStaffSession).mockReturnValue({ terminalId: 'GP1', staffName: 'Staff' } as any);
    const from = vi.fn();
    vi.mocked(createSupabaseAdmin).mockReturnValue({ from } as any);
    const res = response();
    await handler({ method: 'GET', url: '/api/supplier-sync?resource=private-catalog&catalog=APEX' }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(from).not.toHaveBeenCalled();
  });

  it('reads only the selected active snapshot for authenticated staff', async () => {
    vi.mocked(verifyStaffSession).mockReturnValue({ terminalId: 'GP1', staffName: 'Staff' } as any);
    const expectedRow = { id: 7, catalog_key: 'E_TRACTION_TYRES', snapshot_id: 'active', stock_units: 100, cost_price: 123 };
    let calls = 0;
    const itemQuery: any = {
      select: () => itemQuery, eq: () => itemQuery, gt: () => itemQuery,
      order: () => itemQuery, limit: async () => ({ data: calls++ ? [] : [expectedRow], error: null })
    };
    const sourceQuery: any = {
      select: () => sourceQuery, eq: () => sourceQuery,
      maybeSingle: async () => ({ data: { active_snapshot_id: 'active' }, error: null })
    };
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      from: (table: string) => table === 'supplier_catalog_sources' ? sourceQuery : itemQuery
    } as any);
    const res = response();
    await handler({ method: 'GET', url: '/api/supplier-sync?resource=private-catalog&catalog=E_TRACTION_TYRES' }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ rows: [expectedRow] });
  });
});

