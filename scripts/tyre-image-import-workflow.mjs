import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BUCKET_NAME = 'supplier-stock-images';
export const DEFAULT_BATCH_SIZE = 25;
export const DEFAULT_MANIFEST_PATH = 'reports/tyre-image-import-batches.json';
export const DEFAULT_REPORT_PATH = 'reports/tyre-image-import-report.json';
export const DEFAULT_REVIEW_PATH = 'reports/tyre-image-import-review.html';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://moiybakshvuvppesbnpt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_CmagmxnGcxu9bGWdwWfwjQ_2y_ZXw9j';
const IMPORT_TOKEN = process.env.SUPPLIER_IMAGE_IMPORT_TOKEN;
const IMPORT_FUNCTION_SLUG = process.env.SUPPLIER_IMAGE_IMPORT_FUNCTION || 'import-supplier-stock-image';

const RAW_SUPPLIERS = [
  { supplier: 'SAILUN', file: 'supplier_data/sailunData.ts', parser: 'sailun' },
  { supplier: 'EXCLUSIVE TYRES', file: 'supplier_data/exclusiveTyresData.ts', parser: 'exclusive' },
  { supplier: 'TYREWAREHOUSE', file: 'supplier_data/tyreWarehouseData.ts', parser: 'warehouse' },
  { supplier: 'ATT', file: 'supplier_data/attData.ts', parser: 'simple' },
  { supplier: 'SAFETY GRIP', file: 'supplier_data/safetygripData.ts', parser: 'safetyGrip' },
  { supplier: 'STAMFORD', file: 'supplier_data/stamfordData.ts', parser: 'stamford' },
  { supplier: 'APEX', file: 'supplier_data/apexData.ts', parser: 'simple' },
  { supplier: 'TUBESTONE', file: 'supplier_data/tubestoneData.ts', parser: 'tubestone' },
  { supplier: 'TREAD ZONE', file: 'supplier_data/treadZoneData.ts', parser: 'branchRows' },
  { supplier: 'SUMITOMO/DUNLOP', file: 'supplier_data/sumitomoDunlopData.ts', parser: 'branchRows' },
  { supplier: 'TREADS UNLIMITED', file: 'supplier_data/treadsUnlimitedData.ts', parser: 'treads' },
  { supplier: 'TYRE LIFE', file: 'supplier_data/tyreLifeData.ts', parser: 'tyreLife' }
];

const STATUS_PRIORITY = new Set(['pending', 'failed']);

export const normalizeToken = (value = '') => (
  String(value)
    .normalize('NFKD')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const slugify = (value = '') => normalizeToken(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const parseCsvLine = (line) => {
  const result = [];
  let current = '';
  let inQuote = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuote && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuote = !inQuote;
      }
    } else if (char === ',' && !inQuote) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
};

const parseStockUnits = (value = '') => {
  if (/\d+\s*\+/i.test(value)) return Number.parseInt(value.match(/\d+/)?.[0] ?? '0', 10);
  return Number.parseInt(String(value).match(/-?\d+/)?.[0] ?? '0', 10) || 0;
};

const splitBrandPattern = (brandPattern, fallbackBrand) => {
  const cleaned = String(brandPattern || '').replace(/\s+/g, ' ').trim();
  const dashParts = cleaned.split(/\s+-\s+/);
  if (dashParts.length > 1) {
    return {
      brand: dashParts[0].trim() || fallbackBrand,
      pattern: dashParts.slice(1).join(' - ').replace(/^TYRES\s+/i, '').trim() || 'Standard'
    };
  }

  const parts = cleaned.split(' ').filter(Boolean);
  return {
    brand: parts[0] || fallbackBrand,
    pattern: parts.slice(1).join(' ') || 'Standard'
  };
};

