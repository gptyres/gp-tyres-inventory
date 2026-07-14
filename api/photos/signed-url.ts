import { readApiBody } from '../../server/readApiBody.js';
import {
  loadAuthorizedPhotos,
  recordPhotoActivity,
  requireStaffSession,
  resolvePhotoUrl,
  sanitizePhotoIds
} from '../../server/photoLibrary.js';

export default async function handler(request: any, response: any) {
  response.setHeader('Cache-Control', 'no-store');
  const session = requireStaffSession(request, response);
  if (!session) return;
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Unsupported method.' });
  }

  try {
    const body = await readApiBody(request);
    const [photoId] = sanitizePhotoIds([body.photoId], 1);
    if (!photoId) return response.status(400).json({ error: 'A valid photo ID is required.' });
    const [photo] = await loadAuthorizedPhotos([photoId]);
    if (!photo) return response.status(404).json({ error: 'Photo not found.' });
    const url = await resolvePhotoUrl(photo, 600);
    if (body.purpose === 'preview') {
      void recordPhotoActivity(session.terminalId, 'photo_viewed', photoId);
    }
    return response.status(200).json({ url, expiresIn: photo.public_image_url ? null : 600 });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Photo URL could not be created.'
    });
  }
}

