import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStaffSessionCookie, verifyStaffSession } from './staffSession';

const TEST_SECRET = 'test-staff-session-secret-with-more-than-thirty-two-characters';

describe('server staff session deployment binding', () => {
  beforeEach(() => {
    process.env.GP_STAFF_SESSION_SECRET = TEST_SECRET;
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_test_release_a';
  });

  afterEach(() => {
    delete process.env.GP_STAFF_SESSION_SECRET;
    delete process.env.VERCEL_DEPLOYMENT_ID;
  });

  it('accepts a staff cookie only for the deployment that issued it', () => {
    const setCookie = createStaffSessionCookie('GP1');
    const cookiePair = setCookie.split(';')[0];
    expect(verifyStaffSession({ headers: { cookie: cookiePair } })?.terminalId).toBe('GP1');

    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_test_release_b';
    expect(verifyStaffSession({ headers: { cookie: cookiePair } })).toBeNull();
  });
});
