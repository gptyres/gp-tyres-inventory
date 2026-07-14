import { getClientIpHash, verifyAdminSession } from '../server/adminSession.js';
import { readApiBody } from '../server/readApiBody.js';
import { createSupabaseAdmin } from '../server/supabaseAdmin.js';
import {
  isSupplierImportCatalog,
  SUPPLIER_IMPORT_BY_CATALOG,
  type SupplierImportCatalog
} from '../supplierCatalogMapping.js';
import type { SupplierCatalog } from '../types.js';

export const config = { maxDuration: 60 };

const MAX_ROWS = 10_000;
const INSERT_BATCH_SIZE = 500;
const SHEET_URL_SECRET = 'SHEET_INVENTORY_APPS_SCRIPT_URL';
const SHEET_TOKEN_SECRET = 'SHEET_INVENTORY_SYNC_TOKEN';

interface ImportRow {
  sourceKey: string;
  supplierSku: string;
  brand: string;
  productName: string;
  category: string;
  size: string;
  stockLocation: string;
  stockAvailability: string;
  stockUnits: number;
  costPrice: number;
  sellingPrice: number;
  sourceStockDetail: string;
}

const safeText = (value: unknown, maxLength = 300) => (
  typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength) : ''
);

const safeFileName = (value: unknown) => {
  const name = safeText(value, 180).split(/[\\/]/).pop() || 'supplier-upload';
  return name.replace(/[^A-Za-z0-9._ -]+/g, '_');
};

const normalizeCatalog = (value: unknown): SupplierImportCatalog | null => {
  const catalog = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return isSupplierImportCatalog(catalog as SupplierCatalog)
    ? catalog as SupplierImportCatalog
    : null;
};

const validateRows = (value: unknown): ImportRow[] => {
  if (!Array.isArray(value) || value.length === 0) throw new Error('No supplier stock rows were supplied.');
  if (value.length > MAX_ROWS) throw new Error(`A maximum of ${MAX_ROWS.toLocaleString('en-ZA')} rows can be imported at once.`);

  const seen = new Set<string>();
  return value.map((candidate, index) => {
    const row = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : {};
    const sourceKey = safeText(row.sourceKey, 180);
    const supplierSku = safeText(row.supplierSku, 120);
    const brand = safeText(row.brand, 120);
    const productName = safeText(row.productName, 300);
    const size = safeText(row.size, 80);
    const stockUnits = Number(row.stockUnits);
    const costPrice = Number(row.costPrice);
    const sellingPrice = Number(row.sellingPrice);

    if (!sourceKey || seen.has(sourceKey)) throw new Error(`Row ${index + 1} has a missing or duplicate source key.`);
    if (!brand || !productName || !size) throw new Error(`Row ${index + 1} is missing brand, product, or size.`);
    if (!Number.isFinite(stockUnits) || stockUnits < 0 || stockUnits > 10_000_000) {
      throw new Error(`Row ${index + 1} has an invalid stock quantity.`);
    }
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0 || sellingPrice > 10_000_000) {
      throw new Error(`Row ${index + 1} has an invalid selling price.`);
    }
    if (!Number.isFinite(costPrice) || costPrice < 0 || costPrice > 10_000_000) {
      throw new Error(`Row ${index + 1} has an invalid VAT-inclusive cost price.`);
    }
    seen.add(sourceKey);

    return {
      sourceKey,
      supplierSku: supplierSku || sourceKey,
      brand,
      productName,
      category: safeText(row.category, 120) || 'TYRE',
      size,
      stockLocation: safeText(row.stockLocation, 160) || 'Supplier',
      stockAvailability: safeText(row.stockAvailability, 120) || (stockUnits > 0 ? 'In stock' : 'Out of stock'),
      stockUnits: Math.trunc(stockUnits),
      costPrice: Number(costPrice.toFixed(2)),
      sellingPrice: Number(sellingPrice.toFixed(2)),
      sourceStockDetail: safeText(row.sourceStockDetail, 300)
    };
  });
};

