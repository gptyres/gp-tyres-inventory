import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import XLSX from '@e965/xlsx';
import { extractTyreServiceDescription, supplierSourceServiceDescription } from '../tyreServiceDescription.ts';

const arg = name => process.argv[process.argv.indexOf(name) + 1];
const apply = process.argv.includes('--apply');
const evidencePath = process.argv.includes('--tyrelife-evidence') ? resolve(arg('--tyrelife-evidence')) : '';
const out = resolve(process.argv.includes('--out') ? arg('--out') : '.codex_tmp/tyre-rating-audit.json');
if (!process.env.SUPABASE_SECRET_KEY) throw new Error('Server-side Supabase credential required.');
const db = createClient('https://moiybakshvuvppesbnpt.supabase.co', process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const normalize = value => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const evidence = new Map();
const portalEvidence = new Map();
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] !== '--portal-evidence') continue;
  const file = resolve(process.argv[++i]);
  const capture = JSON.parse(await readFile(file, 'utf8'));
  if (!capture.fetchedAt || !Array.isArray(capture.rows)) throw new Error('Invalid portal evidence.');
  for (const row of capture.rows) {
    const key = [row.catalog, row.sku, row.size, row.brand, row.pattern].map(normalize).join('|');
    const index = supplierSourceServiceDescription(JSON.stringify({ raw: row.raw }));
    if (!index) continue;
    if (portalEvidence.has(key) && portalEvidence.get(key).index !== index) throw new Error('Conflicting portal evidence.');
    portalEvidence.set(key, { index, source: basename(file) });
  }
}
if (evidencePath) {
  const book = XLSX.read(await readFile(evidencePath), { type: 'buffer', raw: true });
  for (const row of XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' })) {
    const key = [row.SKU, row.Size, row.Brand, row.Pattern].map(normalize).join('|');
    const index = extractTyreServiceDescription(`${row['Load Rating']}${row['Speed Rating']}`).index;
    if (evidence.has(key) && evidence.get(key) !== index) throw new Error('Conflicting supplier evidence.');
    evidence.set(key, index);
  }
}
const { data: snapshots, error } = await db.from('supplier_catalog_snapshots').select('id,catalog_key').eq('status', 'active');
if (error) throw error;
const report = { startedAt: new Date().toISOString(), apply, evidenceFile: evidencePath ? basename(evidencePath) : null, suppliers: [], updates: [] };
for (const snapshot of snapshots) {
  const rows = [];
  let cursor = 0;
  for (;;) {
    const { data, error } = await db.from('supplier_catalog_items')
      .select('id,supplier_sku,size,brand,product_name,tyre_pattern,tyre_index,tyre_specs,source_stock_detail')
      .eq('snapshot_id', snapshot.id).eq('product_type', 'TYRE').gt('id', cursor).order('id').limit(500);
    if (error) throw error;
    if (!data.length) break;
    rows.push(...data);
    cursor = data.at(-1).id;
  }
  const groups = new Map();
  let missing = 0, present = 0;
  for (const row of rows) {
    if (row.tyre_index?.trim()) { present++; continue; }
    const key = [row.supplier_sku, row.size, row.brand, row.tyre_pattern || row.product_name].map(normalize).join('|');
    const portal = portalEvidence.get(normalize(snapshot.catalog_key) + '|' + key);
    const supplied = portal?.index || (snapshot.catalog_key === 'TYRE_LIFE' ? evidence.get(key) : '');
    const index = supplied || supplierSourceServiceDescription(row.source_stock_detail)
      || extractTyreServiceDescription(row.product_name, row.tyre_specs).index;
    if (!index) { missing++; continue; }
    const ids = groups.get(index) || [];
    ids.push(row.id);
    groups.set(index, ids);
    report.updates.push({ catalog: snapshot.catalog_key, snapshot: snapshot.id, id: row.id,
      sku: row.supplier_sku, index, source: portal?.source || (supplied ? basename(evidencePath) : 'Stored supplier product evidence') });
  }
  if (apply && groups.size) {
    const { data: current, error } = await db.from('supplier_catalog_sources').select('active_snapshot_id').eq('catalog_key', snapshot.catalog_key).single();
    if (error || current?.active_snapshot_id !== snapshot.id) throw new Error('Supplier snapshot changed; rerun the audit.');
    for (const [index, ids] of groups) {
      for (let offset = 0; offset < ids.length; offset += 100) {
        const batch = ids.slice(offset, offset + 100);
        const { data, error } = await db.from('supplier_catalog_items').update({ tyre_index: index })
          .eq('snapshot_id', snapshot.id).in('id', batch).or('tyre_index.is.null,tyre_index.eq.').select('id,tyre_index');
        if (error) throw error;
        if (data.length !== batch.length || data.some(r => r.tyre_index !== index)) throw new Error('Rating update verification failed.');
      }
    }
  }
  const recovered = [...groups.values()].reduce((n, ids) => n + ids.length, 0);
  report.suppliers.push({ catalog: snapshot.catalog_key, rows: rows.length, present, recovered, missing });
  await mkdir(resolve(out, '..'), { recursive: true });
  await writeFile(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.suppliers.at(-1)));
}
report.completedAt = new Date().toISOString();
await writeFile(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ apply, recovered: report.updates.length, report: out }));
