import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const loadLocalEnv = async () => {
  const envPath = resolve('.env.local');
  if (!existsSync(envPath)) return;
  const text = await readFile(envPath, 'utf8');
  text.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) return;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
};

await loadLocalEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://moiybakshvuvppesbnpt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_CmagmxnGcxu9bGWdwWfwjQ_2y_ZXw9j';
const IMPORT_TOKEN = process.env.WHEEL_CATALOG_IMPORT_TOKEN;
const REPORT_PATH = resolve(process.env.WHEEL_CATALOG_ANALYSIS_JSON || 'reports/wheel-catalog-image-analysis-v2.json');
const ANALYSIS_MODEL = process.env.WHEEL_CATALOG_ANALYSIS_MODEL || 'gemini-3.1-flash-lite';
const BATCH_SIZE = Math.min(50, Math.max(1, Number.parseInt(process.env.WHEEL_CATALOG_ANALYSIS_IMPORT_BATCH_SIZE || '40', 10)));

if (!IMPORT_TOKEN) {
  console.error('Missing WHEEL_CATALOG_IMPORT_TOKEN.');
  process.exit(1);
}

const report = JSON.parse(await readFile(REPORT_PATH, 'utf8'));
const items = Array.isArray(report.items) ? report.items : [];
if (items.length === 0) {
  console.error(`No analysis records found in ${REPORT_PATH}.`);
  process.exit(1);
}

const chunk = (values, size) => {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
};

const requestBatch = async (batch, attempt = 1) => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/import-wheel-catalog-local`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'x-wheel-catalog-import-token': IMPORT_TOKEN
    },
    body: JSON.stringify({
      action: 'enrich-batch',
      items: batch.map((item) => ({
        driveFileId: item.driveFileId,
        imageOcrText: item.visibleText || null,
        imageSpecText: item.wheelSpecs || null,
        tags: item.searchTags ?? [],
        status: 'completed',
        brand: item.brand || null,
        model: item.model || null,
        pcdAliases: item.pcdAliases ?? [],
        wheelSize: item.size || null,
        width: item.width || null,
        finish: item.finish || null,
        colour: item.colour || null,
        offset: item.offset || null,
        centerBore: item.centerBore || null,
        loadRating: item.loadRating || null,
        vehicleHints: item.vehicleHints ?? [],
        confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : null,
        needsReview: Boolean(item.needsReview),
        reviewReason: item.reviewReason || null,
        analysisModel: ANALYSIS_MODEL
      }))
    })
  });

  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text };
  }

  if ((!response.ok || body.ok === false) && attempt < 3 && response.status >= 500) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000 * attempt));
    return requestBatch(batch, attempt + 1);
  }

  if (!response.ok || body.ok === false) {
    throw new Error(body.error || JSON.stringify(body.errors || body) || `HTTP ${response.status}`);
  }

  return body;
};

let completed = 0;
for (const batch of chunk(items, BATCH_SIZE)) {
  const result = await requestBatch(batch);
  completed += Number(result.completed ?? batch.length);
  console.log(`Imported ${completed}/${items.length} analysis records.`);
}

console.log(JSON.stringify({ ok: true, imported: completed, reportPath: REPORT_PATH }, null, 2));
