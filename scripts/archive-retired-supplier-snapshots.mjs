import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = value => createHash('sha256').update(value).digest('hex');

export function selectSnapshotsForArchive(snapshots, sources, keep = 2) {
  if (!Number.isInteger(keep) || keep < 2) throw new Error('At least two retired snapshots must be retained.');
  const active = new Set(sources.map(source => source.active_snapshot_id).filter(Boolean));
  const groups = new Map();
  for (const snapshot of snapshots) {
    if (snapshot.status !== 'retired') continue;
    const group = groups.get(snapshot.catalog_key) || [];
    group.push(snapshot);
    groups.set(snapshot.catalog_key, group);
  }
  return [...groups.values()].flatMap(group =>
    group.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
      .slice(keep).filter(snapshot => !active.has(snapshot.id))
  );
}

export function validateSnapshotRows(snapshot, items, expected) {
  if (items.length !== expected || expected !== snapshot.row_count) throw new Error('Snapshot row count mismatch.');
  const ids = new Set();
  for (const item of items) {
    if (item.snapshot_id !== snapshot.id) throw new Error('Item belongs to a different snapshot.');
    if (ids.has(item.id)) throw new Error('Duplicate item ID in backup.');
    ids.add(item.id);
  }
}

const rowsHash = rows => sha(Buffer.from(JSON.stringify(rows)));
const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};

async function checked(result) {
  if (result.error) throw new Error(result.error.message || 'Supabase request failed.');
  return result;
}

async function fetchRows(db, table, configure = query => query) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const result = await checked(await configure(db.from(table).select('*')).range(offset, offset + 999));
    rows.push(...result.data);
    if (result.data.length === 0) return rows;
    offset += result.data.length;
  }
}

async function fetchSnapshotItems(db, snapshot) {
  const items = [];
  let lastId = 0;
  let total;
  for (;;) {
    const result = await checked(await db.from('supplier_catalog_items')
      .select('*', { count: 'exact' }).eq('snapshot_id', snapshot.id)
      .gt('id', lastId).order('id', { ascending: true }).limit(1000));
    if (total === undefined) total = result.count;
    if (!Array.isArray(result.data) || !Number.isInteger(total)) throw new Error('Unable to verify snapshot count.');
    if (result.data.length === 0) break;
    const nextId = result.data.at(-1).id;
    if (!(nextId > lastId)) throw new Error('Snapshot pagination did not advance.');
    lastId = nextId;
    items.push(...result.data);
  }
  validateSnapshotRows(snapshot, items, total);
  return items;
}

async function getContext(db) {
  const snapshots = await fetchRows(db, 'supplier_catalog_snapshots', query => query.order('id'));
  const sources = await fetchRows(db, 'supplier_catalog_sources', query => query.order('catalog_key'));
  const targets = selectSnapshotsForArchive(snapshots, sources);
  if (targets.some(row => !/^[0-9a-f-]{36}$/i.test(row.id))) throw new Error('Invalid snapshot identity.');
  return { snapshots, sources, targets };
}

async function readVerifiedArchive(root, entry) {
  if (basename(entry.file) !== entry.file || !/^[0-9a-f-]{36}\.json\.gz$/i.test(entry.file)) {
    throw new Error('Unsafe archive path.');
  }
  const bytes = await readFile(join(root, entry.file));
  if (sha(bytes) !== entry.fileSha256) throw new Error('Archive checksum mismatch.');
  const archive = JSON.parse(gunzipSync(bytes).toString('utf8'));
  if (archive.snapshot.id !== entry.snapshotId || archive.snapshot.status !== 'retired') throw new Error('Archive snapshot mismatch.');
  if (archive.job?.id !== archive.snapshot.job_id) throw new Error('Archive job mismatch.');
  validateSnapshotRows(archive.snapshot, archive.items, entry.itemCount);
  if (rowsHash(archive.items) !== entry.rowsSha256) throw new Error('Archive rows checksum mismatch.');
  return archive;
}

async function parallelLimit(items, limit, fn) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await fn(items[index], index);
    }
  }));
}

