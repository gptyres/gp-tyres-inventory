import { readFile, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const file = process.argv[2];
if (!file || !process.env.SUPABASE_SECRET_KEY) throw new Error('Expected catalogue JSON file and server secret');
const expected = JSON.parse(await readFile(file, 'utf8'));
const client = createClient('https://moiybakshvuvppesbnpt.supabase.co', process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const { data: source, error: sourceError } = await client.from('supplier_catalog_sources')
  .select('active_snapshot_id').eq('catalog_key', 'ROYAL_TYRES').single();
if (sourceError) throw sourceError;
const actual = [];
for (let start = 0; ; start += 500) {
  const { data, error } = await client.from('supplier_catalog_items').select('*')
    .eq('snapshot_id', source.active_snapshot_id).order('id').range(start, start + 499);
  if (error) throw error;
  actual.push(...data);
  if (data.length < 500) break;
}
const fields = ['source_key', 'supplier_sku', 'product_name', 'brand', 'product_type', 'size', 'category',
  'tyre_pattern', 'tyre_rating', 'tyre_index', 'tyre_specs', 'wheel_pcd', 'wheel_offset', 'wheel_center_bore',
  'cost_price', 'selling_price', 'stock_units', 'stock_location', 'stock_units_availability', 'supplier_lead_time'];
const stockKey = (stock) => JSON.stringify(Object.entries(stock).sort(([a], [b]) => a.localeCompare(b)));
const differences = [];
const byKey = new Map(actual.map((row) => [row.source_key, row]));
if (byKey.size !== actual.length || actual.length !== expected.length) differences.push('Row count or duplicate key mismatch');
for (const row of expected) {
  const live = byKey.get(row.source_key);
  if (!live) { differences.push(`Missing ${row.source_key}`); continue; }
  for (const field of fields) {
    if ((row[field] ?? null) !== (live[field] ?? null)) differences.push(`${row.source_key}: ${field}`);
  }
  if (stockKey(row.stock_by_location) !== stockKey(live.stock_by_location)) differences.push(`${row.source_key}: warehouse stock`);
}
const report = { snapshot: source.active_snapshot_id, checkedAt: new Date().toISOString(), rows: actual.length,
  units: actual.reduce((sum, row) => sum + row.stock_units, 0),
  warehouses: Object.fromEntries(['CPT', 'KZN', 'JHB', 'RIVER TRUCK'].map((branch) =>
    [branch, actual.reduce((sum, row) => sum + (row.stock_by_location[branch] || 0), 0)])), differences };
if (process.argv[3]) await writeFile(process.argv[3], `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (differences.length) process.exitCode = 1;
