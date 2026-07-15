import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://moiybakshvuvppesbnpt.supabase.co';
const serviceKey = process.env.SUPABASE_SECRET_KEY;
if (!serviceKey) throw new Error('SUPABASE_SECRET_KEY is not available in this environment.');

const sources = [
  {
    catalog: 'APEX',
    supplier: 'Apex',
    dataFile: 'supplier_data/apexData.ts',
    sourceFile: 'apex_portal_import_2026-07-15.csv'
  },
  {
    catalog: 'TREADS_UNLIMITED',
    supplier: 'Threads Unlimited',
    dataFile: 'supplier_data/treadsUnlimitedData.ts',
    sourceFile: 'threads_unlimited_portal_import_2026-07-15.csv'
  },
  {
    catalog: 'TUBESTONE',
    supplier: 'Tubestone',
    dataFile: 'supplier_data/tubestoneData.ts',
    sourceFile: 'tubestone_portal_import_2026-07-15.csv'
  }
];

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted && char === '"' && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
};

const readEmbeddedCsv = async (file) => {
  const moduleText = await readFile(resolve(file), 'utf8');
  const assignment = moduleText.indexOf('=');
  const terminator = moduleText.lastIndexOf(';');
  if (assignment < 0 || terminator < assignment) throw new Error(`Could not read embedded CSV from ${file}.`);
  return JSON.parse(moduleText.slice(assignment + 1, terminator).trim());
};

const clean = (value) => String(value ?? '').trim();
const parseMoney = (value) => Number.parseFloat(clean(value).replace(/[^0-9.-]/g, '')) || 0;
const parseStock = (value) => Number.parseInt(clean(value).replace(/[^0-9-]/g, ''), 10) || 0;
const stableIdentityHash = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
};

const buildItems = async (source) => {
  const rows = parseCsv(await readEmbeddedCsv(source.dataFile));
  const headers = rows[0].map(clean);
  const column = (name) => {
    const index = headers.indexOf(name);
    if (index < 0) throw new Error(`${source.catalog}: missing ${name}.`);
    return index;
  };
  const locationColumns = headers.flatMap((header, index) => {
    const match = header.match(/^(.+?)\s+Stock Units$/i);
    return match && !/^total$/i.test(match[1]) ? [{ index, location: match[1].trim() }] : [];
  });
  const get = (row, name) => clean(row[column(name)]);

  return rows.slice(1).map((row) => {
    const sku = get(row, 'Supplier SKU');
    const stockByLocation = Object.fromEntries(locationColumns.map(({ index, location }) => [location, parseStock(row[index])]));
    const stockUnits = Object.values(stockByLocation).reduce((total, quantity) => total + quantity, 0);
    const stockLocation = Object.entries(stockByLocation).map(([location, quantity]) => `${location}: ${quantity}`).join(' | ');
    const rawIdentity = `${source.catalog}-${sku}`.toLowerCase();
    const sourceKey = `${rawIdentity.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 168)}-${stableIdentityHash(rawIdentity)}`;
    return {
      catalog_key: source.catalog,
      source_key: sourceKey,
      product_type: 'TYRE',
      supplier: source.supplier,
      supplier_sku: sku,
      brand: get(row, 'TYRE_BRAND'),
      product_name: get(row, 'Product Name'),
      tyre_pattern: get(row, 'TYRE_PATTERN') || null,
      tyre_rating: get(row, 'TYRE_RATING') || null,
      tyre_index: get(row, 'TYRE_INDEX') || null,
      tyre_specs: get(row, 'TYRE_SPECS') || null,
      stock_by_location: stockByLocation,
      category: get(row, 'Category') || 'Tyres',
      size: get(row, 'TYRE_SIZE'),
      stock_location: stockLocation,
      stock_units_availability: stockUnits > 0 ? 'In stock' : 'Out of stock',
      stock_units: stockUnits,
      cost_price: parseMoney(get(row, 'Cost Price')),
      selling_price: parseMoney(get(row, 'Selling Price')),
      source_stock_detail: stockLocation,
      source_file: basename(source.sourceFile)
    };
  });
};

