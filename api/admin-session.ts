import {
  clearAdminSessionCookie,
  createAdminSessionCookie,
  getClientIpHash,
  isAllowedAdmin,
  verifyAdminPassword,
  verifyAdminSession
} from '../server/adminSession.js';
import { readApiBody } from '../server/readApiBody.js';

const failedAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const getAttemptState = (key: string) => {
  const now = Date.now();
  const current = failedAttempts.get(key);
  if (!current || current.resetAt <= now) {
    const fresh = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    failedAttempts.set(key, fresh);
    return fresh;
  }
  return current;
};

export default async function handler(request: any, response: any) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method === 'GET') {
    try {
      const session = verifyAdminSession(request);
      return response.status(200).json({
        authenticated: Boolean(session),
        staffName: session?.staffName || null
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Admin session is not configured.';
      return response.status(503).json({ authenticated: false, error: message });
    }
  }

  if (request.method === 'DELETE') {
    response.setHeader('Set-Cookie', clearAdminSessionCookie());
    return response.status(200).json({ ok: true });
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST, DELETE');
    return response.status(405).json({ error: 'Unsupported method.' });
  }

  try {
    const ipHash = getClientIpHash(request);
    const attemptState = getAttemptState(ipHash);
    if (attemptState.count >= MAX_ATTEMPTS) {
      return response.status(429).json({ error: 'Too many failed attempts. Try again later.' });
    }

    const body = await readApiBody(request);
    const staffName = typeof body.staffName === 'string' ? body.staffName.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!isAllowedAdmin(staffName) || !verifyAdminPassword(password)) {
      attemptState.count += 1;
      return response.status(401).json({ error: 'Invalid admin credentials.' });
    }

    failedAttempts.delete(ipHash);
    response.setHeader('Set-Cookie', createAdminSessionCookie(staffName));
    return response.status(200).json({ ok: true, staffName });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Admin login failed.';
    return response.status(503).json({ error: message });
  }
}
