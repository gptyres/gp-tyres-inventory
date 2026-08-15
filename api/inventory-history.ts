import { fetchInventoryHistory } from '../server/inventoryHistory.js';
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
    const productId = String(one(request.query?.productId) || '').trim().slice(0, 120);
    if (!productId) return response.status(400).json({ error: 'Product id is required.' });
    const daysValue = String(one(request.query?.days) || '15');
    const days = daysValue === 'all' ? null : Math.min(3650, Math.max(1, Number(daysValue) || 15));
    const result = await fetchInventoryHistory({
      productId,
      days,
      eventType: String(one(request.query?.eventType) || '').toUpperCase() as any,
      source: String(one(request.query?.source) || '').toUpperCase() as any,
      cursor: String(one(request.query?.cursor) || ''),
      limit: Number(one(request.query?.limit)) || 100
    });
    return response.status(200).json({ ok: true, ...result });
  } catch (error) {
    return response.status(500).json({ error: error instanceof Error ? error.message : 'History could not be loaded.' });
  }
}
