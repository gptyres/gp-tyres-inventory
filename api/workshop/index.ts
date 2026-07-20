import { createSupabaseAdmin } from '../../server/supabaseAdmin.js';
import { GP_ORGANIZATION_ID } from '../../server/staffSession.js';
import { requireStaffSession } from '../../server/photoLibrary.js';
import { readApiBody } from '../../server/readApiBody.js';

const STATUSES = new Set(['BOOKED', 'CHECK_IN', 'IN_PROGRESS', 'QUALITY_CHECK', 'READY', 'COLLECTED', 'CANCELLED']);
const PRIORITIES = new Set(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const cleanText = (value: unknown, max = 240) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
const cleanNote = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 2000) : '';
const cleanDate = (value: unknown) => {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

const buildJobNumber = () => {
  const date = new Date();
  const stamp = `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return `WS-${stamp}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
};

export default async function handler(request: any, response: any) {
  response.setHeader('Cache-Control', 'no-store');
  const session = requireStaffSession(request, response);
  if (!session) return;

  try {
    const supabase = createSupabaseAdmin();
    if (request.method === 'GET') {
      const { data, error } = await supabase
        .from('workshop_jobs')
        .select('*')
        .eq('organization_id', GP_ORGANIZATION_ID)
        .neq('status', 'CANCELLED')
        .order('scheduled_for', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);
      const jobs = data || [];
      const now = Date.now();
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(startOfToday);
      endOfToday.setDate(endOfToday.getDate() + 1);
      return response.status(200).json({
        jobs,
        summary: {
          active: jobs.filter((job: any) => !['COLLECTED', 'CANCELLED'].includes(job.status)).length,
          today: jobs.filter((job: any) => job.scheduled_for && new Date(job.scheduled_for) >= startOfToday && new Date(job.scheduled_for) < endOfToday).length,
          ready: jobs.filter((job: any) => job.status === 'READY').length,
          overdue: jobs.filter((job: any) => job.scheduled_for && new Date(job.scheduled_for).getTime() < now && !['READY', 'COLLECTED', 'CANCELLED'].includes(job.status)).length
        }
      });
    }

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'GET, POST');
      return response.status(405).json({ error: 'Unsupported method.' });
    }

    const body = await readApiBody(request);
    const customerName = cleanText(body.customer_name, 120);
    const vehicleDetails = cleanText(body.vehicle_details, 180);
    const serviceType = cleanText(body.service_type, 120);
    const priority = cleanText(body.priority, 16) || 'NORMAL';
    const estimatedMinutes = Number(body.estimated_minutes);
    if (!customerName || !vehicleDetails || !serviceType || !PRIORITIES.has(priority)) {
      return response.status(400).json({ error: 'Customer, vehicle, service and priority are required.' });
    }
    if (body.estimated_minutes !== undefined && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 5 || estimatedMinutes > 1440)) {
      return response.status(400).json({ error: 'Estimated time must be between 5 and 1440 minutes.' });
    }

    const payload = {
      organization_id: GP_ORGANIZATION_ID,
      job_number: buildJobNumber(),
      customer_name: customerName,
      customer_phone: cleanText(body.customer_phone, 48) || null,
      vehicle_details: vehicleDetails,
      registration: cleanText(body.registration, 24).toUpperCase() || null,
      service_type: serviceType,
      status: 'BOOKED',
      priority,
      technician: cleanText(body.technician, 80) || null,
      scheduled_for: cleanDate(body.scheduled_for),
      estimated_minutes: Number.isInteger(estimatedMinutes) ? estimatedMinutes : null,
      notes: cleanNote(body.notes) || null,
      created_by: session.terminalId
    };
    const { data: job, error } = await supabase.from('workshop_jobs').insert(payload).select('*').single();
    if (error) throw new Error(error.message);
    const { error: eventError } = await supabase.from('workshop_job_events').insert({
      organization_id: GP_ORGANIZATION_ID,
      job_id: job.id,
      event_type: 'JOB_CREATED',
      to_status: 'BOOKED',
      note: `Created by ${session.terminalId}`,
      created_by: session.terminalId
    });
    if (eventError) throw new Error(eventError.message);
    return response.status(201).json({ job });
  } catch (error) {
    return response.status(500).json({ error: error instanceof Error ? error.message : 'Workshop data could not be saved.' });
  }
}