const supabase = createClient(SUPABASE_URL, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const prepared = await Promise.all(sources.map(async (source) => ({ ...source, items: await buildItems(source) })));
const totalRows = prepared.reduce((total, source) => total + source.items.length, 0);
let jobId = '';
const snapshotIds = [];

try {
  const now = new Date().toISOString();
  const { data: job, error: jobError } = await supabase.from('supplier_sync_jobs').insert({
    scope: 'ALL_ENABLED',
    status: 'running',
    requested_by_staff: 'Codex supplier pricing refresh',
    requested_by_terminal: 'CODEX',
    artifact_name: 'supplier_refresh_summary_2026-07-15.csv',
    suppliers_total: prepared.length,
    progress_stage: 'publishing',
    progress_current: 0,
    progress_total: totalRows,
    progress_message: `Publishing ${totalRows.toLocaleString('en-ZA')} validated supplier products`,
    started_at: now,
    heartbeat_at: now
  }).select('id').single();
  if (jobError) throw jobError;
  jobId = job.id;

  let published = 0;
  const activationEntries = [];
  for (const source of prepared) {
    const { data: snapshot, error: snapshotError } = await supabase.from('supplier_catalog_snapshots').insert({
      job_id: jobId,
      catalog_key: source.catalog,
      registry_supplier: source.supplier,
      status: 'staging',
      row_count: source.items.length,
      source_files: [source.sourceFile]
    }).select('id').single();
    if (snapshotError) throw snapshotError;
    snapshotIds.push(snapshot.id);

    for (let offset = 0; offset < source.items.length; offset += 500) {
      const batch = source.items.slice(offset, offset + 500).map((item) => ({ ...item, snapshot_id: snapshot.id }));
      const { error: itemError } = await supabase.from('supplier_catalog_items').insert(batch);
      if (itemError) throw itemError;
      published += batch.length;
      const { error: progressError } = await supabase.from('supplier_sync_jobs').update({
        progress_current: published,
        progress_message: `Published ${published.toLocaleString('en-ZA')} / ${totalRows.toLocaleString('en-ZA')} supplier products`,
        heartbeat_at: new Date().toISOString()
      }).eq('id', jobId);
      if (progressError) throw progressError;
    }
    activationEntries.push({ snapshot_id: snapshot.id, catalog_key: source.catalog, registry_supplier: source.supplier });
  }

  const { error: activateError } = await supabase.rpc('activate_supplier_catalog_snapshots', {
    p_job_id: jobId,
    p_snapshots: activationEntries
  });
  if (activateError) throw activateError;

  const completedAt = new Date().toISOString();
  const resultSummary = {
    source: 'supplier_refresh_summary_2026-07-15.csv',
    suppliers: prepared.map((source) => ({ supplier: source.supplier, catalog: source.catalog, rowsPublished: source.items.length, status: 'ok' }))
  };
  const { error: completionError } = await supabase.from('supplier_sync_jobs').update({
    status: 'succeeded',
    progress_stage: 'completed',
    progress_current: totalRows,
    progress_total: totalRows,
    progress_message: `Published ${totalRows.toLocaleString('en-ZA')} supplier products`,
    suppliers_completed: prepared.length,
    rows_published: totalRows,
    result_summary: resultSummary,
    heartbeat_at: completedAt,
    completed_at: completedAt
  }).eq('id', jobId);
  if (completionError) throw completionError;

  console.log(JSON.stringify({ jobId, completedAt, totalRows, suppliers: resultSummary.suppliers }, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (snapshotIds.length) await supabase.from('supplier_catalog_snapshots').update({ status: 'failed', safe_error: message.slice(0, 300) }).in('id', snapshotIds);
  if (jobId) {
    const completedAt = new Date().toISOString();
    await supabase.from('supplier_sync_jobs').update({
      status: 'failed',
      progress_stage: 'failed',
      progress_message: message.slice(0, 300),
      safe_error: message.slice(0, 300),
      suppliers_failed: prepared.length,
      heartbeat_at: completedAt,
      completed_at: completedAt
    }).eq('id', jobId);
  }
  throw error;
}
