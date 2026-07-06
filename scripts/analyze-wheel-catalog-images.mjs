import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GoogleGenAI } from '@google/genai';

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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;
const MODEL = process.env.WHEEL_CATALOG_ANALYSIS_MODEL || 'gemini-2.5-flash';
const LIMIT = Number.parseInt(process.env.WHEEL_CATALOG_ANALYSIS_LIMIT || '0', 10);
const CONCURRENCY = Math.max(1, Number.parseInt(process.env.WHEEL_CATALOG_ANALYSIS_CONCURRENCY || '2', 10));
const PAGE_SIZE = 1000;

if (!IMPORT_TOKEN) {
  console.error('Missing WHEEL_CATALOG_IMPORT_TOKEN.');
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY or API_KEY for image analysis.');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const supabaseFetch = async (path, options = {}) => {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...(options.headers ?? {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(body?.message || body?.error || `Supabase request failed with HTTP ${response.status}`);
  }
  return body;
};

const fetchRows = async () => {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await supabaseFetch(
      `/rest/v1/wheel_catalog_items?select=id,drive_file_id,file_name,folder_path,rim_size,pcd,tags,public_image_url,mime_type,image_analysis_status&active=eq.true&order=folder_path.asc,file_name.asc`,
      {
        headers: {
          Range: `${from}-${from + PAGE_SIZE - 1}`
        }
      }
    );
    rows.push(...page);
    if (!page.length || page.length < PAGE_SIZE) break;
  }
  return rows.filter((row) => row.image_analysis_status !== 'completed');
};

const responseText = (response) => {
  if (typeof response.text === 'function') return response.text();
  return response.text ?? '';
};

const extractJson = (value) => {
  const text = String(value || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced || text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(raw.slice(start, end + 1));
  }
  return { visibleText: raw, wheelSpecs: raw, tags: [] };
};

const imageToInlineData = async (url, mimeType) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image download failed with HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return {
    mimeType: mimeType || response.headers.get('content-type') || 'image/jpeg',
    data: btoa(binary)
  };
};

const analyzeRow = async (row) => {
  const inlineData = await imageToInlineData(row.public_image_url, row.mime_type);
  const prompt = [
    'Analyze this wheel catalog image for searchable text.',
    'Extract visible model codes, wheel sizes, widths, offsets, PCDs, center bore, load rating, brand marks, and finish/colour words if visible.',
    'Return compact JSON only with keys: visibleText, wheelSpecs, tags.',
    'Use short uppercase tags. Do not invent specs that are not visible.'
  ].join('\n');

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: {
      parts: [
        { text: prompt },
        { inlineData }
      ]
    }
  });
  const parsed = extractJson(await responseText(response));
  const tags = Array.from(new Set([
    ...(row.tags ?? []),
    ...(Array.isArray(parsed.tags) ? parsed.tags : []),
    row.rim_size ? `${row.rim_size}IN` : '',
    row.pcd ?? ''
  ].map((tag) => String(tag).trim().toUpperCase()).filter(Boolean)));

  const enrichResponse = await fetch(`${SUPABASE_URL}/functions/v1/import-wheel-catalog-local`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'x-wheel-catalog-import-token': IMPORT_TOKEN
    },
    body: JSON.stringify({
      action: 'enrich',
      driveFileId: row.drive_file_id,
      imageOcrText: String(parsed.visibleText ?? '').trim(),
      imageSpecText: String(parsed.wheelSpecs ?? '').trim(),
      tags,
      status: 'completed'
    })
  });

  const enrichBody = await enrichResponse.json().catch(() => ({}));
  if (!enrichResponse.ok || enrichBody.ok === false) {
    throw new Error(enrichBody.error || `Enrich failed with HTTP ${enrichResponse.status}`);
  }
};

let rows = await fetchRows();
if (LIMIT > 0) rows = rows.slice(0, LIMIT);

console.log(`Found ${rows.length} wheel catalog image(s) to analyze.`);
console.log(`Model: ${MODEL}`);
console.log(`Concurrency: ${CONCURRENCY}`);

let completed = 0;
let failed = 0;
let nextIndex = 0;

const worker = async () => {
  while (nextIndex < rows.length) {
    const index = nextIndex;
    nextIndex += 1;
    const row = rows[index];
    try {
      await analyzeRow(row);
      completed += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed ${row.folder_path}/${row.file_name}: ${error.message}`);
    }
    if ((completed + failed) % 10 === 0 || completed + failed === rows.length) {
      console.log(`Analyzed ${completed + failed}/${rows.length} (${failed} failed)`);
    }
  }
};

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => worker()));

console.log(JSON.stringify({ ok: failed === 0, completed, failed }, null, 2));
process.exit(failed === 0 ? 0 : 1);
