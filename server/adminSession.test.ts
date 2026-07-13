import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionCookie,
  verifyAdminPassword,
  verifyAdminSession
} from './adminSession';

const TEST_PASSWORD = 'test-admin-password';
const TEST_SECRET = 'test-session-secret-with-more-than-thirty-two-characters';

describe('server admin session', () => {
  beforeEach(() => {
    process.env.GP_ADMIN_PASSWORD_SHA256 = createHash('sha256')
      .update(TEST_PASSWORD)
      .digest('hex');
    process.env.GP_ADMIN_SESSION_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.GP_ADMIN_PASSWORD_SHA256;
    delete process.env.GP_ADMIN_SESSION_SECRET;
  });

  it('compares the submitted password with the server-side hash', () => {
    expect(verifyAdminPassword(TEST_PASSWORD)).toBe(true);
    expect(verifyAdminPassword('wrong-password')).toBe(false);
  });

  it('creates and verifies a signed HttpOnly admin cookie', () => {
    const setCookie = createAdminSessionCookie('Noor');
    expect(setCookie).toContain('HttpOnly');
    const cookiePair = setCookie.split(';')[0];
    const session = verifyAdminSession({ headers: { cookie: cookiePair } });
    expect(session?.staffName).toBe('Noor');
  });

  it('rejects a tampered session', () => {
    const setCookie = createAdminSessionCookie('Mac');
    const cookiePair = setCookie.split(';')[0] + 'tampered';
    expect(verifyAdminSession({ headers: { cookie: cookiePair } })).toBeNull();
    expect(cookiePair).toContain(ADMIN_SESSION_COOKIE);
  });
});
