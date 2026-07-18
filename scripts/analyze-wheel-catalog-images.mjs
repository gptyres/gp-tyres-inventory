import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || process.env.NVAPI_KEY;
const PROVIDER = (process.env.WHEEL_CATALOG_ANALYSIS_PROVIDER || (NVIDIA_API_KEY ? 'nvidia' : 'gemini')).toLowerCase();
const MODEL = process.env.WHEEL_CATALOG_ANALYSIS_MODEL || (
  PROVIDER === 'nvidia'
    ? 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'
    : 'gemini-2.5-flash'
);
const NVIDIA_INVOKE_URL = process.env.NVIDIA_INVOKE_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MAX_TOKENS = Number.parseInt(process.env.NVIDIA_MAX_TOKENS || '65536', 10);
const NVIDIA_REASONING_BUDGET = Number.parseInt(process.env.NVIDIA_REASONING_BUDGET || '16384', 10);
const NVIDIA_REQUEST_TIMEOUT_MS = Math.max(10000, Number.parseInt(process.env.NVIDIA_REQUEST_TIMEOUT_MS || '180000', 10));
const LIMIT = Number.parseInt(process.env.WHEEL_CATALOG_ANALYSIS_LIMIT || '0', 10);
const CONCURRENCY = Math.max(1, Number.parseInt(process.env.WHEEL_CATALOG_ANALYSIS_CONCURRENCY || '2', 10));
const DELAY_MS = Math.max(0, Number.parseInt(process.env.WHEEL_CATALOG_ANALYSIS_DELAY_MS || '0', 10));
const REQUEST_INTERVAL_MS = Math.max(0, Number.parseInt(process.env.WHEEL_CATALOG_ANALYSIS_REQUEST_INTERVAL_MS || '0', 10));
const SHARD_COUNT = Math.max(1, Number.parseInt(process.env.WHEEL_CATALOG_ANALYSIS_SHARD_COUNT || '1', 10));
const SHARD_INDEX = Math.max(0, Number.parseInt(process.env.WHEEL_CATALOG_ANALYSIS_SHARD_INDEX || '0', 10));
const PENDING_ONLY = process.env.WHEEL_CATALOG_ANALYSIS_PENDING_ONLY === '1';
const ENRICH_SUPABASE = process.env.WHEEL_CATALOG_ANALYSIS_ENRICH_SUPABASE !== '0';
const JSON_REPORT_PATH = resolve(process.env.WHEEL_CATALOG_ANALYSIS_JSON || 'reports/wheel-catalog-image-analysis.json');
const CSV_REPORT_PATH = resolve(process.env.WHEEL_CATALOG_ANALYSIS_CSV || 'reports/wheel-catalog-image-analysis.csv');
const CHECKPOINT_EVERY = Math.max(1, Number.parseInt(process.env.WHEEL_CATALOG_ANALYSIS_CHECKPOINT_EVERY || '25', 10));
const WAIT_ON_QUOTA = process.env.WHEEL_CATALOG_ANALYSIS_WAIT_ON_QUOTA === '1';
const SOURCE_ROOT_FOLDER_ID = process.env.WHEEL_CATALOG_SOURCE_ROOT_FOLDER_ID || '15MhCztz6IvUXem2okdZkd13zHtdvzCKx';
const PAGE_SIZE = 1000;

const ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    brand: { type: 'string' },
    model: { type: 'string' },
    pcd: { type: 'string' },
    pcdAliases: { type: 'array', items: { type: 'string' } },
    size: { type: 'string' },
    diameter: { type: 'string' },
    width: { type: 'string' },
    finish: { type: 'string' },
    colour: { type: 'string' },
    offset: { type: 'string' },
    centerBore: { type: 'string' },
    loadRating: { type: 'string' },
    vehicleHints: { type: 'array', items: { type: 'string' } },
    visibleText: { type: 'string' },
    wheelSpecs: { type: 'string' },
    searchTags: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    needsReview: { type: 'boolean' },
    reviewReason: { type: 'string' }
  },
  required: [
    'brand', 'model', 'pcd', 'pcdAliases', 'size', 'diameter', 'width',
    'finish', 'colour', 'offset', 'centerBore', 'loadRating', 'vehicleHints',
    'visibleText', 'wheelSpecs', 'searchTags', 'confidence', 'needsReview',
    'reviewReason'
  ]
};

if (!IMPORT_TOKEN) {
  console.error('Missing WHEEL_CATALOG_IMPORT_TOKEN.');
  process.exit(1);
}

if (PROVIDER === 'gemini' && !GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY or API_KEY for image analysis.');
  process.exit(1);
}

