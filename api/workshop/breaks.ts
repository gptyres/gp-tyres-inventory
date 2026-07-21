import { createSupabaseAdmin } from '../../server/supabaseAdmin.js';
import { GP_ORGANIZATION_ID } from '../../server/staffSession.js';
import { requireStaffSession } from '../../server/photoLibrary.js';
import { readApiBody } from '../../server/readApiBody.js';
import { WORKSHOP_TECHNICIANS } from '../../server/workshopRoster.js';

const TECHNICIANS = new Set(WORKSHOP_TECHNICIANS);
const BREAK_TYPES = new Set(['TEA_1', 'TEA_2', 'LUNCH']);
const cleanText = (value: unknown, max = 80) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';

export default async function handler(request: any, response: any) {
  response.setHeader('Cache-Control', 'no-store');
  const session = requireStaffSession(request, response);
  if (!session) return;

  try {
    const supabase = createSupabaseAdmin();
    const body = await readApiBody(request);
    if (request.method === 'POST') {
      const technician = cleanText(body.technician);
      const breakType = cleanText(body.break_type, 16);
      if (!TECHNICIANS.has(technician)) return response.status(400).json({ error: 'Select a technician from the approved workshop team.' });
      if (!BREAK_TYPES.has(breakType)) return response.status(400).json({ error: 'Select Tea 1, Tea 2 or Lunch.' });
      const { data, error } = await supabase.from('workshop_technician_breaks').insert({
        organization_id: GP_ORGANIZATION_ID, technician, break_type: breakType, created_by: session.terminalId
      }).select('id, technician, break_type, started_at, ended_at').single();
      if (error?.code === '23505') return response.status(409).json({ error: `${technician} is already on a break.` });
      if (error) throw new Error(error.message);
      return response.status(201).json({ break: data });
    }
    if (request.method === 'PATCH') {
      const id = cleanText(body.id, 64);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return response.status(400).json({ error: 'Invalid technician break.' });
      const { data, error } = await supabase.from('workshop_technician_breaks')
        .update({ ended_at: new Date().toISOString() })
        .eq('organization_id', GP_ORGANIZATION_ID).eq('id', id).is('ended_at', null)
        .select('id, technician, break_type, started_at, ended_at').single();
      if (error) throw new Error(error.message);
      return response.status(200).json({ break: data });
    }
    response.setHeader('Allow', 'POST, PATCH');
    return response.status(405).json({ error: 'Unsupported method.' });
  } catch (error) {
    return response.status(500).json({ error: error instanceof Error ? error.message : 'Technician break could not be saved.' });
  }
}