const getPrivateSecret = async (
  supabase: ReturnType<typeof createSupabaseAdmin>,
  name: string
) => {
  const { data, error } = await supabase
    .from('app_private_import_secrets')
    .select('secret_value')
    .eq('name', name)
    .maybeSingle();
  if (error) throw error;
  return data?.secret_value || '';
};

const replaceSupplierSheet = async (
  supabase: ReturnType<typeof createSupabaseAdmin>,
  catalog: SupplierImportCatalog,
  sourceFile: string,
  rows: ImportRow[]
) => {
  const [appsScriptUrl, token] = await Promise.all([
    getPrivateSecret(supabase, SHEET_URL_SECRET),
    getPrivateSecret(supabase, SHEET_TOKEN_SECRET)
  ]);
  if (!appsScriptUrl || !token) throw new Error('The Google Sheet supplier import bridge is not configured.');

  const importedAt = new Date().toISOString();
  const meta = SUPPLIER_IMPORT_BY_CATALOG[catalog];
  const sheetResponse = await fetch(appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'replaceSupplierCatalog',
      token,
      catalog,
      supplier: meta.supplier,
      sheetName: meta.sheetName,
      sourceFile,
      importedAt,
      rows: rows.map((row) => [
        meta.supplier,
        row.supplierSku,
        row.brand,
        row.productName,
        row.category,
        row.size,
        row.stockLocation,
        row.stockAvailability,
        row.stockUnits,
        row.costPrice,
        row.sellingPrice,
        sourceFile,
        importedAt
      ])
    })
  });
  const responseText = await sheetResponse.text();
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(responseText);
  } catch {
    result = { ok: false, error: 'Google Sheets returned an invalid response.' };
  }
  if (!sheetResponse.ok || !result.ok) {
    throw new Error(safeText(result.error, 300) || 'Google Sheet replacement failed.');
  }
  return { sheetName: meta.sheetName, importedAt, rowsWritten: Number(result.rowsWritten) || rows.length };
};

