import {
  clearStaffSessionCookie,
  createStaffSessionCookie,
  verifyStaffCredentials,
  verifyStaffSession
} from '../server/staffSession.js';
import { readApiBody } from '../server/readApiBody.js';

export default async function handler(request: any, response: any) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method === 'GET') {
    const session = verifyStaffSession(request);
    return response.status(200).json({
      authenticated: Boolean(session),
      terminalId: session?.terminalId || null
    });
  }

  if (request.method === 'DELETE') {
    response.setHeader('Set-Cookie', clearStaffSessionCookie());
    return response.status(200).json({ ok: true });
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST, DELETE');
    return response.status(405).json({ error: 'Unsupported method.' });
  }

  try {
    const body = await readApiBody(request);
    const terminalId = typeof body.terminalId === 'string' ? body.terminalId.toUpperCase().trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!terminalId || !verifyStaffCredentials(terminalId, password)) {
      return response.status(401).json({ error: 'Invalid Terminal ID or Access Code.' });
    }

    response.setHeader('Set-Cookie', createStaffSessionCookie(terminalId));
    return response.status(200).json({ ok: true, terminalId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Staff session could not be created.';
    return response.status(503).json({ error: message });
  }
}

