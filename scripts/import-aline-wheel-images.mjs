import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_ROOT = 'C:/Users/User/Desktop/ALINE WHEELS 2025 COLLECTION/ALINE COLLECTION 2026/WHEEL CATALOGUE 2026';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://moiybakshvuvppesbnpt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_CmagmxnGcxu9bGWdwWfwjQ_2y_ZXw9j';
const IMPORT_TOKEN = process.env.SUPPLIER_IMAGE_IMPORT_TOKEN;
const SUPPLIER = 'ALINE';
const BUCKET_NAME = 'supplier-stock-images';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const IMPORT_CONCURRENCY = Math.max(1, Number.parseInt(process.env.SUPPLIER_IMAGE_IMPORT_CONCURRENCY || '6', 10));

const rootDir = process.argv[2] || DEFAULT_ROOT;
const reportPath = process.env.SUPPLIER_IMAGE_REPORT_PATH || 'reports/aline-image-match-report.json';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

const normalizeToken = (value = '') => (
  value
    .normalize('NFKD')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const finishHints = [
  ['ARCTIC SILVER', 'ARCTIC SILVER'],
  ['AMBER BRNZ', 'AMBER BRONZE'],
  ['BKMF', 'GMMF'],
  ['BKML', 'BLACK MACHINED LIP'],
  ['BLKML', 'BLACK MACHINED LIP'],
  ['BRNZ BLK LIP', 'BRONZE BLACK LIP'],
  ['BRONZE BLK LIP', 'BRONZE BLACK LIP'],
  ['CIDER', 'CIDER'],
  ['CHG TINT', 'CHG TINT'],
  ['CHGTINT', 'CHG TINT'],
  ['CHGTNT', 'CHG TINT'],
  ['CHG TN', 'CHG TINT'],
  ['CHG', 'CHG'],
  ['CRYSTAL SILVER', 'CRYSTAL SILVER'],
  ['CRYSTALSILVER', 'CRYSTAL SILVER'],
  ['DARK TINT SMOKE', 'DARK TINT SMOKE'],
  ['DIAMOND BLK', 'DIAMOND BLACK'],
  ['GLOSS BLK', 'GLOSS BLACK'],
  ['GLOSSBLK', 'GLOSS BLACK'],
  ['GOLD', 'GOLD'],
  ['GMML', 'GMMF'],
  ['GMMF', 'GMMF'],
  ['GRAPHITE', 'GRAPHITE'],
  ['GRANITE', 'GRANITE'],
  ['HYPER BLACK', 'HYPER BLACK'],
  ['HYPERBLK', 'HYPER BLACK'],
  ['HYPER SILVER', 'HYPER SILVER'],
  ['MATT CHG', 'MATT CHG'],
  ['MATT TITANIUM', 'MATT TITANIUM'],
  ['MACHINE FACE', 'MACHINE FACE'],
  ['MACHINED', 'MACHINED'],
  ['POLISHED LIP', 'POLISHED LIP'],
  ['SATIN BLK TINT', 'SATIN BLACK TINT'],
  ['SATINBLK TINT', 'SATIN BLACK TINT'],
  ['SATIN BLK', 'SATIN BLACK'],
  ['SATINBLK', 'SATIN BLACK'],
  ['SEPANG SILVER', 'SEPANG SILVER'],
  ['SILK BLK', 'SILK BLACK'],
  ['SILKBLK', 'SILK BLACK'],
  ['SLKBLK', 'SILK BLACK'],
  ['SLBLK', 'SILK BLACK'],
  ['SSML', 'SILVER MACHINED LIP'],
  ['SSMF', 'SSMF'],
  ['STBKTNT', 'SATIN BLACK TINT'],
  ['STBKML', 'SATIN BLACK MACHINED LIP'],
  ['STBKMILLED', 'SATIN BLACK MILLED'],
  ['STBK', 'SATIN BLACK'],
  ['STBLKTNT', 'SATIN BLACK TINT'],
  ['STBLK', 'SATIN BLACK'],
  ['TINTED SMOKE', 'TINTED SMOKE'],
  ['TITANIUM BLK LIP', 'TITANIUM BLACK LIP'],
  ['VELVET BLK', 'VELVET BLACK'],
  ['VELVETBLK', 'VELVET BLACK'],
  ['VELBLK', 'VELVET BLACK']
];

const specialDesignNames = new Set([
  'AR Z2',
  'BIG ROCK',
  'LE MANS',
  'MEGA X',
  'STEEL BLACK SPOKE',
  'STEEL CHROME MODULAR',
  'STEEL MODULAR BLACK',
  'STEEL SOFT 8',
  'STEEL SPOKE GREY',
  'STEEL SPOKE',
  'STEEL WHITE SPOKE'
]);

const extractFinishKey = (value) => {
  const source = normalizeToken(value);
  const matched = finishHints
    .filter(([hint]) => source.includes(normalizeToken(hint)))
    .sort((first, second) => second[0].length - first[0].length)[0];
  return matched ? normalizeToken(matched[1]) : '';
};

const firstDesignName = (value) => {
  const words = normalizeToken(value).split(' ').filter(Boolean);
  for (let length = Math.min(3, words.length); length >= 2; length -= 1) {
    const candidate = words.slice(0, length).join(' ');
    if (specialDesignNames.has(candidate)) return candidate;
  }
  return words[0] || '';
};

const parseImageFileName = (fileName) => {
  const stem = fileName.replace(/\.[^.]+$/, '');
  const pcd = stem.match(/\b([456])\s*X\s*(\d{3}(?:\.\d)?)\b/i);
  const rimSize = stem.match(/(?:^|[^0-9])(1[3-9]|2[0-6])\s*(?:''|["”]|INCH|INCHES|IN)/i)?.[1]
    ?? stem.match(/\b(1[3-9]|2[0-6])\s*(?:INCH|INCHES|IN|")?\b/i)?.[1]
    ?? null;
  return {
    designKey: firstDesignName(stem),
    finishKey: extractFinishKey(stem),
    rimSize,
    pcd: pcd ? `${pcd[1]}/${pcd[2]}` : null,
    tags: Array.from(new Set(normalizeToken(stem).split(' ').filter((tag) => tag.length > 1)))
  };
};

const stripLeadingWheelSpec = (description) => {
  let value = description
    .replace(/×/g, 'X')
    .replace(/\bFLOW\s*FORM(?:ING)?\b/gi, ' ')
    .replace(/\bFLOWFORM\b/gi, ' ')
    .replace(/\bFLOWF\b/gi, ' ')
    .replace(/\bTRACK\s*USE\b/gi, ' ')
    .replace(/\bLOAD\b/gi, ' ')
    .trim();

  const patterns = [
    /^[456]\d{3}(?:1[3-9]|2[0-6])X\d+(?:\.\d+)?(?:\/[0-9.]+)?/i,
    /^[456]\d{3}\d{2}X\d+(?:\.\d+)?(?:\/[0-9.]+)?/i,
    /^\d{2}X\d+(?:\.\d+)?(?:\/[0-9.]+)?/i,
    /^[A-Z]*\d+X\d+(?:\.\d+)?(?:\/[0-9.]+)?/i
  ];

  for (const pattern of patterns) {
    const next = value.replace(pattern, '').trim();
    if (next !== value) return next.replace(/\bET\s*-?\d+\b/gi, ' ').trim();
  }
  return value.replace(/\bET\s*-?\d+\b/gi, ' ').trim();
};

const parseStockImageKeys = (description) => {
  const cleaned = stripLeadingWheelSpec(description);
  const beforeSpecs = cleaned.split(/\b(?:ET\s*-?\d+|\d{2,3}(?:\.\d)?|R\b|F\b)\b/i)[0].trim();
  return {
    designKey: firstDesignName(beforeSpecs || cleaned),
    finishKey: extractFinishKey(description)
  };
};

const mimeFor = (fileName) => {
  const ext = extname(fileName).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
};

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolutePath));
    else if (entry.isFile() && IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())) files.push(absolutePath);
  }
  return files;
};

const parseAlineData = async () => {
  const text = await readFile('supplier_data/alineData.ts', 'utf8');
  const raw = text.split('`')[1] ?? '';
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const headers = lines.shift().split(',');
  const descriptionIndex = headers.indexOf('Description');
  const categoryIndex = headers.indexOf('Category');
  const stockCodeIndex = headers.indexOf('Stock Code');

  return lines
    .map((line) => {
      const columns = line.match(/("([^"]|"")*"|[^,]*)/g)?.filter((_, index) => index % 2 === 0).map((value) => value.replace(/^"|"$/g, '').replace(/""/g, '"')) ?? [];
      return {
        stockCode: columns[stockCodeIndex],
        description: columns[descriptionIndex],
        category: columns[categoryIndex]
      };
    })
    .filter((row) => row.description && /WHEEL|STEEL/i.test(row.category ?? ''));
};

const uploadDirect = async (payload, bytes) => {
  const upload = await supabase.storage
    .from(BUCKET_NAME)
    .upload(payload.storagePath, bytes, {
      contentType: payload.mimeType,
      upsert: true
    });
  if (upload.error) throw upload.error;

  const publicImageUrl = supabase.storage.from(BUCKET_NAME).getPublicUrl(payload.storagePath).data.publicUrl;
  const { error } = await supabase
    .from('supplier_stock_images')
    .upsert({
      supplier: payload.supplier,
      source: 'local-import',
      source_file_id: payload.sourceFileId,
      file_name: payload.fileName,
      storage_bucket: BUCKET_NAME,
      storage_path: payload.storagePath,
      public_image_url: publicImageUrl,
      mime_type: payload.mimeType,
      design_key: payload.designKey,
      finish_key: payload.finishKey || null,
      rim_size: payload.rimSize || null,
      pcd: payload.pcd || null,
      tags: payload.tags,
      active: true,
      imported_at: new Date().toISOString()
    }, { onConflict: 'supplier,source_file_id' });
  if (error) throw error;
};

const uploadViaFunction = async (payload, bytes) => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/import-supplier-stock-image`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'x-supplier-image-import-token': IMPORT_TOKEN
    },
    body: JSON.stringify({
      ...payload,
      base64: bytes.toString('base64')
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) throw new Error(body.error || `HTTP ${response.status}`);
};

const scoreMatch = (stock, image) => {
  if (stock.designKey !== image.designKey) return -1;
  let score = 100;
  if (stock.finishKey && stock.finishKey === image.finishKey) score += 30;
  return score;
};

const buildReport = (stockRows, imagePayloads) => {
  const matched = [];
  const ambiguous = [];
  const missing = [];
  for (const stock of stockRows) {
    const keys = parseStockImageKeys(stock.description);
    const scored = imagePayloads
      .map((image) => ({ image, score: scoreMatch(keys, image) }))
      .filter((entry) => entry.score >= 0)
      .sort((first, second) => second.score - first.score || first.image.fileName.localeCompare(second.image.fileName));

    if (!scored.length) {
      missing.push({ stockCode: stock.stockCode, description: stock.description, designKey: keys.designKey, finishKey: keys.finishKey });
      continue;
    }

    const topScore = scored[0].score;
    const top = scored.filter((entry) => entry.score === topScore);
    const entry = {
      stockCode: stock.stockCode,
      description: stock.description,
      designKey: keys.designKey,
      finishKey: keys.finishKey,
      candidates: top.map(({ image }) => image.fileName)
    };

    if (top.length > 1) ambiguous.push(entry);
    else matched.push({ ...entry, image: top[0].image.fileName });
  }

  return {
    generatedAt: new Date().toISOString(),
    supplier: SUPPLIER,
    imageCount: imagePayloads.length,
    stockRows: stockRows.length,
    matchedCount: matched.length,
    ambiguousCount: ambiguous.length,
    missingCount: missing.length,
    matched,
    ambiguous,
    missing
  };
};

const files = (await walk(rootDir)).sort((first, second) => first.localeCompare(second));
console.log(`Found ${files.length} ALINE image file(s) in ${rootDir}`);
console.log(`Import mode: ${IMPORT_TOKEN ? 'edge-function' : 'direct temporary-policy'}`);

const imagePayloads = files.map((absolutePath) => {
  const fileName = absolutePath.split(/[\\/]/).at(-1);
  const bytesFingerprint = createHash('sha256').update(relative(rootDir, absolutePath)).digest('hex');
  const parsed = parseImageFileName(fileName);
  return {
    supplier: SUPPLIER,
    sourceFileId: `aline-${bytesFingerprint}`,
    fileName,
    storagePath: `aline/${bytesFingerprint}${extname(fileName).toLowerCase() || '.jpg'}`,
    mimeType: mimeFor(fileName),
    designKey: parsed.designKey,
    finishKey: parsed.finishKey,
    rimSize: parsed.rimSize,
    pcd: parsed.pcd,
    tags: parsed.tags,
    absolutePath
  };
});

let imported = 0;
let failed = 0;
let nextIndex = 0;

const importOne = async (payload) => {
  const bytes = await readFile(payload.absolutePath);
  try {
    if (IMPORT_TOKEN) await uploadViaFunction(payload, bytes);
    else await uploadDirect(payload, bytes);
    imported += 1;
    if (imported % 25 === 0 || imported === imagePayloads.length) {
      console.log(`Imported ${imported}/${imagePayloads.length} (${failed} failed)`);
    }
  } catch (error) {
    failed += 1;
    console.error(`Failed ${payload.fileName}: ${error.message}`);
  }
};

const worker = async () => {
  while (nextIndex < imagePayloads.length) {
    const current = imagePayloads[nextIndex];
    nextIndex += 1;
    await importOne(current);
  }
};

await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, imagePayloads.length) }, () => worker()));

const report = buildReport(await parseAlineData(), imagePayloads);
await mkdir(reportPath.split(/[\\/]/).slice(0, -1).join(sep) || '.', { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  ok: failed === 0,
  found: imagePayloads.length,
  imported,
  failed,
  reportPath,
  matchedCount: report.matchedCount,
  ambiguousCount: report.ambiguousCount,
  missingCount: report.missingCount
}, null, 2));

process.exit(failed === 0 ? 0 : 1);
