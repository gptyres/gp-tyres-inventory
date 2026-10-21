import { afterEach, describe, expect, it, vi } from 'vitest';
import staffSessionHandler from '../api/staff-session';
import supplierSyncHandler from '../api/supplier-sync';
import { createStaffSessionCookie } from './staffSession';

const responseFixture = () => ({
  statusCode: 200,
  headers: {} as Record<string, string>,
  body: undefined as unknown,
  setHeader(name: string, value: string) { this.headers[name] = value; },
  status(code: number) { this.statusCode = code; return this; },
  json(body: unknown) { this.body = body; return this; }
});

// Older Vercel runtimes lazily parse this property with deprecated url.parse().
// A throw makes any accidental reintroduction fail at the call site.
const requestFixture = (url: string, method = 'GET', body?: unknown) => ({
  url,
  method,
  headers: {},
  body,
  get query(): never { throw new Error('The legacy runtime query getter was evaluated.'); }
});

describe('API request parsing without the legacy runtime query getter', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('preserves decoded values, repeated keys, and empty values', async () => {
    const { readApiQuery } = await import('./readApiQuery');
    const query = readApiQuery(requestFixture(
      '/api/staff-session?resource=inventory-history&resource=stock-movement&search=tyre+%2B+wheel&empty=&bare'
    ));
    expect(query).toEqual({
      resource: ['inventory-history', 'stock-movement'],
      search: 'tyre + wheel',
      empty: '',
      bare: ''
    });
  });

  it('keeps prototype-shaped keys as query data without polluting the result', async () => {
    const { readApiQuery } = await import('./readApiQuery');
    const query = readApiQuery(requestFixture('/api/staff-session?__proto__=data&constructor=value'));
    expect(query.__proto__).toBe('data');
    expect(query.constructor).toBe('value');
    expect(Object.getPrototypeOf(query)).toBeNull();
    expect(query.resource).toBeUndefined();
  });

  it('handles a missing request URL as an empty query', async () => {
    const { readApiQuery } = await import('./readApiQuery');
    expect(readApiQuery({})).toEqual({});
  });

  it('returns the unauthenticated staff session without evaluating query', async () => {
    const response = responseFixture();
    await staffSessionHandler(requestFixture('/api/staff-session'), response);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ authenticated: false, terminalId: null });
    expect(response.headers['Cache-Control']).toBe('no-store');
  });

  it('still rejects invalid staff credentials without evaluating query', async () => {
    const response = responseFixture();
    await staffSessionHandler(requestFixture('/api/staff-session', 'POST', {
      terminalId: '', password: ''
    }), response);
    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid Terminal ID or Access Code.' });
  });

  it('dispatches the first repeated resource and retains inventory authentication', async () => {
    const response = responseFixture();
    await staffSessionHandler(requestFixture(
      '/api/staff-session?resource=inventory-history&resource=ignored&productId=wheel%2B1'
    ), response);
    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ error: 'Staff login required.' });
  });

  it('retains supplier status authentication without evaluating query', async () => {
    const response = responseFixture();
    await supplierSyncHandler(requestFixture('/api/supplier-sync?catalog=ATT'), response);
    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ error: 'A secure staff session is required.' });
  });

  it('validates inventory history inputs for an authenticated staff request', async () => {
    vi.stubEnv('GP_STAFF_SESSION_SECRET', 'query-test-session-secret-at-least-thirty-two-characters');
    const request = requestFixture('/api/staff-session?resource=inventory-history');
    request.headers = { cookie: createStaffSessionCookie('GP1').split(';')[0] };
    const response = responseFixture();
    await staffSessionHandler(request, response);
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'Product id is required.' });
  });

  it('validates stock movement date pairs for an authenticated staff request', async () => {
    vi.stubEnv('GP_STAFF_SESSION_SECRET', 'query-test-session-secret-at-least-thirty-two-characters');
    const request = requestFixture('/api/staff-session?resource=stock-movement&from=2026-10-01');
    request.headers = { cookie: createStaffSessionCookie('GP1').split(';')[0] };
    const response = responseFixture();
    await staffSessionHandler(request, response);
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'Both stock movement dates are required.' });
  });
});
