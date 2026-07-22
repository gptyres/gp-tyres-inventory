import { createSupabaseAdmin } from '../../server/supabaseAdmin.js';
import { GP_ORGANIZATION_ID } from '../../server/staffSession.js';
import { requireStaffSession } from '../../server/photoLibrary.js';
import { readApiBody } from '../../server/readApiBody.js';
import { WORKSHOP_TECHNICIANS, getWorkshopAgents } from '../../server/workshopRoster.js';

const PRIORITIES = new Set(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const TECHNICIANS = new Set(WORKSHOP_TECHNICIANS);
const PAID_BY_OPTIONS = new Set(['Cash', 'Card', 'EFT', 'Account', 'Other']);
const BREAK_TYPES = new Set(['TEA_1', 'TEA_2', 'LUNCH', 'TYRE_COLLECTION', 'MISC_TASK', 'ABSENT']);
const cleanText = (value: unknown, max = 240) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
const cleanTechnicians = (value: unknown, legacyValue?: unknown) => {
  const values = Array.isArray(value) ? value : value === undefined ? [legacyValue] : [];
  return [...new Set(values.map((item) => cleanText(item, 80)).filter(Boolean))];
};
const cleanNote = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 2000) : '';
const cleanDate = (value: unknown) => {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};
const cleanDateOnly = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
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
      const [{ data, error }, agents, { data: breaks, error: breaksError }] = await Promise.all([
        supabase
          .from('workshop_jobs')
          .select('*')
          .eq('organization_id', GP_ORGANIZATION_ID)
          .order('scheduled_for', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(1000),
        getWorkshopAgents(supabase),
        supabase.from('workshop_technician_breaks').select('id, technician, break_type, started_at, ended_at').eq('organization_id', GP_ORGANIZATION_ID).order('started_at', { ascending: false }).limit(100)
      ]);
      if (error) throw new Error(error.message);
      if (breaksError) throw new Error(breaksError.message);
      const jobs = data || [];
      const now = Date.now();
      const todayKey = new Date(now + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return response.status(200).json({
        jobs,
        agents,
        breaks: breaks || [],
        summary: {
          active: jobs.filter((job: any) => !['COLLECTED', 'CANCELLED'].includes(job.status)).length,
          today: jobs.filter((job: any) => job.job_date === todayKey).length,
          ready: jobs.filter((job: any) => job.status === 'READY').length,
          overdue: 0
        }
      });
    }

    const body = await readApiBody(request);
    if (request.method === 'POST' && body.action === 'START_BREAK') {
      const technician = cleanText(body.technician, 80);
      const breakType = cleanText(body.break_type, 16);
      if (!TECHNICIANS.has(technician)) return response.status(400).json({ error: 'Select a technician from the approved workshop team.' });
      if (!BREAK_TYPES.has(breakType)) return response.status(400).json({ error: 'Select Tea 1, Tea 2, Lunch, Tyre collection, Misc task or Absent.' });
      const { data, error } = await supabase.from('workshop_technician_breaks').insert({
        organization_id: GP_ORGANIZATION_ID, technician, break_type: breakType, created_by: session.terminalId
      }).select('id, technician, break_type, started_at, ended_at').single();
      if (error?.code === '23505') return response.status(409).json({ error: `${technician} is already on a break.` });
      if (error) throw new Error(error.message);
      return response.status(201).json({ break: data });
    }
    if (request.method === 'PATCH' && body.action === 'END_BREAK') {
      const id = cleanText(body.id, 64);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return response.status(400).json({ error: 'Invalid technician break.' });
      const { data, error } = await supabase.from('workshop_technician_breaks').update({ ended_at: new Date().toISOString() })
        .eq('organization_id', GP_ORGANIZATION_ID).eq('id', id).is('ended_at', null).select('id, technician, break_type, started_at, ended_at').single();
      if (error) throw new Error(error.message);
      return response.status(200).json({ break: data });
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'GET, POST, PATCH');
      return response.status(405).json({ error: 'Unsupported method.' });
    }

    const customerName = cleanText(body.customer_name, 120);
    const vehicleDetails = cleanText(body.vehicle_details, 180);
    const serviceType = cleanText(body.service_type, 120);
    const priority = cleanText(body.priority, 16) || 'NORMAL';
    const technicians = cleanTechnicians(body.technicians, body.technician);
    const agent = cleanText(body.agent, 80);
    const paidBy = cleanText(body.paid_by, 40);
    const jobDate = body.job_date === undefined || body.job_date === '' ? new Date().toISOString().slice(0, 10) : cleanDateOnly(body.job_date);
    const estimatedMinutes = Number(body.estimated_minutes);
    const tyreQuantity = body.tyre_quantity === undefined ? 0 : Number(body.tyre_quantity);
    const wheelFitment = body.wheel_fitment === true;
    if (body.start_in_progress !== undefined && typeof body.start_in_progress !== 'boolean') {
      return response.status(400).json({ error: 'Start-in-progress must be true or false.' });
    }
    const startInProgress = body.start_in_progress === true;
    const initialStatus = startInProgress ? 'IN_PROGRESS' : 'CHECK_IN';
    if (!customerName || !vehicleDetails || !serviceType || !PRIORITIES.has(priority)) {
      return response.status(400).json({ error: 'Customer, vehicle and service are required.' });
    }
    if (body.estimated_minutes !== undefined && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 5 || estimatedMinutes > 1440)) {
      return response.status(400).json({ error: 'Estimated time must be between 5 and 1440 minutes.' });
    }
    if (!Number.isInteger(tyreQuantity) || tyreQuantity < 0 || tyreQuantity > 12) {
      return response.status(400).json({ error: 'Tyre quantity must be between 0 and 12.' });
    }
    if (technicians.some((technician) => !TECHNICIANS.has(technician))) {
      return response.status(400).json({ error: 'Select a technician from the approved workshop team.' });
    }
    if (paidBy && !PAID_BY_OPTIONS.has(paidBy)) return response.status(400).json({ error: 'Select a valid payment method.' });
    if (!jobDate) return response.status(400).json({ error: 'Enter a valid job date.' });
    const agents = await getWorkshopAgents(supabase);
    if (!agent || !agents.includes(agent)) return response.status(400).json({ error: 'Select an agent from the current staff roster.' });

    const payload = {
      organization_id: GP_ORGANIZATION_ID,
      job_number: buildJobNumber(),
      customer_name: customerName,
      customer_phone: cleanText(body.customer_phone, 48) || null,
      vehicle_details: vehicleDetails,
      registration: cleanText(body.registration, 24).toUpperCase() || null,
      service_type: serviceType,
      tyre_quantity: tyreQuantity,
      wheel_fitment: wheelFitment,
      status: initialStatus,
      priority,
      technician: technicians[0] || null,
      technicians,
      agent,
      job_date: jobDate,
      ticket_number: cleanText(body.ticket_number, 64) || null,
      paid_by: paidBy || null,
      scheduled_for: cleanDate(body.scheduled_for),
      estimated_minutes: Number.isInteger(estimatedMinutes) ? estimatedMinutes : null,
      notes: cleanNote(body.notes) || null,
      started_at: startInProgress ? new Date().toISOString() : null,
      created_by: session.terminalId
    };
    const { data: job, error } = await supabase.from('workshop_jobs').insert(payload).select('*').single();
    if (error) throw new Error(error.message);
    const { error: eventError } = await supabase.from('workshop_job_events').insert({
      organization_id: GP_ORGANIZATION_ID,
      job_id: job.id,
      event_type: 'JOB_CREATED',
      to_status: initialStatus,
      note: `Created by ${session.terminalId}${startInProgress ? ' and started in progress' : ''}`,
      created_by: session.terminalId
    });
    if (eventError) throw new Error(eventError.message);
    return response.status(201).json({ job });
  } catch (error) {
    return response.status(500).json({ error: error instanceof Error ? error.message : 'Workshop data could not be saved.' });
  }
}