if (PROVIDER === 'nvidia' && !NVIDIA_API_KEY) {
  console.error('Missing NVIDIA_API_KEY or NVAPI_KEY for image analysis.');
  process.exit(1);
}

const ai = PROVIDER === 'gemini' ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

class QuotaExhaustedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QuotaExhaustedError';
  }
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let nextRequestAt = 0;

const reserveRequestSlot = async () => {
  if (!REQUEST_INTERVAL_MS) return;
  const now = Date.now();
  const requestAt = Math.max(now, nextRequestAt);
  nextRequestAt = requestAt + REQUEST_INTERVAL_MS;
  if (requestAt > now) await sleep(requestAt - now);
};

const isQuotaError = (error) => {
  const message = String(error?.message ?? error ?? '');
  return message.includes('RESOURCE_EXHAUSTED')
    || message.toLowerCase().includes('quota exceeded')
    || message.includes('429')
    || message.toLowerCase().includes('rate limit');
};

const summarizeQuotaError = (error) => {
  const message = String(error?.message ?? error ?? '');
  const limit = message.match(/limit:\s*([^,\n]+)/i)?.[1]?.trim();
  const retry = message.match(/retry in\s*([^.]+\w)/i)?.[1]?.trim();
  return [
    'Gemini quota reached; stopping so pending images can be resumed later.',
    limit ? `Limit: ${limit}.` : '',
    retry ? `Retry: ${retry}.` : ''
  ].filter(Boolean).join(' ');
};

const quotaRetryDelayMs = (error) => {
  const message = String(error?.message ?? error ?? '');
  const retrySeconds = message.match(/retryDelay["']?\s*:\s*["']?(\d+)s/i)?.[1]
    ?? message.match(/retry in\s*(\d+)\s*s/i)?.[1]
    ?? message.match(/Retry:\s*(\d+)/i)?.[1];
  return Math.max(15000, Number.parseInt(retrySeconds || '60', 10) * 1000);
};

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
      `/rest/v1/wheel_catalog_items?select=id,source_root_folder_id,drive_file_id,file_name,folder_path,local_relative_path,drive_url,rim_size,pcd,tags,public_image_url,mime_type,image_analysis_status&active=eq.true&source_root_folder_id=eq.${encodeURIComponent(SOURCE_ROOT_FOLDER_ID)}&order=folder_path.asc,file_name.asc`,
      {
        headers: {
          Range: `${from}-${from + PAGE_SIZE - 1}`
        }
      }
    );
    rows.push(...page);
    if (!page.length || page.length < PAGE_SIZE) break;
  }
  return PENDING_ONLY ? rows.filter((row) => row.image_analysis_status !== 'completed') : rows;
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