const normalizeExclusiveTyrePattern = (brand, pattern) => {
  const brandKey = String(brand || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let cleaned = String(pattern || '')
    .replace(/\bIMP\b/gi, ' ')
    .replace(new RegExp(`^\\s*${brandKey}\\s+`, 'i'), ' ')
    .replace(/\b(?:XL|XLL|BSW|OWL|RWL|WWL|POR)\b/gi, ' ')
    .replace(/\b\d{2,3}\s*\/\s*\d{2,3}\s*[A-Z]\b/gi, ' ')
    .replace(/\b\d{2,3}\s+\d{2,3}\s*[A-Z]\b/gi, ' ')
    .replace(/\b\d{2,3}\s*[A-Z]\b/gi, ' ')
    .replace(/\b(?:E|Z)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  cleaned = cleaned
    .replace(new RegExp(`^\\s*${brandKey}\\s+`, 'i'), ' ')
    .replace(/\b\d{2,3}\s*[A-Z]\b/gi, ' ')
    .replace(/\bPRIVILO\b/gi, 'Privilo')
    .replace(/\bRENEG\.?AT\.?SPORT\b/gi, 'Renegade AT Sport')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || String(pattern || '').replace(/\bIMP\b/gi, ' ').replace(/\s+/g, ' ').trim() || 'Standard';
};

const imageKeys = (brand, pattern) => ({
  designKey: normalizeToken(pattern || brand || 'TYRE'),
  finishKey: normalizeToken(brand)
});

const readRawExport = async (filePath) => {
  const source = await readFile(filePath, 'utf8');
  const equalsIndex = source.indexOf('=');
  const semicolonIndex = source.lastIndexOf(';');
  const literal = source.slice(equalsIndex + 1, semicolonIndex > equalsIndex ? semicolonIndex : undefined).trim();

  if (literal.startsWith('`')) return literal.slice(1, literal.lastIndexOf('`'));
  if (literal.startsWith('"') || literal.startsWith("'")) return JSON.parse(literal);
  throw new Error(`Could not read raw supplier export from ${filePath}`);
};

const addItem = (items, supplier, id, brand, pattern, quantity = 0, sku = '') => {
  if (!brand || !pattern) return;
  const keys = imageKeys(brand, pattern);
  items.push({
    id,
    supplier,
    supplierStockCode: sku || id,
    brand: brand.trim(),
    pattern: pattern.trim(),
    quantity,
    designKey: keys.designKey,
    finishKey: keys.finishKey
  });
};

export const parseSupplierTyreRows = (supplier, parser, raw) => {
  const items = [];
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let idCounter = 1;

  if (parser === 'sailun') {
    for (const line of lines) {
      if (!line.startsWith('322')) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 9) continue;
      let liIndex = -1;
      for (let index = 5; index < parts.length - 3; index += 1) {
        if (/^\d{2,3}$/.test(parts[index]) && /^[A-Z]$/.test(parts[index + 1])) {
          liIndex = index;
          break;
        }
      }
      const pattern = liIndex > -1 ? parts.slice(5, liIndex).join(' ') : `${parts[5] || ''} ${parts[6] || ''}`.trim();
      addItem(items, supplier, parts[0], 'Sailun', pattern || 'Standard', 100, parts[0]);
    }
    return items;
  }

  for (const [index, line] of lines.entries()) {
    const cols = parseCsvLine(line);
    if (index === 0 && /^(SIZE|SKU|CODE|TYRE SIZE)/i.test(cols[0] || '')) continue;

    if (parser === 'simple') {
      const size = cols[0]?.trim();
      const brandPattern = cols[1]?.trim();
      if (!size || !brandPattern) continue;
      const { brand, pattern } = splitBrandPattern(brandPattern, supplier);
      addItem(items, supplier, `${slugify(supplier)}-${idCounter++}`, brand, pattern, parseStockUnits(cols[4]), `${slugify(supplier)}-${idCounter}`);
    }

    if (parser === 'exclusive') {
      const size = cols[0]?.trim();
      const brandPattern = cols[1]?.trim();
      if (!size || !brandPattern) continue;
      const { brand, pattern: rawPattern } = splitBrandPattern(brandPattern, supplier);
      const pattern = normalizeExclusiveTyrePattern(brand, rawPattern);
      addItem(items, supplier, `exclusive-${idCounter++}`, brand, pattern, parseStockUnits(cols[3]), `exclusive-${idCounter}`);
    }

    if (parser === 'safetyGrip') {
      const code = cols[0]?.trim();
      const description = cols[1]?.replace(/\s+/g, ' ').trim();
      if (!code || !description) continue;
      const [, ...brandPatternParts] = description.split(/\s+/).filter(Boolean);
      const { brand, pattern } = splitBrandPattern(brandPatternParts.join(' '), supplier);
      addItem(items, supplier, code, brand, pattern, parseStockUnits(cols[2]), code);
    }

    if (parser === 'warehouse') {
      const [sku, , brand, pattern] = cols;
      if (!sku || !brand || !pattern) continue;
      addItem(items, supplier, sku, brand, pattern, parseStockUnits(cols[7] || cols[6]), sku);
    }

    if (parser === 'stamford') {
      const [sku, brand, pattern] = cols;
      if (!sku || !brand || !pattern) continue;
      addItem(items, supplier, sku, brand, pattern, parseStockUnits(cols[7] || cols[6]), sku);
    }

    if (parser === 'tubestone') {
      const [size, sku, brand, description] = cols;
      if (!size || !sku || !brand || !description) continue;
      const pattern = description
        .replace(new RegExp(size.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
        .replace(new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
        .replace(/\b\d+\s*PR\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim() || sku;
      addItem(items, supplier, sku, brand, pattern, parseStockUnits(cols[11]), sku);
    }

    if (parser === 'treads') {
      const [size, sku, brand, description] = cols;
      if (!size || !sku || !brand || !description) continue;
      const pattern = description
        .replace(new RegExp(size.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
        .replace(new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
        .replace(/\s+/g, ' ')
        .trim() || sku;
      addItem(items, supplier, sku, brand, pattern, parseStockUnits(cols[6]), sku);
    }

    if (parser === 'branchRows') {
      const [sku, , brand, pattern] = cols;
      if (!sku || !brand || !pattern) continue;
      addItem(items, supplier, sku, brand, pattern, parseStockUnits(cols[7] || cols[6]), sku);
    }

    if (parser === 'tyreLife') {
      const [size, sku, brand, pattern] = cols;
      if (!size || !sku || !brand || !pattern) continue;
      addItem(items, supplier, sku, brand, pattern, parseStockUnits(cols[12]), sku);
    }
  }

  return items;
};

export const buildImportCandidates = (rows) => {
  const groups = new Map();

  for (const row of rows) {
    if (!row.designKey || !row.finishKey) continue;
    const key = `${row.finishKey}::${row.designKey}`;
    const candidate = groups.get(key) ?? {
      id: key,
      brand: row.brand,
      pattern: row.pattern,
      brandKey: row.finishKey,
      patternKey: row.designKey,
      affectedSkus: [],
      affectedSuppliers: [],
      supplierSkus: {},
      totalAvailableStock: 0,
      status: 'pending',
      checkedSourceUrls: [],
      searchQueries: buildSearchQueries(row.brand, row.pattern)
    };

    candidate.affectedSkus.push(row.supplierStockCode);
    if (!candidate.affectedSuppliers.includes(row.supplier)) candidate.affectedSuppliers.push(row.supplier);
    candidate.supplierSkus[row.supplier] = candidate.supplierSkus[row.supplier] ?? [];
    candidate.supplierSkus[row.supplier].push(row.supplierStockCode);
    candidate.totalAvailableStock += row.quantity || 0;
    groups.set(key, candidate);
  }

  return [...groups.values()].sort((first, second) => (
    second.affectedSkus.length - first.affectedSkus.length
    || second.totalAvailableStock - first.totalAvailableStock
    || first.brandKey.localeCompare(second.brandKey)
    || first.patternKey.localeCompare(second.patternKey)
  ));
};

export const selectBatch = (candidates, manifest, options = {}) => {
  const batchSize = Number.parseInt(options.batchSize ?? process.env.TYRE_IMAGE_BATCH_SIZE ?? DEFAULT_BATCH_SIZE, 10) || DEFAULT_BATCH_SIZE;
  const supplierFilter = normalizeToken(options.supplier);
  const brandFilter = normalizeToken(options.brand);
  const manifestById = new Map((manifest.candidates ?? []).map((candidate) => [candidate.id, candidate]));

  return candidates
    .map((candidate) => ({ ...candidate, ...(manifestById.get(candidate.id) ?? {}) }))
    .filter((candidate) => !supplierFilter || candidate.affectedSuppliers.some((supplier) => normalizeToken(supplier) === supplierFilter))
    .filter((candidate) => !brandFilter || candidate.brandKey === brandFilter)
    .filter((candidate) => options.force || STATUS_PRIORITY.has(candidate.status ?? 'pending'))
    .slice(0, batchSize);
};

export const buildSearchQueries = (brand, pattern) => {
  const phrase = `${brand} ${pattern} tyre product image`;
  return [
    `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(phrase + ' official')}`,
    `https://www.google.com/search?q=${encodeURIComponent(phrase + ' official tyre')}`,
    `https://www.google.com/search?q=${encodeURIComponent(phrase + ' tyre retailer')}`
  ];
};

export const readVerifiedSources = async (sourcePath) => {
  if (!sourcePath) return new Map();
  const parsed = JSON.parse(await readFile(sourcePath, 'utf8'));
  const entries = Array.isArray(parsed) ? parsed : parsed.sources ?? [];
  return new Map(entries.map((entry) => [`${normalizeToken(entry.brand)}::${normalizeToken(entry.pattern || entry.designKey)}`, entry]));
};

export const applyReviewedSource = (candidate, source) => {
  if (!source) return { ...candidate, status: 'pending', confidence: 'missing', reason: 'No reviewed source supplied for this batch candidate.' };
  const brandMatches = normalizeToken(source.brand) === candidate.brandKey;
  const patternMatches = normalizeToken(source.pattern || source.designKey) === candidate.patternKey;
  const hasImage = /^https?:\/\//i.test(source.imageUrl || '');
  const exact = source.confidence === 'exact' && brandMatches && patternMatches && hasImage;

  return {
    ...candidate,
    matchedImageUrl: source.imageUrl || '',
    sourcePageUrl: source.sourcePageUrl || source.pageUrl || '',
    checkedSourceUrls: Array.from(new Set([...(candidate.checkedSourceUrls ?? []), ...(source.checkedSourceUrls ?? []), source.sourcePageUrl || source.pageUrl].filter(Boolean))),
    confidence: exact ? 'exact' : source.confidence || 'ambiguous',
    status: exact ? 'exact' : (source.confidence === 'missing' ? 'missing' : 'ambiguous'),
    reason: exact ? 'Reviewed exact source matches brand, pattern and product image URL.' : 'Reviewed source did not pass exact brand/pattern/image checks.'
  };
};

export const loadManifest = async (manifestPath = DEFAULT_MANIFEST_PATH) => {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    return { version: 1, batches: [], candidates: [] };
  }
};

const fetchExistingRows = async (candidate) => {
  const supplierList = candidate.affectedSuppliers.map(encodeURIComponent).join(',');
  const query = `supplier_stock_images?select=supplier,design_key,finish_key,public_image_url,storage_path,active&active=eq.true&design_key=eq.${encodeURIComponent(candidate.patternKey)}&finish_key=eq.${encodeURIComponent(candidate.brandKey)}&supplier=in.(${supplierList})`;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });
  if (!response.ok) return [];
  return response.json();
};

const imageExtension = (mimeType, url) => {
  const fromMime = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif'
  }[mimeType];
  return fromMime || extname(new URL(url).pathname) || '.jpg';
};

const downloadImage = async (url) => {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'GP Tyres image review importer/1.0'
    }
  });
  if (!response.ok) throw new Error(`Image download failed ${response.status}: ${url}`);
  const mimeType = response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';
  if (!mimeType.startsWith('image/')) throw new Error(`Source is not an image: ${mimeType}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const hash = createHash('sha256').update(buffer).digest('hex');
  return { buffer, hash, mimeType, ext: imageExtension(mimeType, url) };
};

const importImageForSuppliers = async (candidate, image) => {
  if (!IMPORT_TOKEN) throw new Error('SUPPLIER_IMAGE_IMPORT_TOKEN is required when --import is used.');
  const uploads = [];
  const storagePath = `tyres/${slugify(candidate.brandKey)}/${slugify(candidate.patternKey)}/${image.hash}${image.ext}`;
  const base64 = image.buffer.toString('base64');

  for (const supplier of candidate.affectedSuppliers) {
    const payload = {
      supplier,
      sourceFileId: `tyre-${candidate.brandKey}-${candidate.patternKey}-${image.hash}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
      fileName: basename(storagePath),
      storagePath,
      mimeType: image.mimeType,
      designKey: candidate.patternKey,
      finishKey: candidate.brandKey,
      tags: ['tyre', candidate.brandKey, candidate.patternKey, supplier].map(normalizeToken).filter(Boolean),
      base64
    };

    const response = await fetch(`${SUPABASE_URL}/functions/v1/${IMPORT_FUNCTION_SLUG}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'x-supplier-image-import-token': IMPORT_TOKEN
      },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) throw new Error(body.error || `Import failed for ${supplier}`);
    uploads.push({ supplier, publicImageUrl: body.publicImageUrl, storagePath });
  }

  return uploads;
};

const writeReports = async (manifest, batch, reportPath, reviewPath) => {
  await mkdir(join(reportPath, '..'), { recursive: true }).catch(() => undefined);
  await mkdir(join(reviewPath, '..'), { recursive: true }).catch(() => undefined);
  await writeFile(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), batch, manifest }, null, 2));

  const rows = batch.candidates.map((candidate) => `
    <tr class="${escapeHtml(candidate.status)}">
      <td><strong>${escapeHtml(candidate.brand)}</strong><br>${escapeHtml(candidate.pattern)}</td>
      <td>${candidate.matchedImageUrl ? `<img src="${escapeHtml(candidate.matchedImageUrl)}" alt="">` : '<span class="empty">No image</span>'}</td>
      <td>${escapeHtml(candidate.status)}<br><small>${escapeHtml(candidate.reason || '')}</small></td>
      <td>${escapeHtml(candidate.affectedSuppliers.join(', '))}<br><small>${escapeHtml(String(candidate.affectedSkus.length))} SKUs | ${escapeHtml(String(candidate.totalAvailableStock))} stock</small></td>
      <td>${(candidate.checkedSourceUrls?.length ? candidate.checkedSourceUrls : candidate.searchQueries).map((url) => `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`).join('<br>')}</td>
    </tr>`).join('');

  await writeFile(reviewPath, `<!doctype html>
<html><head><meta charset="utf-8"><title>Tyre image import review</title>
<style>
body{font-family:Arial,sans-serif;margin:24px;color:#1f2937}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d1d5db;padding:10px;vertical-align:top}th{background:#111827;color:white;text-align:left}img{width:120px;max-height:120px;object-fit:contain}.exact,.uploaded,.skipped_existing{background:#ecfdf5}.ambiguous{background:#fff7ed}.missing,.failed{background:#fef2f2}.empty{color:#6b7280}a{color:#b91c1c;word-break:break-all}small{color:#6b7280}
</style></head><body>
<h1>Tyre image import review</h1>
<p>Batch ${escapeHtml(batch.id)} | ${escapeHtml(batch.startedAt)} | ${batch.candidates.length} candidates</p>
<table><thead><tr><th>Tyre</th><th>Preview</th><th>Status</th><th>Affected stock</th><th>Sources / search links</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`);
};

export const summarizeBatch = (candidates) => ({
  candidateCount: candidates.length,
  pendingCount: candidates.filter((candidate) => candidate.status === 'pending').length,
  exactCount: candidates.filter((candidate) => candidate.status === 'exact').length,
  ambiguousCount: candidates.filter((candidate) => candidate.status === 'ambiguous').length,
  missingCount: candidates.filter((candidate) => candidate.status === 'missing').length,
  failedCount: candidates.filter((candidate) => candidate.status === 'failed').length,
  skippedCount: candidates.filter((candidate) => candidate.status === 'skipped_existing').length,
  uploadedCount: candidates.filter((candidate) => candidate.status === 'uploaded').length
});

const parseArgs = (argv) => {
  const options = { import: false, dryRun: true, force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--import') {
      options.import = true;
      options.dryRun = false;
    } else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--resume') options.resume = true;
    else if (arg.startsWith('--batch-size')) options.batchSize = arg.includes('=') ? arg.split('=')[1] : argv[++index];
    else if (arg.startsWith('--supplier')) options.supplier = arg.includes('=') ? arg.split('=')[1] : argv[++index];
    else if (arg.startsWith('--brand')) options.brand = arg.includes('=') ? arg.split('=')[1] : argv[++index];
    else if (arg.startsWith('--sources')) options.sources = arg.includes('=') ? arg.split('=')[1] : argv[++index];
    else if (arg.startsWith('--manifest')) options.manifestPath = arg.includes('=') ? arg.split('=')[1] : argv[++index];
    else if (arg.startsWith('--report')) options.reportPath = arg.includes('=') ? arg.split('=')[1] : argv[++index];
    else if (arg.startsWith('--review')) options.reviewPath = arg.includes('=') ? arg.split('=')[1] : argv[++index];
  }
  return options;
};

export const runWorkflow = async (options = {}) => {
  const rows = [];
  for (const source of RAW_SUPPLIERS) {
    const raw = await readRawExport(source.file);
    rows.push(...parseSupplierTyreRows(source.supplier, source.parser, raw));
  }

  const allCandidates = buildImportCandidates(rows);
  const manifestPath = options.manifestPath || DEFAULT_MANIFEST_PATH;
  const manifest = await loadManifest(manifestPath);
  const sourceMap = await readVerifiedSources(options.sources);
  const batchCandidates = selectBatch(allCandidates, manifest, options);
  const batch = {
    id: `tyre-images-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    startedAt: new Date().toISOString(),
    candidates: []
  };

  for (const candidate of batchCandidates) {
    try {
      const existingRows = await fetchExistingRows(candidate);
      const existingSuppliers = new Set(existingRows.map((row) => row.supplier));
      if (!options.force && candidate.affectedSuppliers.every((supplier) => existingSuppliers.has(supplier))) {
        batch.candidates.push({
          ...candidate,
          status: 'skipped_existing',
          confidence: 'exact',
          matchedImageUrl: existingRows[0]?.public_image_url,
          reason: 'All affected suppliers already have an active Supabase image row.'
        });
        continue;
      }

      let reviewed = applyReviewedSource(candidate, sourceMap.get(candidate.id));
      if (reviewed.status === 'exact' && options.import) {
        const image = await downloadImage(reviewed.matchedImageUrl);
        reviewed.uploads = await importImageForSuppliers(reviewed, image);
        reviewed.imageHash = image.hash;
        reviewed.status = 'uploaded';
      }
      batch.candidates.push(reviewed);
    } catch (error) {
      batch.candidates.push({
        ...candidate,
        status: 'failed',
        confidence: 'missing',
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  batch.completedAt = new Date().toISOString();
  Object.assign(batch, summarizeBatch(batch.candidates));

  const candidateMap = new Map((manifest.candidates ?? []).map((candidate) => [candidate.id, candidate]));
  for (const candidate of batch.candidates) candidateMap.set(candidate.id, candidate);
  manifest.candidates = [...candidateMap.values()].sort((first, second) => first.id.localeCompare(second.id));
  manifest.batches = [...(manifest.batches ?? []), {
    id: batch.id,
    startedAt: batch.startedAt,
    completedAt: batch.completedAt,
    ...summarizeBatch(batch.candidates)
  }];

  await mkdir(join(manifestPath, '..'), { recursive: true }).catch(() => undefined);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  await writeReports(manifest, batch, options.reportPath || DEFAULT_REPORT_PATH, options.reviewPath || DEFAULT_REVIEW_PATH);
  return { rows, allCandidates, batch, manifest };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWorkflow(parseArgs(process.argv.slice(2)))
    .then(({ allCandidates, batch }) => {
      console.log(`Tyre image batch complete: ${batch.id}`);
      console.log(`Unique brand/pattern candidates: ${allCandidates.length}`);
      console.log(JSON.stringify(summarizeBatch(batch.candidates), null, 2));
      console.log(`Reports written to the configured JSON and HTML review paths.`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
