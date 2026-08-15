import { readApiBody } from '../server/readApiBody.js';
import { requireStaffSession } from '../server/photoLibrary.js';
import { createSupabaseAdmin } from '../server/supabaseAdmin.js';

const cleanText = (value: unknown, maximum = 180) => (
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maximum) : ''
);

const allowedTypes = new Set(['TYRE', 'WHEEL', 'COILOVER', 'BATTERY']);

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
}
