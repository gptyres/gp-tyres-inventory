import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sheet-inventory-sync-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const SPREADSHEET_ID = '1QJp8o-KzSNIn2xUCS_0o8gNqYzbBP7jYQ_rqtxYw0VY';
const SHEET_NAME = 'INVENTORY';
const SECRET_NAME = 'SHEET_INVENTORY_SYNC_TOKEN';
const MAX_ROWS_PER_REQUEST = 1500;

type InventoryType = 'TYRE' | 'WHEEL' | 'COILOVER';

interface InventoryRow {
  id: string;
  type: InventoryType;
  item: Record<string, unknown>;
  quantity: number;
  selling_price: number;
  cost_price: number;
  last_updated: string;
}

interface SheetRowPayload {
  rowNumber: number;
  values: unknown[];
  portalId?: string | null;
}

interface SyncPayload {
  spreadsheetId?: string;
  sheetName?: string;
  mode?: 'row' | 'batch' | 'full';
  dryRun?: boolean;
  rows?: SheetRowPayload[];
}

interface ParsedSheetRow {
  rowNumber: number;
  values: unknown[];
  portalId?: string;
  fingerprint: string;
  item: {
    id: string;
    type: 'TYRE';
    location: string;
    brand: string;
    pattern: string;
    size: string;
    quantity: number;
    costPrice: number;
    sellingPrice: number;
    loadSpeedIndex: string;
    lastUpdated: string;
    sheetRowNumber: number;
    sheetFingerprint: string;
    sheetSyncedAt: string;
  };
}

interface RowResult {
  rowNumber: number;
  status: 'upserted' | 'skipped' | 'failed' | 'dry_run';
  portalId?: string;
  message: string;
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

const normalizeCellText = (value: unknown) => {
  if (value === null || value === undefined) return '';
  return String(value).replace(/^"+|"+$/g, '').replace(/\s+/g, ' ').trim();
};

const parseSheetCurrency = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const cleaned = normalizeCellText(value)
    .replace(/[Rr]/g, '')
    .replace(/\s/g, '')
    .replace(/[^0-9,.-]/g, '');

  if (!cleaned) return 0;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;

