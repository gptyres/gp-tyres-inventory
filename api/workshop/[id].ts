import { verifyAdminSession } from '../../server/adminSession.js';
import { createSupabaseAdmin } from '../../server/supabaseAdmin.js';
import { GP_ORGANIZATION_ID } from '../../server/staffSession.js';
import { requireStaffSession } from '../../server/photoLibrary.js';
import { readApiBody } from '../../server/readApiBody.js';
import { WORKSHOP_TECHNICIANS, getWorkshopAgents } from '../../server/workshopRoster.js';

const STATUSES = new Set(['CHECK_IN', 'IN_PROGRESS', 'READY', 'COLLECTED', 'CANCELLED']);
const PRIORITIES = new Set(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const TECHNICIANS = new Set(WORKSHOP_TECHNICIANS);
const PAID_BY_OPTIONS = new Set(['Cash', 'Card', 'EFT', 'Account', 'Other']);
const STARTED_STATUSES = new Set(['CHECK_IN', 'IN_PROGRESS', 'READY', 'COLLECTED']);
const cleanText = (value: unknown, max = 240) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
const cleanTechnicians = (value: unknown, legacyValue?: unknown) => {
  const values = Array.isArray(value) ? value : value === undefined ? [legacyValue] : [];
  return [...new Set(values.map((item) => cleanText(item, 80)).filter(Boolean))];
};
const cleanNote = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 2000) : '';
const cleanDate = (value: unknown) => {
  if (value === null || value === '') return null;
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
};
const cleanDateOnly = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
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
    const textFields: Array<[string, number]> = [['customer_name', 120], ['customer_phone', 48], ['vehicle_details', 180], ['registration', 24], ['service_type', 120]];
    textFields.forEach(([field, max]) => {
      if (Object.prototype.hasOwnProperty.call(body, field)) update[field] = cleanText(body[field], max) || null;
    });
    if (typeof update.registration === 'string') update.registration = update.registration.toUpperCase();
    const hasAgentUpdate = Object.prototype.hasOwnProperty.call(body, 'agent');
    if (hasAgentUpdate) {
      const agents = await getWorkshopAgents(supabase);
      if (hasAgentUpdate) {
        const agent = cleanText(body.agent, 80);
        if (!agent || !agents.includes(agent)) return response.status(400).json({ error: 'Select an agent from the current staff roster.' });
        update.agent = agent;
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'technicians') || Object.prototype.hasOwnProperty.call(body, 'technician')) {
      const technicians = cleanTechnicians(body.technicians, body.technician);
      if (technicians.some((technician) => !TECHNICIANS.has(technician))) return response.status(400).json({ error: 'Select technicians from the approved workshop team.' });
      update.technicians = technicians;
      update.technician = technicians[0] || null;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'notes')) update.notes = cleanNote(body.notes) || null;
    if (Object.prototype.hasOwnProperty.call(body, 'job_date')) {
      const jobDate = cleanDateOnly(body.job_date);
      if (!jobDate) return response.status(400).json({ error: 'Enter a valid job date.' });
      update.job_date = jobDate;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'ticket_number')) update.ticket_number = cleanText(body.ticket_number, 64) || null;
    if (Object.prototype.hasOwnProperty.call(body, 'paid_by')) {
      const paidBy = cleanText(body.paid_by, 40);
      if (paidBy && !PAID_BY_OPTIONS.has(paidBy)) return response.status(400).json({ error: 'Select a valid payment method.' });
      update.paid_by = paidBy || null;
    }
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
      if (!existing.started_at && STARTED_STATUSES.has(nextStatus)) update.started_at = new Date().toISOString();
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