const normalizePcd = (value) => {
  const text = String(value ?? '').toUpperCase().replace(/\//g, 'X').replace(/\s+/g, '');
  const match = text.match(/\b([456])X?(\d{3}(?:\.\d)?)\b/);
  return match ? `${match[1]}X${match[2]}` : '';
};

const roundedPcdAlias = (pcd) => {
  if (!pcd.includes('.')) return '';
  return pcd.replace(/\.3$/, '').replace(/\.7$/, '');
};

const extractPcds = (...values) => {
  const text = values.flat().map((value) => String(value ?? '')).join(' ').toUpperCase().replace(/×/g, 'X');
  const matches = [];

  for (const match of text.matchAll(/\b(8|10|12)\s*X\s*(\d{3}(?:\.\d)?)\s*[\/]\s*(\d{3}(?:\.\d)?)/g)) {
    const studs = Number(match[1]) / 2;
    matches.push(`${studs}X${match[2]}`, `${studs}X${match[3]}`);
  }

  for (const match of text.matchAll(/\b([456])\s*[X\/]\s*(\d{3}(?:\.\d)?)/g)) {
    matches.push(`${match[1]}X${match[2]}`);
  }

  return uniqueStrings(matches);
};

const normalizeSize = (value) => String(value ?? '').toUpperCase().replace(/\s+/g, '').replace(/×/g, 'X');

const deriveDiameter = (size, row) => {
  const sizeMatch = String(size || '').match(/\b(1[3-9]|2[0-6])\b/);
  if (sizeMatch) return sizeMatch[1];
  return row.rim_size ? String(row.rim_size) : '';
};

const deriveWidth = (size) => {
  const match = String(size || '').match(/X(\d+(?:\.\d+)?J?)/i);
  return match ? match[1].toUpperCase().replace(/J?$/, 'J') : '';
};

const uniqueStrings = (values) => Array.from(new Set(
  values.map((value) => String(value ?? '').trim()).filter(Boolean)
));

const buildRecord = (row, parsed) => {
  const sourcePath = row.local_relative_path || [row.folder_path, row.file_name].filter(Boolean).join('/');
  const parsedPcd = normalizePcd(parsed.pcd);
  const folderPcd = normalizePcd(row.pcd);
  const detectedPcds = extractPcds(
    parsed.pcd,
    parsed.pcdAliases,
    parsed.visibleText,
    parsed.wheelSpecs,
    parsed.searchTags
  );
  const pcd = folderPcd || parsedPcd || detectedPcds[0] || '';
  const pcdAliases = uniqueStrings([
    ...(Array.isArray(parsed.pcdAliases) ? parsed.pcdAliases.map(normalizePcd) : []),
    ...detectedPcds,
    roundedPcdAlias(pcd)
  ]).filter((value) => value && value !== pcd);
  const size = normalizeSize(parsed.size || parsed.wheelSize || '');
  const diameter = deriveDiameter(size, row);
  const width = normalizeSize(parsed.width || deriveWidth(size));
  const visibleText = String(parsed.visibleText ?? '').trim();
  const wheelSpecs = String(parsed.wheelSpecs ?? '').trim();
  const confidence = Number.isFinite(Number(parsed.confidence))
    ? Math.max(0, Math.min(1, Number(parsed.confidence)))
    : 0;
  const reviewReason = String(parsed.reviewReason ?? '').trim();
  const hasActionableModelReview = Boolean(parsed.needsReview) && (
    !reviewReason
    || /pcd|size|ocr|unclear|blurr|multiple|conflict|differs|cut off|catalog sheet/i.test(reviewReason)
  );
  const needsReviewReasons = uniqueStrings([
    hasActionableModelReview ? (reviewReason || 'Image marked for review') : '',
    !pcd ? 'PCD not visible or present in folder path' : '',
    !size && !diameter ? 'Size not visible or present in folder path' : '',
    parsedPcd && folderPcd && parsedPcd !== folderPcd && roundedPcdAlias(parsedPcd) !== folderPcd ? `Folder PCD ${folderPcd} differs from image PCD ${parsedPcd}` : '',
    confidence > 0 && confidence < 0.65 ? `Low analysis confidence (${confidence.toFixed(2)})` : ''
  ]);
  const tags = uniqueStrings([
    ...(Array.isArray(row.tags) ? row.tags : []),
    ...(Array.isArray(parsed.searchTags) ? parsed.searchTags : []),
    ...(Array.isArray(parsed.tags) ? parsed.tags : []),
    parsed.brand,
    parsed.model,
    pcd,
    ...pcdAliases,
    size,
    diameter,
    width,
    parsed.finish,
    parsed.colour || parsed.color,
    row.folder_path,
    row.file_name?.replace(/\.[^.]+$/, '')
  ]).map((tag) => tag.toUpperCase());

  return {
    driveFileId: row.drive_file_id || '',
    sourcePath,
    fileName: row.file_name || '',
    brand: String(parsed.brand ?? '').trim(),
    model: String(parsed.model ?? '').trim(),
    pcd,
    pcdAliases,
    size,
    diameter,
    width,
    finish: String(parsed.finish ?? '').trim(),
    colour: String(parsed.colour ?? parsed.color ?? '').trim(),
    offset: String(parsed.offset ?? '').trim(),
    centerBore: String(parsed.centerBore ?? parsed.centreBore ?? '').trim(),
    loadRating: String(parsed.loadRating ?? '').trim(),
    vehicleHints: Array.isArray(parsed.vehicleHints) ? uniqueStrings(parsed.vehicleHints) : [],
    visibleText,
    wheelSpecs,
    searchTags: tags,
    confidence,
    needsReview: needsReviewReasons.length > 0,
    reviewReason: needsReviewReasons.join('; ')
  };
};

const csvEscape = (value) => {
  const text = Array.isArray(value) ? value.join('|') : String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toCsv = (items) => {
  const columns = [
    ['Drive File ID', 'driveFileId'],
    ['Source Path', 'sourcePath'],
    ['File Name', 'fileName'],
    ['Brand', 'brand'],
    ['Model', 'model'],
    ['PCD', 'pcd'],
    ['PCD Aliases', 'pcdAliases'],
    ['Size', 'size'],
    ['Diameter', 'diameter'],
    ['Width', 'width'],
    ['Finish', 'finish'],
    ['Colour', 'colour'],
    ['Offset', 'offset'],
    ['Center Bore', 'centerBore'],
    ['Load Rating', 'loadRating'],
    ['Vehicle Hints', 'vehicleHints'],
    ['Visible Text', 'visibleText'],
    ['Wheel Specs', 'wheelSpecs'],
    ['Search Tags', 'searchTags'],
    ['Confidence', 'confidence'],
    ['Needs Review', 'needsReview'],
    ['Review Reason', 'reviewReason']
  ];
  return [
    columns.map(([label]) => csvEscape(label)).join(','),
    ...items.map((item) => columns.map(([, key]) => csvEscape(item[key])).join(','))
  ].join('\n');
};

const writeReports = async (items, summary) => {
  await mkdir(dirname(JSON_REPORT_PATH), { recursive: true });
  await mkdir(dirname(CSV_REPORT_PATH), { recursive: true });
  await writeFile(JSON_REPORT_PATH, JSON.stringify({
    catalogSource: 'Google Drive Wheel Catalog',
    folderUrl: 'https://drive.google.com/drive/folders/15MhCztz6IvUXem2okdZkd13zHtdvzCKx?usp=drive_link',
    generatedAt: new Date().toISOString(),
    summary,
    items
  }, null, 2));
  await writeFile(CSV_REPORT_PATH, toCsv(items));
};

const loadExistingReportItems = async () => {
  if (!existsSync(JSON_REPORT_PATH)) return [];
  try {
    const report = JSON.parse(await readFile(JSON_REPORT_PATH, 'utf8'));
    if (!Array.isArray(report.items)) return [];
    return Array.from(new Map(
      report.items
        .filter((item) => item?.driveFileId)
        .map((item) => [item.driveFileId, item])
    ).values());
  } catch {
    return [];
  }
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

const imageToDataUrl = async (url, mimeType) => {
  const inlineData = await imageToInlineData(url, mimeType);
  return {
    mimeType: inlineData.mimeType,
    dataUrl: `data:${inlineData.mimeType};base64,${inlineData.data}`
  };
};

const analyzeWithGemini = async (prompt, inlineData) => {
  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: {
        parts: [
          { text: prompt },
          { inlineData }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: ANALYSIS_JSON_SCHEMA,
        temperature: 0.1
      }
    });
  } catch (error) {
    if (isQuotaError(error)) {
      throw new QuotaExhaustedError(summarizeQuotaError(error));
    }
    throw error;
  }
  return responseText(response);
};

const analyzeWithNvidia = async (prompt, imageUrl) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NVIDIA_REQUEST_TIMEOUT_MS);
  const response = await fetch(NVIDIA_INVOKE_URL, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${NVIDIA_API_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
      temperature: 0.6,
      top_p: 0.95,
      max_tokens: NVIDIA_MAX_TOKENS,
      reasoning_budget: NVIDIA_REASONING_BUDGET,
      chat_template_kwargs: { enable_thinking: true },
      stream: false
    })
  }).finally(() => clearTimeout(timeout));

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || text || `NVIDIA request failed with HTTP ${response.status}`;
    if (isQuotaError(`${response.status} ${message}`)) {
      throw new QuotaExhaustedError(message);
    }
    throw new Error(message);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part === 'string' ? part : part?.text ?? '')
      .filter(Boolean)
      .join('\n');
  }
  return text;
};

