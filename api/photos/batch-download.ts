import { readApiBody } from '../../server/readApiBody.js';
import {
  buildCustomerPhotoFilename,
  loadAuthorizedPhotos,
  recordPhotoActivity,
  requireStaffSession,
  resolvePhotoUrl,
  sanitizePhotoIds
} from '../../server/photoLibrary.js';

const MAX_FILES = 30;
const MAX_SOURCE_BYTES = 150 * 1024 * 1024;

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
    const requestedIds = sanitizePhotoIds(body.photoIds, MAX_FILES + 1);
    if (requestedIds.length === 0) return response.status(400).json({ error: 'Select at least one photo.' });
    if (requestedIds.length > MAX_FILES) return response.status(413).json({ error: `Select ${MAX_FILES} photos or fewer.` });

    const photos = await loadAuthorizedPhotos(requestedIds);
    if (photos.length !== requestedIds.length) {
      return response.status(409).json({ error: 'Some selected photos are no longer available. Refresh and try again.' });
    }
    const totalSourceSize = photos.reduce((sum: number, photo: any) => sum + Number(photo.file_size || 0), 0);
    if (totalSourceSize > MAX_SOURCE_BYTES) {
      return response.status(413).json({ error: 'The selected photos are too large for one download.' });
    }

    const byId = new Map(photos.map((photo: any) => [photo.id, photo]));
    const ordered = requestedIds.map((id) => byId.get(id)).filter(Boolean);
    const files = await Promise.all(ordered.map(async (photo: any, index) => ({
      id: photo.id,
      url: await resolvePhotoUrl(photo, 900),
      filename: buildCustomerPhotoFilename(photo, ordered.length > 1 ? index : undefined),
      mimeType: photo.mime_type || 'image/jpeg',
      size: Number(photo.file_size || 0)
    })));

    void recordPhotoActivity(
      session.terminalId,
      'batch_download_created',
      null,
      { photoIds: requestedIds, count: requestedIds.length }
    );
    return response.status(200).json({ files, maximumFiles: MAX_FILES, maximumBytes: MAX_SOURCE_BYTES });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Download could not be prepared.'
    });
  }
}

