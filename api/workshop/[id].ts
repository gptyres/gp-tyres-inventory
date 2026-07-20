import { verifyAdminSession } from '../../server/adminSession.js';
import { createSupabaseAdmin } from '../../server/supabaseAdmin.js';
import { GP_ORGANIZATION_ID } from '../../server/staffSession.js';
import { requireStaffSession } from '../../server/photoLibrary.js';
import { readApiBody } from '../../server/readApiBody.js';

const STATUSES = new Set(['BOOKED', 'CHECK_IN', 'IN_PROGRESS', 'QUALITY_CHECK', 'READY', 'COLLECTED', 'CANCELLED']);
const PRIORITIES = new Set(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const cleanText = (value: unknown, max = 240) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
const cleanNote = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 2000) : '';
const cleanDate = (value: unknown) => {
  if (value === null || value === '') return null;
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
};

export default async function handler(request: any, response: any) {
  response.setHeader('Cache-Control', 'no-store');
  const session = requireStaffSession(request, response);
  if (!session) return;
  const id = cleanText(request.query?.id, 64);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return response.status(400).json({ error: 'Invalid workshop job.' });

  try {
    const supabase = createSupabaseAdmin();
    if (request.method === 'DELETE') {
      if (!verifyAdminSession(request)) return response.status(403).json({ error: 'Admin mode is required to delete a workshop job.' });
      const { error } = await supabase.from('workshop_jobs').delete().eq('organization_id', GP_ORGANIZATION_ID).eq('id', id);
      if (error) throw new Error(error.message);
      return response.status(200).json({ ok: true });
    }
    if (request.method !== 'PATCH') {
      response.setHeader('Allow', 'PATCH, DELETE');
      return response.status(405).json({ error: 'Unsupported method.' });
    }

    const body = await readApiBody(request);
    const { data: existing, error: existingError } = await supabase
      .from('workshop_jobs').select('*').eq('organization_id', GP_ORGANIZATION_ID).eq('id', id).single();
    if (existingError || !existing) return response.status(404).json({ error: 'Workshop job not found.' });

    const update: Record<string, unknown> = {};
    const textFields: Array<[string, number]> = [['customer_name', 120], ['customer_phone', 48], ['vehicle_details', 180], ['registration', 24], ['service_type', 120], ['technician', 80]];
    textFields.forEach(([field, max]) => {
      if (Object.prototype.hasOwnProperty.call(body, field)) update[field] = cleanText(body[field], max) || null;
    });
    if (typeof update.registration === 'string') update.registration = update.registration.toUpperCase();
    if (Object.prototype.hasOwnProperty.call(body, 'notes')) update.notes = cleanNote(body.notes) || null;
    if (Object.prototype.hasOwnProperty.call(body, 'scheduled_for')) {
      const date = cleanDate(body.scheduled_for);
      if (date === undefined) return response.status(400).json({ error: 'Invalid scheduled time.' });
      update.scheduled_for = date;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'estimated_minutes')) {
      const minutes = Number(body.estimated_minutes);
      if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) return response.status(400).json({ error: 'Estimated time must be between 5 and 1440 minutes.' });
      update.estimated_minutes = minutes;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'priority')) {
      const priority = cleanText(body.priority, 16);
      if (!PRIORITIES.has(priority)) return response.status(400).json({ error: 'Invalid priority.' });
      update.priority = priority;
    }
    const nextStatus = Object.prototype.hasOwnProperty.call(body, 'status') ? cleanText(body.status, 24) : '';
    if (nextStatus) {
      if (!STATUSES.has(nextStatus)) return response.status(400).json({ error: 'Invalid job status.' });
      update.status = nextStatus;
      if (nextStatus === 'COLLECTED') update.completed_at = new Date().toISOString();
      if (nextStatus !== 'COLLECTED' && existing.status === 'COLLECTED') update.completed_at = null;
    }
    if (Object.keys(update).length === 0) return response.status(400).json({ error: 'No supported workshop changes supplied.' });
    if (!update.customer_name || !update.vehicle_details || !update.service_type) {
      if ((update.customer_name === null) || (update.vehicle_details === null) || (update.service_type === null)) return response.status(400).json({ error: 'Customer, vehicle and service cannot be empty.' });
    }

    const { data: job, error } = await supabase.from('workshop_jobs').update(update).eq('organization_id', GP_ORGANIZATION_ID).eq('id', id).select('*').single();
    if (error) throw new Error(error.message);
    const statusChanged = Boolean(nextStatus && nextStatus !== existing.status);
    const { error: eventError } = await supabase.from('workshop_job_events').insert({
      organization_id: GP_ORGANIZATION_ID,
      job_id: id,
      event_type: statusChanged ? (nextStatus === 'CANCELLED' ? 'JOB_CANCELLED' : 'STATUS_CHANGED') : 'JOB_UPDATED',
      from_status: statusChanged ? existing.status : null,
      to_status: statusChanged ? nextStatus : null,
      note: statusChanged ? `Moved to ${nextStatus.replace('_', ' ')}` : null,
      created_by: session.terminalId
    });
    if (eventError) throw new Error(eventError.message);
    return response.status(200).json({ job });
  } catch (error) {
    return response.status(500).json({ error: error instanceof Error ? error.message : 'Workshop job could not be updated.' });
  }
}
