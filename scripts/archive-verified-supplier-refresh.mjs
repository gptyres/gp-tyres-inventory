import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

// Archive only complete snapshots that have passed a live field-by-field readback.
// Browser captures, credentials, backups and unpublished partial data stay local.
const root = resolve(process.argv[2]);
const destination = resolve(process.argv[3]);
const keys = process.argv.slice(4);
assert.ok(keys.length > 0, 'Specify the verified catalogue keys to archive');
const verified = JSON.parse(await readFile(resolve(root, 'normalized/live-verification.json'), 'utf8'));
await mkdir(destination, { recursive: true });
const manifest = [];
for (const key of keys) {
  assert.match(key, /^[A-Z_]+$/);
  const receipt = JSON.parse(await readFile(resolve(root, 'normalized', `${key}-publish-receipt.json`), 'utf8'));
  const check = verified.find(row => row.catalog === key);
  assert.equal(check?.snapshotId, receipt.snapshotId, `${key} must be live-verified`);
  const rows = JSON.parse(await readFile(resolve(root, 'normalized', `${key}.json`), 'utf8'));
  assert.equal(rows.length, check.verifiedProducts);
  const json = JSON.stringify(rows);
  assert.ok(!/SUPABASE_SECRET_KEY|nvapi-|"password"\s*:|csrf_token/i.test(json), 'Do not archive secrets');
  const file = `${key}.json.gz`;
  await writeFile(resolve(destination, file), gzipSync(json, { level: 9 }));
  manifest.push({ catalog: key, products: rows.length, file,
    sha256: createHash('sha256').update(json).digest('hex'),
    snapshotId: receipt.snapshotId, verifiedAt: check.verifiedAt,
    capturedFrom: rows.map(r => r.imported_at).sort()[0],
    capturedUntil: rows.map(r => r.imported_at).sort().at(-1),
    zeroStockProducts: rows.filter(r => r.stock_units === 0).length,
    stockUnitsOrPortalMinimum: rows.reduce((sum, row) => sum + row.stock_units, 0)
  });
}
await writeFile(resolve(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ archived: manifest.length, products: manifest.reduce((sum, row) => sum + row.products, 0) }));