  if (hasComma && hasDot) {
    normalized = cleaned.replace(/,/g, '');
  } else if (hasComma) {
    const commaParts = cleaned.split(',');
    const lastPart = commaParts.at(-1) ?? '';
    normalized = lastPart.length === 2
      ? `${commaParts.slice(0, -1).join('')}.${lastPart}`
      : cleaned.replace(/,/g, '');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseQuantity = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  const parsed = Number(normalizeCellText(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const makeFingerprint = (location: string, productName: string, description: string) => [
  normalizeKey(location || 'unknown'),
  normalizeKey(productName || 'unknown'),
  normalizeKey(description || 'unknown')
].join('|');

const isHeaderOrSectionRow = (values: unknown[]) => {
  const joined = values.map(normalizeCellText).join(' ').toUpperCase();
  if (!joined) return true;
  if (joined.includes('PRODUCT NAME') && joined.includes('QUANTITY')) return true;

  const productName = normalizeCellText(values[2] ?? values[1]);
  const description = normalizeCellText(values[3]);
  const quantityCell = normalizeCellText(values[4]);
  const costCell = normalizeCellText(values[5]);
  const sellingCell = normalizeCellText(values[6]);

  return Boolean(productName && !description && !quantityCell && !costCell && !sellingCell);
};

const parseSheetRow = (row: SheetRowPayload, syncedAt: string): ParsedSheetRow | RowResult => {
  const values = row.values ?? [];
  if (row.rowNumber <= 1 || isHeaderOrSectionRow(values)) {
    return {
      rowNumber: row.rowNumber,
      status: 'skipped',
      message: 'Header, blank, or section row.'
    };
  }

  const location = normalizeCellText(values[0]) || 'Unknown';
  const productName = normalizeCellText(values[2]) || normalizeCellText(values[1]);
  const description = normalizeCellText(values[3]) || 'Unknown';

  if (!productName) {
    return {
      rowNumber: row.rowNumber,
      status: 'skipped',
      message: 'Missing product name.'
    };
  }

  const brandParts = productName.split(' ').filter(Boolean);
  const brand = brandParts[0] || 'Unknown';
  const pattern = brandParts.slice(1).join(' ') || 'Standard';
  const fingerprint = makeFingerprint(location, productName, description);
  const id = row.portalId?.trim() || `sheet-row-${row.rowNumber}`;

  return {
    rowNumber: row.rowNumber,
    values,
    portalId: row.portalId?.trim() || undefined,
    fingerprint,
    item: {
      id,
      type: 'TYRE',
      location,
      brand,
      pattern,
      size: description,
      quantity: parseQuantity(values[4]),
      costPrice: parseSheetCurrency(values[5]),
      sellingPrice: parseSheetCurrency(values[6]),
      loadSpeedIndex: '',
      lastUpdated: syncedAt.slice(0, 10),
      sheetRowNumber: row.rowNumber,
      sheetFingerprint: fingerprint,
      sheetSyncedAt: syncedAt
    }
  };
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

const inventoryFingerprint = (row: InventoryRow) => {
  const item = row.item ?? {};
  const brand = normalizeCellText(item.brand);
  const pattern = normalizeCellText(item.pattern);
  const productName = pattern && pattern !== 'Standard'
    ? `${brand} ${pattern}`
    : brand;

  return makeFingerprint(
    normalizeCellText(item.location),
    productName,
    normalizeCellText(item.size)
  );
};

const getNumericTyreId = (id: string) => {
  const match = id.match(/^t-(\d+)$/);
  return match ? Number(match[1]) : 0;
};

const allocateNewPortalId = (parsed: ParsedSheetRow, usedIds: Set<string>, nextNumericId: { value: number }) => {
  const hashBase = `${parsed.rowNumber}:${parsed.fingerprint}`;
  let hash = 0;
  for (let index = 0; index < hashBase.length; index += 1) {
    hash = ((hash << 5) - hash + hashBase.charCodeAt(index)) | 0;
  }

  let candidate = `sheet-${Math.abs(hash).toString(36)}`;
  if (!usedIds.has(candidate)) return candidate;

  do {
    nextNumericId.value += 1;
    candidate = `t-${nextNumericId.value}`;
  } while (usedIds.has(candidate));

  return candidate;
};

const resolvePortalId = (
  parsed: ParsedSheetRow,
  existingRows: InventoryRow[],
  usedIds: Set<string>,
  nextNumericId: { value: number }
) => {
  if (parsed.portalId && existingRows.some((row) => row.id === parsed.portalId)) return parsed.portalId;

  const exact = existingRows.find((row) => (
    row.type === 'TYRE'
    && !usedIds.has(row.id)
    && inventoryFingerprint(row) === parsed.fingerprint
  ));
  if (exact) return exact.id;

  return allocateNewPortalId(parsed, usedIds, nextNumericId);
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Only POST is supported.' }, 405);
  }

  const startedAt = new Date().toISOString();
  let runId: string | null = null;

  try {
    const supabase = createClient(
      getRequiredEnv('SUPABASE_URL'),
      getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );

    const configuredToken = await getConfiguredToken(supabase);
    const providedToken = request.headers.get('x-sheet-inventory-sync-token') ?? '';
    if (!configuredToken || providedToken !== configuredToken) {
      return jsonResponse({ ok: false, error: 'Unauthorized sheet sync request.' }, 401);
    }

    const payload = await request.json() as SyncPayload;
    const spreadsheetId = payload.spreadsheetId || SPREADSHEET_ID;
    const sheetName = payload.sheetName || SHEET_NAME;
    const mode = payload.mode || 'batch';
    const dryRun = Boolean(payload.dryRun);
    const rows = Array.isArray(payload.rows) ? payload.rows : [];

    if (spreadsheetId !== SPREADSHEET_ID || sheetName !== SHEET_NAME) {
      return jsonResponse({ ok: false, error: 'This function only accepts the configured INVENTORY sheet.' }, 400);
    }

    if (!rows.length) {
      return jsonResponse({ ok: false, error: 'No sheet rows were supplied.' }, 400);
    }

    if (rows.length > MAX_ROWS_PER_REQUEST) {
      return jsonResponse({ ok: false, error: `Maximum ${MAX_ROWS_PER_REQUEST} rows per request.` }, 400);
    }

    const { data: runRow, error: runError } = await supabase
      .from('sheet_inventory_sync_runs')
      .insert({
        spreadsheet_id: spreadsheetId,
        sheet_name: sheetName,
        sync_mode: mode,
        dry_run: dryRun,
        status: 'started',
        rows_received: rows.length,
        started_at: startedAt
      })
      .select('id')
      .single();

    if (runError) throw runError;
    runId = runRow.id;

    const parsedRows: ParsedSheetRow[] = [];
    const rowResults: RowResult[] = [];
    const syncedAt = new Date().toISOString();

    rows.forEach((row) => {
      const parsed = parseSheetRow(row, syncedAt);
      if ('item' in parsed) parsedRows.push(parsed);
      else rowResults.push(parsed);
    });

    const { data: existingRows, error: existingError } = await supabase
      .from('inventory_items')
      .select('id,type,item,quantity,selling_price,cost_price,last_updated')
      .eq('type', 'TYRE');

    if (existingError) throw existingError;

    const inventoryRows = (existingRows || []) as InventoryRow[];
    const usedIds = new Set<string>();
    const nextNumericId = {
      value: inventoryRows.reduce((max, row) => Math.max(max, getNumericTyreId(row.id)), 0)
    };

    const upsertRows = parsedRows.map((parsed) => {
      const portalId = resolvePortalId(parsed, inventoryRows, usedIds, nextNumericId);
      usedIds.add(portalId);
      const item = { ...parsed.item, id: portalId };
      rowResults.push({
        rowNumber: parsed.rowNumber,
        status: dryRun ? 'dry_run' : 'upserted',
        portalId,
        message: dryRun ? 'Parsed and matched; not uploaded.' : 'Synced to portal stock.'
      });

      return {
        id: portalId,
        type: 'TYRE',
        item,
        quantity: item.quantity,
        selling_price: item.sellingPrice,
        cost_price: item.costPrice,
        last_updated: item.lastUpdated,
        updated_at: syncedAt
      };
    });

    if (!dryRun && upsertRows.length) {
      const { error: upsertError } = await supabase
        .from('inventory_items')
        .upsert(upsertRows, { onConflict: 'id' });

      if (upsertError) throw upsertError;
    }

    const rowsSkipped = rowResults.filter((row) => row.status === 'skipped').length;
    const rowsUpserted = dryRun ? 0 : upsertRows.length;

    await supabase
      .from('sheet_inventory_sync_runs')
      .update({
        status: 'completed',
        rows_parsed: parsedRows.length,
        rows_upserted: rowsUpserted,
        rows_skipped: rowsSkipped,
        rows_failed: 0,
        row_results: rowResults,
        completed_at: new Date().toISOString()
      })
      .eq('id', runId);

    return jsonResponse({
      ok: true,
      runId,
      dryRun,
      rowsReceived: rows.length,
      rowsParsed: parsedRows.length,
      rowsUpserted,
      rowsSkipped,
      rowResults
    });
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null
        ? JSON.stringify(error)
        : String(error);

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
            error_message: errorMessage,
            rows_failed: 1,
            completed_at: new Date().toISOString()
          })
          .eq('id', runId);
      }
    } catch {
      // Preserve the original failure response.
    }

    return jsonResponse({
      ok: false,
      runId,
      error: errorMessage
    }, 500);
  }
});