export default async function handler(request: any, response: any) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Unsupported method.' });
  }

  const session = verifyAdminSession(request);
  if (!session) return response.status(401).json({ error: 'Admin authentication is required.' });

  const supabase = createSupabaseAdmin();
  let jobId = '';
  let snapshotId = '';

  try {
    const body = await readApiBody(request);
    const catalog = normalizeCatalog(body.catalog);
    if (!catalog) return response.status(400).json({ error: 'Choose a supported supplier catalogue before importing.' });
    const rows = validateRows(body.rows);
    const sourceFile = safeFileName(body.sourceFile);
    const terminal = safeText(body.terminal, 80) || 'UNKNOWN';
    const supplierMeta = SUPPLIER_IMPORT_BY_CATALOG[catalog];
    const supplier = supplierMeta.supplier;

    const { data: job, error: jobError } = await supabase
      .from('supplier_sync_jobs')
      .insert({
        scope: 'MANUAL_UPLOAD',
        target_supplier: supplier,
        target_catalog: catalog,
        status: 'running',
        requested_by_staff: session.staffName,
        requested_by_terminal: terminal,
        requested_ip_hash: getClientIpHash(request),
        artifact_name: sourceFile,
        suppliers_total: 1,
        progress_stage: 'validating',
        progress_current: 0,
        progress_total: rows.length,
        progress_message: `Validated ${rows.length.toLocaleString('en-ZA')} ${supplier} stock rows`,
        started_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString()
      })
      .select('id')
      .single();
    if (jobError?.code === '23505') {
      return response.status(409).json({ error: 'Another supplier sync or import is currently running.' });
    }
    if (jobError) throw jobError;
    jobId = job.id;

    await supabase.from('supplier_sync_jobs').update({
      progress_stage: 'publishing',
      progress_message: `Replacing ${supplierMeta.sheetName} in Google Sheets`,
      heartbeat_at: new Date().toISOString()
    }).eq('id', jobId);

    const sheetResult = await replaceSupplierSheet(supabase, catalog, sourceFile, rows);

    const { data: snapshot, error: snapshotError } = await supabase
      .from('supplier_catalog_snapshots')
      .insert({
        job_id: jobId,
        catalog_key: catalog,
        registry_supplier: supplier,
        status: 'staging',
        row_count: rows.length,
        source_files: [sourceFile]
      })
      .select('id')
      .single();
    if (snapshotError) throw snapshotError;
    snapshotId = snapshot.id;

    for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
      const batch = rows.slice(offset, offset + INSERT_BATCH_SIZE).map((row) => ({
        snapshot_id: snapshotId,
        catalog_key: catalog,
        source_key: row.sourceKey,
        product_type: supplierMeta.productType,
        supplier,
        supplier_sku: row.supplierSku,
        brand: row.brand,
        product_name: row.productName,
        category: row.category,
        size: row.size,
        stock_location: row.stockLocation,
        stock_units_availability: row.stockAvailability,
        stock_units: row.stockUnits,
        cost_price: row.costPrice,
        selling_price: row.sellingPrice,
        source_stock_detail: row.sourceStockDetail,
        source_file: sourceFile
      }));
      const { error } = await supabase.from('supplier_catalog_items').insert(batch);
      if (error) throw error;
      await supabase.from('supplier_sync_jobs').update({
        progress_current: Math.min(rows.length, offset + batch.length),
        progress_message: `Publishing ${Math.min(rows.length, offset + batch.length).toLocaleString('en-ZA')} / ${rows.length.toLocaleString('en-ZA')} stock rows`,
        heartbeat_at: new Date().toISOString()
      }).eq('id', jobId);
    }

    const { error: activateError } = await supabase.rpc('activate_supplier_catalog_snapshots', {
      p_job_id: jobId,
      p_snapshots: [{ snapshot_id: snapshotId, catalog_key: catalog, registry_supplier: supplier }]
    });
    if (activateError) throw activateError;

    const completedAt = new Date().toISOString();
    const resultSummary = {
      currentSupplier: null,
      sheetName: sheetResult.sheetName,
      sourceFile,
      suppliers: [{ supplier, status: 'ok', rowsPublished: rows.length, catalogs: [catalog], detail: `Written to ${sheetResult.sheetName} and published.` }]
    };
    await supabase.from('supplier_sync_jobs').update({
      status: 'succeeded',
      progress_stage: 'completed',
      progress_current: rows.length,
      progress_total: rows.length,
      progress_message: `Published ${rows.length.toLocaleString('en-ZA')} stock rows`,
      suppliers_completed: 1,
      rows_published: rows.length,
      result_summary: resultSummary,
      heartbeat_at: completedAt,
      completed_at: completedAt
    }).eq('id', jobId);

    await supabase.from('system_logs').insert({
      terminal_id: `${terminal} (${session.staffName})`,
      event_type: 'MANUAL_SUPPLIER_IMPORT',
      status: 'SUCCESS'
    });

    return response.status(200).json({
      ok: true,
      jobId,
      catalog,
      supplier,
      rowsPublished: rows.length,
      sheetName: sheetResult.sheetName,
      completedAt
    });
  } catch (error) {
    const message = error instanceof Error ? safeText(error.message, 300) : 'Manual supplier import failed.';
    if (snapshotId) {
      await supabase.from('supplier_catalog_snapshots').update({ status: 'failed', safe_error: message }).eq('id', snapshotId);
    }
    if (jobId) {
      const completedAt = new Date().toISOString();
      await supabase.from('supplier_sync_jobs').update({
        status: 'failed',
        progress_stage: 'failed',
        progress_message: message,
        safe_error: message,
        suppliers_failed: 1,
        heartbeat_at: completedAt,
        completed_at: completedAt
      }).eq('id', jobId);
    }
    return response.status(500).json({ error: message || 'Manual supplier import failed.' });
  }
}
