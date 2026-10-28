import { test } from 'node:test';
import assert from 'node:assert/strict';

const archive = await import('./archive-retired-supplier-snapshots.mjs').catch(() => ({}));
const snapshot = (id, catalog, status, createdAt) => ({
  id, catalog_key: catalog, status, created_at: createdAt, job_id: `job-${id}`, row_count: 1
});

test('retains live snapshots and the two newest retired snapshots per supplier', () => {
  assert.equal(typeof archive.selectSnapshotsForArchive, 'function');
  const rows = [
    snapshot('a-live', 'APEX', 'active', '2026-10-10'),
    snapshot('a-new', 'APEX', 'retired', '2026-10-09'),
    snapshot('a-mid', 'APEX', 'retired', '2026-10-08'),
    snapshot('a-old', 'APEX', 'retired', '2026-10-07'),
    snapshot('b-new', 'ATT', 'retired', '2026-10-09'),
    snapshot('b-mid', 'ATT', 'retired', '2026-10-08'),
    snapshot('b-old-active-pointer', 'ATT', 'retired', '2026-10-07'),
    snapshot('staging', 'APEX', 'staging', '2026-01-01')
  ];
  const sources = [{ catalog_key: 'APEX', active_snapshot_id: 'a-live' },
    { catalog_key: 'ATT', active_snapshot_id: 'b-old-active-pointer' }];
  assert.deepEqual(archive.selectSnapshotsForArchive(rows, sources, 2).map(row => row.id), ['a-old']);
});

test('rejects a backup with missing, duplicate or unrelated item rows', () => {
  assert.equal(typeof archive.validateSnapshotRows, 'function');
  const snap = snapshot('a-old', 'APEX', 'retired', '2026-10-07');
  assert.doesNotThrow(() => archive.validateSnapshotRows(snap, [{ id: 4, snapshot_id: 'a-old' }], 1));
  assert.throws(() => archive.validateSnapshotRows(snap, [], 1), /count/i);
  assert.throws(() => archive.validateSnapshotRows(snap, [{ id: 4, snapshot_id: 'wrong' }], 1), /snapshot/i);
  assert.throws(() => archive.validateSnapshotRows({ ...snap, row_count: 2 }, [
    { id: 4, snapshot_id: 'a-old' }, { id: 4, snapshot_id: 'a-old' }
  ], 2), /duplicate/i);
});
