import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
};

const file = argument('--file');
const catalog = argument('--catalog').toUpperCase();
const supplier = argument('--supplier');
const sourceFile = argument('--source') || basename(file);
const requestedBy = argument('--requested-by') || 'Codex supplier catalogue publish';
const dryRun = process.argv.includes('--dry-run');

if (!file || !catalog || !supplier) {
  throw new Error('Usage: --file <items.json> --catalog <key> --supplier <name> [--source <label>] [--dry-run]');
}

const items = JSON.parse(await readFile(resolve(file), 'utf8'));
if (!Array.isArray(items) || items.length === 0) throw new Error('The supplier snapshot contains no rows.');

const required = ['source_key', 'product_type', 'product_name', 'stock_units', 'cost_price', 'selling_price'];
const sourceKeys = new Set();
items.forEach((item, index) => {
  const missing = required.filter((key) => item[key] === undefined || item[key] === null || item[key] === '');
  if (missing.length) throw new Error(`Row ${index + 1} is missing ${missing.join(', ')}.`);
  if (sourceKeys.has(item.source_key)) throw new Error(`Duplicate source_key: ${item.source_key}`);
  sourceKeys.add(item.source_key);
  if (item.catalog_key && item.catalog_key !== catalog) throw new Error(`Row ${index + 1} has the wrong catalogue key.`);
  if (Number(item.stock_units) < 0 || Number(item.cost_price) < 0 || Number(item.selling_price) < 0) {
    throw new Error(`Row ${index + 1} contains a negative stock or price value.`);
  }
});

const prepared = items.map((item) => ({
  ...item,
  catalog_key: catalog,
  supplier,
  source_file: item.source_file || sourceFile
}));

const summary = {
  dryRun,
  catalog,
  supplier,
  sourceFile,
  rows: prepared.length,
  stockUnits: prepared.reduce((total, item) => total + Number(item.stock_units || 0), 0),
  minCost: Math.min(...prepared.map((item) => Number(item.cost_price))),
  maxCost: Math.max(...prepared.map((item) => Number(item.cost_price)))
};

if (dryRun) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

const serviceKey = process.env.SUPABASE_SECRET_KEY;
if (!serviceKey) throw new Error('SUPABASE_SECRET_KEY is not available in this environment.');

const supabase = createClient('https://moiybakshvuvppesbnpt.supabase.co', serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

let jobId = '';
let snapshotId = '';

try {
  const startedAt = new Date().toISOString();
  const { data: job, error: jobError } = await supabase.from('supplier_sync_jobs').insert({
    scope: 'SINGLE_SUPPLIER',
    target_supplier: supplier,
    target_catalog: catalog,
    status: 'running',
    requested_by_staff: requestedBy,
    requested_by_terminal: 'CODEX',
    artifact_name: sourceFile,
    suppliers_total: 1,
    progress_stage: 'publishing',
    progress_current: 0,
    progress_total: prepared.length,
    progress_message: `Publishing ${prepared.length.toLocaleString('en-ZA')} validated products`,
    started_at: startedAt,
    heartbeat_at: startedAt
  }).select('id').single();
  if (jobError) throw jobError;
  jobId = job.id;

  const { data: snapshot, error: snapshotError } = await supabase.from('supplier_catalog_snapshots').insert({
    job_id: jobId,
    catalog_key: catalog,
    registry_supplier: supplier,
    status: 'staging',
    row_count: prepared.length,
    source_files: [sourceFile]
  }).select('id').single();
  if (snapshotError) throw snapshotError;
  snapshotId = snapshot.id;

  let published = 0;
  for (let offset = 0; offset < prepared.length; offset += 500) {
    const batch = prepared.slice(offset, offset + 500).map((item) => ({ ...item, snapshot_id: snapshotId }));
    const { error: insertError } = await supabase.from('supplier_catalog_items').insert(batch);
    if (insertError) throw insertError;
    published += batch.length;
    const { error: progressError } = await supabase.from('supplier_sync_jobs').update({
      progress_current: published,
      progress_message: `Published ${published.toLocaleString('en-ZA')} / ${prepared.length.toLocaleString('en-ZA')} products`,
      heartbeat_at: new Date().toISOString()
    }).eq('id', jobId);
    if (progressError) throw progressError;
  }

  const { error: activateError } = await supabase.rpc('activate_supplier_catalog_snapshots', {
    p_job_id: jobId,
    p_snapshots: [{ snapshot_id: snapshotId, catalog_key: catalog, registry_supplier: supplier }]
  });
  if (activateError) throw activateError;

  const completedAt = new Date().toISOString();
  const resultSummary = { source: sourceFile, suppliers: [{ supplier, catalog, rowsPublished: prepared.length, status: 'ok' }] };
  const { error: completeError } = await supabase.from('supplier_sync_jobs').update({
    status: 'succeeded',
    progress_stage: 'completed',
    progress_current: prepared.length,
    progress_total: prepared.length,
    progress_message: `Published ${prepared.length.toLocaleString('en-ZA')} products`,
    suppliers_completed: 1,
    rows_published: prepared.length,
    result_summary: resultSummary,
    heartbeat_at: completedAt,
    completed_at: completedAt
  }).eq('id', jobId);
  if (completeError) throw completeError;

  console.log(JSON.stringify({ ...summary, jobId, snapshotId, completedAt }, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (snapshotId) {
    await supabase.from('supplier_catalog_snapshots').update({ status: 'failed', safe_error: message.slice(0, 300) }).eq('id', snapshotId);
  }
  if (jobId) {
    const completedAt = new Date().toISOString();
    await supabase.from('supplier_sync_jobs').update({
      status: 'failed',
      progress_stage: 'failed',
      progress_message: message.slice(0, 300),
      safe_error: message.slice(0, 300),
      suppliers_failed: 1,
      heartbeat_at: completedAt,
      completed_at: completedAt
    }).eq('id', jobId);
  }
  throw error;
}
