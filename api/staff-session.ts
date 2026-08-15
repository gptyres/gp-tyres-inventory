import {
  clearStaffSessionCookie,
  createStaffSessionCookie,
  verifyStaffCredentials,
  verifyStaffSession
} from '../server/staffSession.js';
import { readApiBody } from '../server/readApiBody.js';
import { getSessionReleaseId } from '../server/deploymentVersion.js';
import {
  handleInventoryHistory,
  handleInventoryMutation,
  handleStockMovement
} from '../server/inventoryApi.js';

const one = (value: unknown) => Array.isArray(value) ? value[0] : value;

export default async function handler(request: any, response: any) {
  response.setHeader('Cache-Control', 'no-store');

  const resource = String(one(request.query?.resource) || '').toLowerCase();
  if (resource === 'inventory') return handleInventoryMutation(request, response);
  if (resource === 'inventory-history') return handleInventoryHistory(request, response);
  if (resource === 'stock-movement') return handleStockMovement(request, response);

  if (request.method === 'GET') {
    const session = verifyStaffSession(request);
    return response.status(200).json({
      authenticated: Boolean(session),
      terminalId: session?.terminalId || null,
      releaseId: getSessionReleaseId()
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
    return response.status(200).json({ ok: true, terminalId, releaseId: getSessionReleaseId() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Staff session could not be created.';
    return response.status(503).json({ error: message });
  }
}

