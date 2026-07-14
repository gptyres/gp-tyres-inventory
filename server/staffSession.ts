import { createHmac, timingSafeEqual } from 'node:crypto';
import { USER_CREDENTIALS } from '../config.js';

export const STAFF_SESSION_COOKIE = 'gp_staff_session';
export const GP_ORGANIZATION_ID = '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6';
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export interface StaffSessionPayload {
  terminalId: string;
  organizationId: string;
  issuedAt: number;
  expiresAt: number;
}

interface ApiRequestLike {
  headers?: Record<string, string | string[] | undefined>;
}

const getSessionSecret = () => {
  const secret = process.env.GP_STAFF_SESSION_SECRET || process.env.GP_ADMIN_SESSION_SECRET || '';
  if (secret.length < 32) {
    throw new Error('GP_STAFF_SESSION_SECRET or GP_ADMIN_SESSION_SECRET must be configured.');
  }
  return secret;
};

const safeEqualText = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const signPayload = (payload: string) => (
  createHmac('sha256', getSessionSecret()).update(payload).digest('base64url')
);

const readCookieValue = (request: ApiRequestLike, name: string) => {
  const rawCookie = request.headers?.cookie;
  const cookieHeader = Array.isArray(rawCookie) ? rawCookie.join(';') : rawCookie || '';
  for (const pair of cookieHeader.split(';')) {
    const [key, ...valueParts] = pair.trim().split('=');
    if (key === name) return decodeURIComponent(valueParts.join('='));
  }
  return '';
};

const staffCredentials = () => {
  const configured = process.env.GP_STAFF_CREDENTIALS_JSON;
  if (!configured) return USER_CREDENTIALS;

  try {
    const parsed = JSON.parse(configured) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([terminal, password]) => [terminal.toUpperCase().trim(), password])
    );
  } catch {
    throw new Error('GP_STAFF_CREDENTIALS_JSON is invalid.');
  }
};

export const verifyStaffCredentials = (terminalId: string, password: string) => {
  const expected = staffCredentials()[terminalId.toUpperCase().trim()];
  return Boolean(expected && safeEqualText(password, expected));
};

export const createStaffSessionCookie = (terminalId: string) => {
  const normalizedTerminal = terminalId.toUpperCase().trim();
  if (!staffCredentials()[normalizedTerminal]) throw new Error('Unknown staff terminal.');

  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: StaffSessionPayload = {
    terminalId: normalizedTerminal,
    organizationId: GP_ORGANIZATION_ID,
    issuedAt,
    expiresAt: issuedAt + SESSION_MAX_AGE_SECONDS
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const token = `${encodedPayload}.${signPayload(encodedPayload)}`;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${STAFF_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
};

export const clearStaffSessionCookie = () => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${STAFF_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
};

export const verifyStaffSession = (request: ApiRequestLike): StaffSessionPayload | null => {
  const token = readCookieValue(request, STAFF_SESSION_COOKIE);
  const [encodedPayload, suppliedSignature] = token.split('.');
  if (!encodedPayload || !suppliedSignature) return null;

  const expectedSignature = signPayload(encodedPayload);
  if (!safeEqualText(suppliedSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as StaffSessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (
      payload.organizationId !== GP_ORGANIZATION_ID
      || !staffCredentials()[payload.terminalId]
      || payload.expiresAt <= now
      || payload.issuedAt > now + 60
    ) return null;
    return payload;
  } catch {
    return null;
  }
};

