import { readApiBody } from './readApiBody.js';
import { verifyStaffSession } from './staffSession.js';
import { createSupabaseAdmin } from './supabaseAdmin.js';
import {
  fetchDailySalesReport,
  fetchInventoryHistory,
  fetchStockMovementSummary,
  getJohannesburgDateKey
} from './inventoryHistory.js';

const cleanText = (value: unknown, maximum = 180) => (
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maximum) : ''
);

const one = (value: unknown) => Array.isArray(value) ? value[0] : value;
const allowedTypes = new Set(['TYRE', 'WHEEL', 'COILOVER', 'BATTERY']);

const requireSession = (request: any, response: any) => {
  const session = verifyStaffSession(request);
  if (!session) response.status(401).json({ error: 'Staff login required.' });
  return session;
};

export const handleInventoryMutation = async (request: any, response: any) => {
  const session = requireSession(request, response);
  if (!session) return;
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Unsupported method.' });
  }

  try {
    const body = await readApiBody(request);
    const action = cleanText(body.action, 24).toUpperCase();
    const supabase = createSupabaseAdmin();
    const staffName = cleanText(body.staffName, 80) || session.terminalId;

    if (action === 'SEED') {
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length || items.length > 5000) {
        return response.status(400).json({ error: 'A valid inventory seed is required.' });
      }
      const validItems = items.filter((item: any) => (
        item
        && cleanText(item.id, 120)
        && allowedTypes.has(cleanText(item.type, 20).toUpperCase())
      ));
      if (validItems.length !== items.length) {
        return response.status(400).json({ error: 'Inventory seed contains invalid items.' });
      }
      const { data, error } = await supabase.rpc('seed_inventory_items', { p_items: validItems });
      if (error) throw error;
      return response.status(200).json({ ok: true, count: Number(data) || 0 });
    }

    if (action === 'UPSERT') {
      const item = body.item as Record<string, unknown> | undefined;
      if (!item || !cleanText(item.id, 120) || !allowedTypes.has(cleanText(item.type, 20).toUpperCase())) {
        return response.status(400).json({ error: 'A valid inventory item is required.' });
      }
      const eventType = cleanText(body.eventType, 16).toUpperCase() === 'ADD' ? 'ADD' : 'EDIT';
      const { data, error } = await supabase.rpc('upsert_inventory_item_audited', {
        p_item: item,
        p_audit_context: {
          source: 'PORTAL',
          eventType,
          staffName,
          terminalId: session.terminalId,
          dedupePrefix: `portal-${eventType.toLowerCase()}-${Date.now()}`
        }
      });
      if (error) throw error;
      return response.status(200).json({ ok: true, item: data });
    }

    if (action === 'DELETE') {
      const itemId = cleanText(body.itemId, 120);
      if (!itemId) return response.status(400).json({ error: 'Inventory item id is required.' });
      const { error } = await supabase.rpc('delete_inventory_item_audited', {
        p_item_id: itemId,
        p_audit_context: {
          source: 'PORTAL',
          eventType: 'DELETE',
          staffName,
          terminalId: session.terminalId,
          dedupePrefix: `portal-delete-${Date.now()}`
        }
      });
      if (error) throw error;
      return response.status(200).json({ ok: true });
    }

    if (action === 'TRANSACTION') {
      const rawAdjustments = Array.isArray(body.stockAdjustments) ? body.stockAdjustments : [];
      const rawEntries = Array.isArray(body.salesLogEntries) ? body.salesLogEntries : [];
      if (rawAdjustments.length > 100 || rawEntries.length > 100) {
        return response.status(400).json({ error: 'Transaction contains too many line items.' });
      }
      const stockAdjustments = rawAdjustments.map((entry: any) => ({
        item_id: cleanText(entry?.item_id, 120),
        delta: Math.trunc(Number(entry?.delta) || 0)
      })).filter((entry) => entry.item_id && entry.delta !== 0);
      const salesLogEntries = rawEntries.map((entry: any) => ({
        terminal_id: session.terminalId,
        product_id: cleanText(entry?.product_id, 120),
        product_description: cleanText(entry?.product_description, 300),
        quantity: Math.max(0, Math.trunc(Number(entry?.quantity) || 0)),
        unit_price: Math.max(0, Number(entry?.unit_price) || 0),
        total_amount: Number(entry?.total_amount) || 0,
        user_id: cleanText(entry?.user_id, 80) || staffName,
        customer_name: cleanText(entry?.customer_name, 160) || null,
        reference_id: cleanText(entry?.reference_id, 180)
      })).filter((entry) => entry.product_id && entry.reference_id);
      if (!stockAdjustments.length && !salesLogEntries.length) {
        return response.status(400).json({ error: 'Transaction contains no valid changes.' });
      }
      const { data, error } = await supabase.rpc('process_inventory_transaction', {
        p_stock_adjustments: stockAdjustments,
        p_sales_log_entries: salesLogEntries
      });
      if (error) throw error;
      return response.status(200).json({ ok: true, items: data || [] });
    }

    return response.status(400).json({ error: 'Unsupported inventory action.' });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Inventory change could not be saved.'
    });
  }
};

export const handleInventoryHistory = async (request: any, response: any) => {
  const session = requireSession(request, response);
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
};

export const handleStockMovement = async (request: any, response: any) => {
  const session = requireSession(request, response);
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
};
