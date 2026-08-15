import { fetchDailySalesReport, fetchStockMovementSummary, getJohannesburgDateKey } from '../server/inventoryHistory.js';
import { requireStaffSession } from '../server/photoLibrary.js';

const one = (value: unknown) => Array.isArray(value) ? value[0] : value;

export default async function handler(request: any, response: any) {
  response.setHeader('Cache-Control', 'no-store');
  const session = requireStaffSession(request, response);
  if (!session) return;
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Unsupported method.' });
  }
  try {
    const mode = String(one(request.query?.mode) || 'summary').toLowerCase();
    if (mode === 'report') {
      const date = String(one(request.query?.date) || getJohannesburgDateKey());
      return response.status(200).json({ ok: true, date, rows: await fetchDailySalesReport(date) });
    }
    const days = Math.min(30, Math.max(1, Number(one(request.query?.days)) || 15));
    return response.status(200).json({ ok: true, summary: await fetchStockMovementSummary(days) });
  } catch (error) {
    return response.status(500).json({ error: error instanceof Error ? error.message : 'Stock movement could not be loaded.' });
  }
}
