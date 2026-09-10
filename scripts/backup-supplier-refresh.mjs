import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const out = resolve(process.argv[2] || 'outputs/supplier-refresh-2026-09-10/backup');
if (!process.env.SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY is required');
const db = createClient('https://moiybakshvuvppesbnpt.supabase.co', process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: snapshots, error } = await db.from('supplier_catalog_snapshots').select('*').eq('status', 'active');
if (error) throw error;
await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'snapshots.json'), JSON.stringify(snapshots, null, 2));
for (const snapshot of snapshots) {
  const items = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await db.from('supplier_catalog_items').select('*').eq('snapshot_id', snapshot.id).order('id').range(offset, offset + 999);
    if (result.error) throw result.error;
    items.push(...result.data);
    if (result.data.length < 1000) break;
  }
  if (items.length !== snapshot.row_count) throw new Error(`Backup count mismatch: ${snapshot.catalog_key}`);
  await writeFile(resolve(out, `${snapshot.catalog_key}.json`), JSON.stringify(items, null, 2));
  console.log(`${snapshot.catalog_key}: ${items.length} rows backed up`);
}