const analyzeRow = async (row) => {
  const prompt = [
    'You are analyzing one GP Tyres and Mags wheel catalog image.',
    'Use OCR and visual inspection to extract searchable inventory data.',
    'Use visible image text first, then image content, then file name and folder path.',
    `File name: ${row.file_name}`,
    `Folder path: ${row.folder_path || ''}`,
    `Known catalog PCD from folder: ${row.pcd || ''}`,
    `Known catalog diameter from folder: ${row.rim_size || ''}`,
    'Do not guess missing specs. If a field is not visible or confidently present in the filename/folder path, return an empty string and set needsReview true.',
    'GP Tyres and Mags branding or a GP logo is a catalog watermark, not the wheel brand. Never return GP Tyres and Mags as brand unless the image explicitly labels it as the wheel manufacturer.',
    'Only set needsReview true for missing PCD/size, unclear OCR, multiple PCDs, source conflicts, multi-wheel catalog sheets, cropped specs, or blurry text. Missing optional fields such as load rating alone do not require review.',
    'Return JSON only with these keys: brand, model, pcd, pcdAliases, size, diameter, width, finish, colour, offset, centerBore, loadRating, vehicleHints, visibleText, wheelSpecs, searchTags, confidence, needsReview, reviewReason.'
  ].join('\n');

  await reserveRequestSlot();
  const response = PROVIDER === 'nvidia'
    ? await analyzeWithNvidia(prompt, (await imageToDataUrl(row.public_image_url, row.mime_type)).dataUrl)
    : await analyzeWithGemini(prompt, await imageToInlineData(row.public_image_url, row.mime_type));
  const parsed = extractJson(response);
  const record = buildRecord(row, parsed);

  if (ENRICH_SUPABASE) {
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
        imageOcrText: record.visibleText,
        imageSpecText: JSON.stringify(record),
        tags: record.searchTags,
        status: 'completed'
      })
    });

    const enrichBody = await enrichResponse.json().catch(() => ({}));
    if (!enrichResponse.ok || enrichBody.ok === false) {
      console.warn(`Supabase enrich skipped for ${row.folder_path}/${row.file_name}: ${enrichBody.error || `HTTP ${enrichResponse.status}`}`);
    }
  }

  return record;
};

