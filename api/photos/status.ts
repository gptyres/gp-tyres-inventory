import { verifyAdminSession } from '../../server/adminSession.js';
import { createSupabaseAdmin } from '../../server/supabaseAdmin.js';
import { GP_ORGANIZATION_ID } from '../../server/staffSession.js';
import { readApiBody } from '../../server/readApiBody.js';
import { recordPhotoActivity, requireStaffSession, sanitizePhotoIds } from '../../server/photoLibrary.js';

const STATUS_RULES: Record<string, { ready: boolean; verified: boolean }> = {
  raw: { ready: false, verified: false },
  review_required: { ready: false, verified: false },
  approved: { ready: false, verified: true },
  customer_ready: { ready: true, verified: true },
  rejected: { ready: false, verified: false },
  duplicate: { ready: false, verified: false },
  archived: { ready: false, verified: false }
};

export default async function handler(request: any, response: any) {
  response.setHeader('Cache-Control', 'no-store');
  const staffSession = requireStaffSession(request, response);
  if (!staffSession) return;
  if (request.method !== 'PATCH') {
    response.setHeader('Allow', 'PATCH');
    return response.status(405).json({ error: 'Unsupported method.' });
  }

  const adminSession = verifyAdminSession(request);
  if (!adminSession) return response.status(403).json({ error: 'Admin mode is required for photo review changes.' });

  try {
    const body = await readApiBody(request);
    const photoIds = sanitizePhotoIds(body.photoIds, 100);
    const status = typeof body.status === 'string' ? body.status : '';
    const statusRule = STATUS_RULES[status];
    if (!statusRule || photoIds.length === 0) return response.status(400).json({ error: 'Invalid photo status request.' });

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('photos')
      .update({
        status,
        is_customer_ready: statusRule.ready,
        is_verified: statusRule.verified,
        updated_at: new Date().toISOString()
      })
      .eq('organization_id', GP_ORGANIZATION_ID)
      .in('id', photoIds)
      .select('id');
    if (error) throw new Error(error.message);

    const action = status === 'customer_ready'
      ? 'photo_marked_customer_ready'
      : status === 'rejected'
        ? 'photo_rejected'
        : 'photo_status_changed';
    await Promise.all((data || []).map((photo: any) => recordPhotoActivity(
      adminSession.staffName,
      action,
      photo.id,
      { status, terminalId: staffSession.terminalId }
    )));
    return response.status(200).json({ ok: true, updated: data?.length || 0 });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Photo status could not be updated.'
    });
  }
}

