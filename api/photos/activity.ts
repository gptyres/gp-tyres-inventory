import { readApiBody } from '../../server/readApiBody.js';
import { recordPhotoActivity, requireStaffSession, sanitizePhotoIds } from '../../server/photoLibrary.js';

const ALLOWED_ACTIONS = new Set(['photo_copied', 'photo_downloaded', 'photo_shared']);

export default async function handler(request: any, response: any) {
  response.setHeader('Cache-Control', 'no-store');
  const session = requireStaffSession(request, response);
  if (!session) return;
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Unsupported method.' });
  }

  const body = await readApiBody(request);
  const action = typeof body.action === 'string' ? body.action : '';
  const photoIds = sanitizePhotoIds(body.photoIds, 30);
  if (!ALLOWED_ACTIONS.has(action) || photoIds.length === 0) {
    return response.status(400).json({ error: 'Invalid photo activity.' });
  }

  await Promise.all(photoIds.map((photoId) => recordPhotoActivity(session.terminalId, action, photoId)));
  return response.status(200).json({ ok: true });
}