const existingItems = await loadExistingReportItems();
const existingDriveFileIds = new Set(existingItems.map((item) => item.driveFileId).filter(Boolean));
let rows = (await fetchRows()).filter((row) => !existingDriveFileIds.has(row.drive_file_id));
if (SHARD_COUNT > 1) {
  if (SHARD_INDEX >= SHARD_COUNT) {
    console.error(`Shard index ${SHARD_INDEX} must be lower than shard count ${SHARD_COUNT}.`);
    process.exit(1);
  }
  rows = rows.filter((_, index) => index % SHARD_COUNT === SHARD_INDEX);
}
if (LIMIT > 0) rows = rows.slice(0, LIMIT);

console.log(`Found ${rows.length} wheel catalog image(s) to analyze.`);
console.log(`Provider: ${PROVIDER}`);
console.log(`Model: ${MODEL}`);
console.log(`Concurrency: ${CONCURRENCY}`);
console.log(`Mode: ${PENDING_ONLY ? 'pending rows only' : 'all active rows'}`);
console.log(`Supabase enrich: ${ENRICH_SUPABASE ? 'enabled' : 'disabled'}`);
console.log(`Resuming with ${existingDriveFileIds.size} existing analyzed record(s).`);
console.log(`Shard: ${SHARD_INDEX + 1}/${SHARD_COUNT}`);
if (DELAY_MS) console.log(`Delay between worker jobs: ${DELAY_MS}ms`);
if (REQUEST_INTERVAL_MS) console.log(`Minimum interval between model requests: ${REQUEST_INTERVAL_MS}ms`);

let completed = 0;
let failed = 0;
let stoppedForQuota = false;
let quotaMessage = '';
let nextIndex = 0;
const analyzedItems = [...existingItems];
let reportWrite = Promise.resolve();

const currentSummary = () => ({
  ok: failed === 0 && !stoppedForQuota,
  completed,
  failed,
  stoppedForQuota,
  quotaMessage,
  needsReview: analyzedItems.filter((item) => item.needsReview).length
});

const checkpointReports = () => {
  reportWrite = reportWrite.then(() => writeReports(analyzedItems, currentSummary()));
  return reportWrite;
};

const worker = async () => {
  while (nextIndex < rows.length) {
    if (stoppedForQuota) break;
    const index = nextIndex;
    nextIndex += 1;
    const row = rows[index];
    let settled = false;
    while (!settled && !stoppedForQuota) {
      try {
        const record = await analyzeRow(row);
        analyzedItems.push(record);
        completed += 1;
        settled = true;
        if (completed % CHECKPOINT_EVERY === 0) {
          await checkpointReports();
        }
      } catch (error) {
        if (error instanceof QuotaExhaustedError) {
          if (WAIT_ON_QUOTA) {
            const waitMs = quotaRetryDelayMs(error);
            console.warn(`${error.message} Waiting ${Math.round(waitMs / 1000)}s before retrying this image.`);
            await checkpointReports();
            await sleep(waitMs);
            continue;
          }
          stoppedForQuota = true;
          quotaMessage = error.message;
          console.warn(quotaMessage);
          break;
        }
        failed += 1;
        settled = true;
        console.error(`Failed ${row.folder_path}/${row.file_name}: ${error.message}`);
      }
    }
    if ((completed + failed) % 10 === 0 || completed + failed === rows.length) {
      console.log(`Analyzed ${completed + failed}/${rows.length} (${failed} failed)`);
    }
    if (DELAY_MS && !stoppedForQuota) await sleep(DELAY_MS);
  }
};

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => worker()));

const summary = currentSummary();
await checkpointReports();
console.log(`Wrote JSON report: ${JSON_REPORT_PATH}`);
console.log(`Wrote CSV report: ${CSV_REPORT_PATH}`);
console.log(JSON.stringify(summary, null, 2));
process.exit(failed === 0 || stoppedForQuota ? 0 : 1);
