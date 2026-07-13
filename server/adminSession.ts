import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_SESSION_COOKIE = 'gp_admin_session';
const SESSION_MAX_AGE_SECONDS = 4 * 60 * 60;
const ALLOWED_ADMINS = new Set(['Noor', 'Mac', 'Rafiek']);

interface AdminSessionPayload {
  staffName: string;
  issuedAt: number;
  expiresAt: number;
}

interface ApiRequestLike {
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

const getSessionSecret = () => {
  const secret = process.env.GP_ADMIN_SESSION_SECRET || '';
  if (secret.length < 32) {
    throw new Error('GP_ADMIN_SESSION_SECRET must be configured with at least 32 characters.');
  }
  return secret;
};
const safeEqualText = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const signPayload = (encodedPayload: string) => (
  createHmac('sha256', getSessionSecret()).update(encodedPayload).digest('base64url')
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

export const isAllowedAdmin = (staffName: string) => ALLOWED_ADMINS.has(staffName);

export const verifyAdminPassword = (password: string) => {
  const expectedHash = (process.env.GP_ADMIN_PASSWORD_SHA256 || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
    throw new Error('GP_ADMIN_PASSWORD_SHA256 is not configured.');
  }

  const suppliedHash = createHash('sha256').update(password, 'utf8').digest('hex');
  return safeEqualText(suppliedHash, expectedHash);
};

export const createAdminSessionCookie = (staffName: string) => {
  if (!isAllowedAdmin(staffName)) throw new Error('This staff member is not authorized for admin mode.');

  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    staffName,
    issuedAt,
    expiresAt: issuedAt + SESSION_MAX_AGE_SECONDS
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const token = encodedPayload + '.' + signPayload(encodedPayload);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return ADMIN_SESSION_COOKIE + '=' + encodeURIComponent(token)
    + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + SESSION_MAX_AGE_SECONDS + secure;
};

export const clearAdminSessionCookie = () => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return ADMIN_SESSION_COOKIE + '=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' + secure;
};

export const verifyAdminSession = (request: ApiRequestLike): AdminSessionPayload | null => {
  const token = readCookieValue(request, ADMIN_SESSION_COOKIE);
  const [encodedPayload, suppliedSignature] = token.split('.');
  if (!encodedPayload || !suppliedSignature) return null;

  const expectedSignature = signPayload(encodedPayload);
  if (!safeEqualText(suppliedSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as AdminSessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!isAllowedAdmin(payload.staffName) || payload.expiresAt <= now || payload.issuedAt > now + 60) return null;
    return payload;
  } catch {
    return null;
  }
};

export const getClientIpHash = (request: ApiRequestLike) => {
  const forwarded = request.headers?.['x-forwarded-for'];
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = forwardedValue?.split(',')[0]?.trim() || request.socket?.remoteAddress || 'unknown';
  return createHmac('sha256', getSessionSecret()).update(ip).digest('hex');
};
