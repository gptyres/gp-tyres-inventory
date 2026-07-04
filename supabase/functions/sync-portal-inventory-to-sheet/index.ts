import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const SPREADSHEET_ID = '1QJp8o-KzSNIn2xUCS_0o8gNqYzbBP7jYQ_rqtxYw0VY';
const SHEET_NAME = 'INVENTORY';
const TOKEN_SECRET_NAME = 'SHEET_INVENTORY_SYNC_TOKEN';
const APPS_SCRIPT_URL_SECRET_NAME = 'SHEET_INVENTORY_APPS_SCRIPT_URL';
const MAX_ITEMS_PER_REQUEST = 100;

interface PortalSheetItemPayload {
  portalId: string;
  operation: 'upsert' | 'delete';
  type: string;
  values: unknown[];
  productName: string;
  description: string;
}

interface PortalSheetPayload {
  reason?: string;
  items?: PortalSheetItemPayload[];
}

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    'Content-Type': 'application/json'
  }
});

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const getPrivateSecret = async (supabase: ReturnType<typeof createClient>, name: string) => {
  const envValue = Deno.env.get(name);
  if (envValue) return envValue;

  const { data, error } = await supabase
    .from('app_private_import_secrets')
    .select('secret_value')
    .eq('name', name)
    .maybeSingle();

  if (error) throw error;
  return data?.secret_value ?? '';
};

const createSyncRun = async (
  supabase: ReturnType<typeof createClient>,
  reason: string,
  rowsReceived: number
) => {
  const { data, error } = await supabase
    .from('sheet_inventory_sync_runs')
    .insert({
      spreadsheet_id: SPREADSHEET_ID,
      sheet_name: SHEET_NAME,
      sync_mode: reason || 'portal-to-sheet',
      dry_run: false,
      status: 'started',
      rows_received: rowsReceived,
      started_at: new Date().toISOString()
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'Only POST is supported.' }, 405);

  let runId = '';

  try {
    const supabase = createClient(
      getRequiredEnv('SUPABASE_URL'),
      getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const payload = await request.json() as PortalSheetPayload;
    const items = Array.isArray(payload.items) ? payload.items : [];
    const reason = payload.reason || 'portal-to-sheet';

    if (!items.length) return jsonResponse({ ok: true, skipped: true, reason: 'No items supplied.' });
    if (items.length > MAX_ITEMS_PER_REQUEST) {
      return jsonResponse({ ok: false, error: `Maximum ${MAX_ITEMS_PER_REQUEST} items per request.` }, 400);
    }

    const appsScriptUrl = await getPrivateSecret(supabase, APPS_SCRIPT_URL_SECRET_NAME);
    const token = await getPrivateSecret(supabase, TOKEN_SECRET_NAME);
    if (!appsScriptUrl) {
      return jsonResponse({
        ok: true,
        configured: false,
        skipped: true,
        reason: `${APPS_SCRIPT_URL_SECRET_NAME} is not configured yet.`
      });
    }
    if (!token) return jsonResponse({ ok: false, error: 'Sheet sync token is not configured.' }, 500);

    runId = await createSyncRun(supabase, reason, items.length);

    const sheetResponse = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'portalToSheet',
        token,
        spreadsheetId: SPREADSHEET_ID,
        sheetName: SHEET_NAME,
        reason,
        items
      })
    });

    const responseText = await sheetResponse.text();
    let sheetResult: Record<string, unknown>;
    try {
      sheetResult = JSON.parse(responseText);
    } catch {
      sheetResult = { ok: false, error: responseText };
    }

    if (!sheetResponse.ok || !sheetResult.ok) {
      throw new Error(String(sheetResult.error || responseText || 'Apps Script sync failed.'));
    }

    const updated = Number(sheetResult.updated) || 0;
    const appended = Number(sheetResult.appended) || 0;
    const skipped = Number(sheetResult.skipped) || 0;

    await supabase
      .from('sheet_inventory_sync_runs')
      .update({
        status: 'completed',
        rows_parsed: items.length,
        rows_upserted: updated + appended,
        rows_skipped: skipped,
        rows_failed: 0,
        row_results: sheetResult.results || [],
        completed_at: new Date().toISOString()
      })
      .eq('id', runId);

    return jsonResponse({
      ok: true,
      runId,
      configured: true,
      updated,
      appended,
      skipped
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      if (runId) {
        const supabase = createClient(
          getRequiredEnv('SUPABASE_URL'),
          getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
          { auth: { persistSession: false, autoRefreshToken: false } }
        );
        await supabase
          .from('sheet_inventory_sync_runs')
          .update({
            status: 'failed',
            error_message: message,
            rows_failed: 1,
            completed_at: new Date().toISOString()
          })
          .eq('id', runId);
      }
    } catch {
      // Preserve the original failure response.
    }

    return jsonResponse({ ok: false, runId, error: message }, 500);
  }
});
