import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseSupplierTyreImageKeys } from '../supplierTyreImageKeys.mjs';

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
};

const rawInput = argument('--raw');
const snapshotInput = argument('--snapshot');
const reportOutput = argument('--report');
const shouldImport = process.argv.includes('--import');
if (!rawInput || !snapshotInput || !reportOutput) {
  throw new Error('Usage: --raw <portal-images.json> --snapshot <snapshot.json> --report <report.json> [--import]');
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://moiybakshvuvppesbnpt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_CmagmxnGcxu9bGWdwWfwjQ_2y_ZXw9j';
const IMPORT_TOKEN = process.env.SUPPLIER_IMAGE_IMPORT_TOKEN;
const SUPPLIER = 'SAFETY GRIP';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const token = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, '');
const parseMoney = (value) => Number(String(value ?? '').replace(/[^0-9.-]+/g, '')) || 0;
const parseStock = (value) => Math.max(0, Math.trunc(Number(String(value ?? '').replace(/[^0-9-]+/g, '')) || 0));
const logicalImageId = (brand, pattern) => createHash('sha1')
  .update(`${SUPPLIER}|${brand}|${pattern}`)
  .digest('hex')
  .slice(0, 24);

if (shouldImport && !IMPORT_TOKEN) throw new Error('SUPPLIER_IMAGE_IMPORT_TOKEN is required when --import is used.');

const rawRows = JSON.parse(await readFile(resolve(rawInput), 'utf8'));
const snapshotRows = JSON.parse(await readFile(resolve(snapshotInput), 'utf8'));
if (!Array.isArray(rawRows) || !Array.isArray(snapshotRows)) throw new Error('Inputs must be JSON arrays.');

const snapshotByIdentity = new Map();
for (const row of snapshotRows) {
  const key = `${clean(row.product_name)}|${Number(row.cost_price) || 0}|${Number(row.stock_units) || 0}`;
  const rows = snapshotByIdentity.get(key) || [];
  rows.push(row);
  snapshotByIdentity.set(key, rows);
}

const candidates = [];
for (const raw of rawRows) {
  const key = `${clean(raw.name)}|${parseMoney(raw.price)}|${parseStock(raw.stock)}`;
  const matchingRows = snapshotByIdentity.get(key) || [];
  const item = matchingRows.shift();
  if (!item || item.product_type !== 'TYRE' || !raw.imageData || !item.brand || !item.tyre_pattern) continue;
  const imageKeys = parseSupplierTyreImageKeys(item.brand, item.tyre_pattern);
  if (!imageKeys.designKey || !imageKeys.finishKey) continue;
  candidates.push({ raw, item, imageKeys });
}

const chosenByPattern = new Map();
for (const candidate of candidates) {
  const key = `${candidate.imageKeys.finishKey}|${candidate.imageKeys.designKey}`;
  if (!chosenByPattern.has(key)) chosenByPattern.set(key, candidate);
}
const chosen = [...chosenByPattern.values()];

const importOne = async (candidate) => {
  const id = logicalImageId(candidate.imageKeys.finishKey, candidate.imageKeys.designKey);
  const payload = {
    supplier: SUPPLIER,
    source: 'safety-grip-live-portal',
    sourceFileId: `safety-grip-live-portal:${id}`,
    fileName: `safety-grip-${id}.jpg`,
    storagePath: `tyres/safety-grip-live-portal/${id}.jpg`,
    mimeType: 'image/jpeg',
    designKey: candidate.imageKeys.designKey,
    finishKey: candidate.imageKeys.finishKey,
    tags: ['safety-grip', 'live-portal', candidate.item.brand, candidate.item.tyre_pattern]
  };
  const response = await fetch(`${SUPABASE_URL}/functions/v1/import-supplier-stock-image`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'x-supplier-image-import-token': IMPORT_TOKEN
    },
    body: JSON.stringify({ ...payload, base64: candidate.raw.imageData })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) throw new Error(body.error || `HTTP ${response.status}`);
  return { sourceFileId: payload.sourceFileId, product: candidate.item.product_name, ...body };
};

const results = [];
const failures = [];
if (shouldImport) {
  for (const candidate of chosen) {
    try {
      results.push(await importOne(candidate));
    } catch (error) {
      failures.push({ product: candidate.item.product_name, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

const report = {
  supplier: SUPPLIER,
  capturedImages: rawRows.length,
  matchedTyreImages: candidates.length,
  distinctPatternImages: chosen.length,
  imported: results.length,
  failures,
  samples: chosen.slice(0, 12).map(({ item, imageKeys }) => ({ product: item.product_name, ...imageKeys }))
};
await writeFile(resolve(reportOutput), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