async function main() {
  const mode = process.argv.includes('--backup') ? 'backup'
    : process.argv.includes('--verify') ? 'verify'
      : process.argv.includes('--prune') ? 'prune' : 'dry-run';
  const root = resolve(argument('--output', 'outputs/supplier-retired-snapshot-backup'));
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('SUPABASE_SECRET_KEY is unavailable.');
  const db = createClient('https://moiybakshvuvppesbnpt.supabase.co', key, { auth: { persistSession: false, autoRefreshToken: false } });
  const context = await getContext(db);
  if (mode === 'dry-run') {
    console.log(JSON.stringify({ mode, eligibleSnapshots: context.targets.length, rows: context.targets.reduce((n, row) => n + row.row_count, 0), output: root }));
    return;
  }
  if (mode === 'backup') {
    await mkdir(root, { recursive: true });
    const jobIds = [...new Set(context.targets.map(row => row.job_id))];
    const jobs = new Map();
    for (let i = 0; i < jobIds.length; i += 100) {
      const result = await checked(await db.from('supplier_sync_jobs').select('*').in('id', jobIds.slice(i, i + 100)));
      for (const job of result.data) jobs.set(job.id, job);
    }
    if (jobs.size !== jobIds.length) throw new Error('Some snapshot job records could not be backed up.');
    const entries = new Array(context.targets.length);
    let completed = 0;
    await parallelLimit(context.targets, 4, async (snapshot, index) => {
      const items = await fetchSnapshotItems(db, snapshot);
      const archive = { snapshot, job: jobs.get(snapshot.job_id), items };
      const bytes = gzipSync(Buffer.from(JSON.stringify(archive)), { level: 6 });
      const file = `${snapshot.id}.json.gz`;
      await writeFile(join(root, file), bytes, { flag: 'wx' });
      entries[index] = { snapshotId: snapshot.id, catalog: snapshot.catalog_key, file,
        fileSha256: sha(bytes), rowsSha256: rowsHash(items), itemCount: items.length };
      await readVerifiedArchive(root, entries[index]);
      completed++;
      if (completed % 10 === 0 || completed === context.targets.length) console.log(`Backed up ${completed}/${context.targets.length} snapshots`);
    });
    const manifest = { version: 1, project: 'moiybakshvuvppesbnpt', createdAt: new Date().toISOString(),
      retainRetiredPerCatalog: 2, sourcesAtBackup: context.sources, entries };
    await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ mode, output: root, snapshots: entries.length, rows: entries.reduce((n, e) => n + e.itemCount, 0) }));
    return;
  }
  const manifestPath = join(root, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.version !== 1 || manifest.project !== 'moiybakshvuvppesbnpt' || !Array.isArray(manifest.entries)) throw new Error('Invalid archive manifest.');
  const history = await readFile(join(root, 'pruned.jsonl'), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  const removedIds = new Set(history.split('\n').filter(Boolean).map(line => JSON.parse(line).id));
  if ([...removedIds].some(id => context.snapshots.some(snapshot => snapshot.id === id))) {
    throw new Error('A previously removed snapshot still exists; review before continuing.');
  }
  const remaining = manifest.entries.filter(entry => !removedIds.has(entry.snapshotId));
  const eligible = new Set(context.targets.map(row => row.id));
  if (remaining.some(entry => !eligible.has(entry.snapshotId))) throw new Error('A target is no longer eligible; nothing was deleted.');
  if (mode === 'verify') {
    if (removedIds.size) throw new Error('Cannot re-verify a partially pruned archive against deleted rows.');
    let completed = 0;
    await parallelLimit(manifest.entries, 4, async entry => {
      const archive = await readVerifiedArchive(root, entry);
      const live = context.targets.find(row => row.id === entry.snapshotId);
      if (!live || JSON.stringify(live) !== JSON.stringify(archive.snapshot)) throw new Error('Snapshot metadata changed.');
      const items = await fetchSnapshotItems(db, live);
      if (rowsHash(items) !== entry.rowsSha256) throw new Error('Live snapshot rows changed since backup.');
      completed++;
      if (completed % 10 === 0 || completed === manifest.entries.length) console.log(`Verified ${completed}/${manifest.entries.length} snapshots`);
    });
    manifest.verifiedAt = new Date().toISOString();
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify({ mode, output: root, verified: manifest.entries.length }));
    return;
  }
  if (!manifest.verifiedAt) throw new Error('The complete backup must be verified before pruning.');
  const maximum = Number(argument('--max', remaining.length));
  if (!Number.isInteger(maximum) || maximum < 1) throw new Error('Invalid prune limit.');
  let removed = 0;
  for (const entry of remaining.slice(0, maximum)) {
    const freshContext = await getContext(db);
    const eligibleSnapshot = freshContext.targets.find(row => row.id === entry.snapshotId);
    if (!eligibleSnapshot) throw new Error('Snapshot is no longer eligible; stopped without deleting it.');
    const archive = await readVerifiedArchive(root, entry);
    if (JSON.stringify(eligibleSnapshot) !== JSON.stringify(archive.snapshot)) throw new Error('Snapshot metadata changed.');
    const liveRows = await fetchSnapshotItems(db, eligibleSnapshot);
    if (rowsHash(liveRows) !== entry.rowsSha256) throw new Error('Snapshot data changed; stopped without deleting it.');
    const result = await checked(await db.from('supplier_catalog_snapshots')
      .delete().eq('id', entry.snapshotId).eq('status', 'retired').select('id'));
    if (result.data.length !== 1 || result.data[0].id !== entry.snapshotId) throw new Error('Snapshot deletion was not confirmed.');
    removed++;
    console.log(`Removed verified retired snapshot ${removed}/${Math.min(maximum, remaining.length)}`);
    await writeFile(join(root, 'pruned.jsonl'), JSON.stringify({ id: entry.snapshotId, at: new Date().toISOString() }) + '\n', { flag: 'a' });
  }
  console.log(JSON.stringify({ mode, removed, output: root }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
