import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../api/business-agent';
import { verifyStaffSession } from './staffSession';

vi.mock('./staffSession', () => ({ verifyStaffSession: vi.fn() }));

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

const response = () => {
  const result: any = { setHeader: vi.fn() };
  result.status = vi.fn(() => result);
  result.json = vi.fn(() => result);
  return result;
};

describe('business agent authentication', () => {
  it('rejects unauthenticated callers before requesting a provider', async () => {
    vi.mocked(verifyStaffSession).mockReturnValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = response();
    await handler({ method: 'POST', body: { messages: [{ role: 'user', content: 'Hello' }] }, query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports missing OpenAI configuration to authenticated staff without a provider call', async () => {
    vi.mocked(verifyStaffSession).mockReturnValue({ terminalId: 'agent-test', staffName: 'Test' } as any);
    vi.stubEnv('OPENAI_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = response();
    await handler({ method: 'POST', body: { messages: [{ role: 'user', content: 'Hello' }] }, query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
