import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const SPREADSHEET_ID = '1QJp8o-KzSNIn2xUCS_0o8gNqYzbBP7jYQ_rqtxYw0VY';
const SHEET_NAME = 'INVENTORY';
const SECRET_NAME = 'SHEET_INVENTORY_SYNC_TOKEN';
const MAX_EXPORT_ROWS = 1500;

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

const parseCsv = (csvText: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') index += 1;
      row.push(cell);
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
};

const getConfiguredToken = async (supabase: ReturnType<typeof createClient>) => {
  const envToken = Deno.env.get(SECRET_NAME);
  if (envToken) return envToken;

  const { data, error } = await supabase
    .from('app_private_import_secrets')
    .select('secret_value')
    .eq('name', SECRET_NAME)
    .maybeSingle();

  if (error) throw error;
  return data?.secret_value ?? '';
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'Only POST is supported.' }, 405);

  try {
    const supabaseUrl = getRequiredEnv('SUPABASE_URL');
    const supabase = createClient(
      supabaseUrl,
      getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const token = await getConfiguredToken(supabase);
    if (!token) return jsonResponse({ ok: false, error: 'Sheet sync token is not configured.' }, 500);

    const exportUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}&range=A1:Z${MAX_EXPORT_ROWS}`;
    const exportResponse = await fetch(exportUrl);
    if (!exportResponse.ok) {
      return jsonResponse({ ok: false, error: `Could not read Google Sheet export (${exportResponse.status}).` }, 502);
    }

    const csvRows = parseCsv(await exportResponse.text());
    const rows = csvRows.slice(1).map((values, index) => ({
      rowNumber: index + 2,
      values: values.slice(0, 7),
      portalId: values[23] || ''
    }));

    const syncResponse = await fetch(`${supabaseUrl}/functions/v1/sync-sheet-inventory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sheet-inventory-sync-token': token
      },
      body: JSON.stringify({
        spreadsheetId: SPREADSHEET_ID,
        sheetName: SHEET_NAME,
        mode: 'full',
        rows
      })
    });

    const syncText = await syncResponse.text();
    let syncResult: Record<string, unknown>;
    try {
      syncResult = JSON.parse(syncText);
    } catch {
      syncResult = { ok: false, error: syncText };
    }

    return jsonResponse(syncResult, syncResponse.ok ? 200 : syncResponse.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
