import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';

const SUPPLIER = 'TYRE LIFE WHEELS';
const BUCKET_NAME = 'supplier-stock-images';
const STORAGE_PREFIX = 'tyre-life-wheels';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://moiybakshvuvppesbnpt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_CmagmxnGcxu9bGWdwWfwjQ_2y_ZXw9j';
const IMPORT_TOKEN = process.env.SUPPLIER_IMAGE_IMPORT_TOKEN;
const IMPORT_FUNCTION_SLUG = process.env.SUPPLIER_IMAGE_IMPORT_FUNCTION || 'import-supplier-stock-image';
const IMPORT_CONCURRENCY = Math.max(1, Number.parseInt(process.env.SUPPLIER_IMAGE_IMPORT_CONCURRENCY || '4', 10));
const REPORT_PATH = process.env.TYRE_LIFE_IMAGE_REPORT_PATH || 'reports/tyre-life-wheels-image-match-report.json';
const REVIEW_PATH = process.env.TYRE_LIFE_IMAGE_REVIEW_PATH || 'reports/tyre-life-wheels-image-review.html';
const DOWNLOAD_DIR = process.env.TYRE_LIFE_IMAGE_DOWNLOAD_DIR || 'tmp/tyre-life-wheel-images';
const SHOULD_IMPORT = process.argv.includes('--import');

const officialPages = [
  'https://www.dirtylifewheels.com/wheels',
  'https://www.ionalloy.com/ion-wheels',
  'https://momo.com/en-gb/products/road-wheels-eu/page/2/',
  'https://momo.com/en-gb/products/road-wheels-eu/limited-availability/',
  'https://www.mickeythompsontires.com/wheels',
  'https://www.wheelpros.com/pro-comp',
  'https://dynamicwheelco.nz/wheel/dwc-wheels/legend/',
  'https://dynamicwheelco.nz/wheel/dynamic-steel-wheels/'
];

const decodeHtml = (value = '') => value
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/&mdash;/g, '-')
  .replace(/&ndash;/g, '-')
  .replace(/&nbsp;/g, ' ')
  .replace(/\\\//g, '/');

const stripTags = (value = '') => decodeHtml(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

const normalizeToken = (value = '') => (
  decodeHtml(value)
    .normalize('NFKD')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/\bDYMANIC\b/g, 'DYNAMIC')
    .replace(/\bMATT\b/g, 'MATTE')
    .replace(/\bSTARDUST\b/g, 'STARDUST')
    .replace(/[^A-Z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const canonicalDesign = (brand, design) => {
  const brandKey = normalizeToken(brand).replace(/\bDYNAMIC STEEL WHEELS\b/g, 'DYNAMIC STEEL');
  let designKey = normalizeToken(design).replace(/\bDYNAMIC STEEL WHEELS\b/g, 'DYNAMIC STEEL');
  if (brandKey) designKey = designKey.replace(new RegExp(`^${brandKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`), '');
  return designKey;
};

const canonicalFinish = (finish) => normalizeToken(finish)
  .replace(/\bW\b/g, 'WITH')
  .replace(/\bSIMULATED BEADLOCK RING\b/g, 'SIMULATED RING')
  .replace(/\bSIMULATED BLACK BEADLOCK\b/g, 'SIMULATED RING')
  .replace(/\bMATT BLACK POLISHED\b/g, 'MATTE BLACK POLISHED')
  .replace(/\bMATT BLACK DIAMOND CUT\b/g, 'MATTE BLACK POLISHED')
  .replace(/\bMBDC\b/g, 'MATTE BLACK POLISHED')
  .replace(/\bTITAN SILVER BRUSHED\b/g, 'TITAN SILVER BRUSHED')
  .replace(/\bTITAN ICE POLISHED\b/g, 'TITAN ICE POLISHED')
  .replace(/\bTIDC\b/g, 'TITAN ICE POLISHED')
  .replace(/\bANT\b/g, 'MATTE ANTHRACITE')
  .replace(/\bGRAPHITE POLISHED\b/g, 'MATTE GRAPHITE POLISHED')
  .replace(/\bMATTE BLACK WITH MATTE BLACK LIP\b/g, 'MATTE BLACK WITH BLACK LIP')
  .replace(/\bBLACK TRIANGLE LARGE INTERNAL\b/g, 'BLACK TRIANGLE')
  .replace(/\bBLACK ROUND HOLE\b/g, 'BLACK ROUND')
  .replace(/\bGLOSS BLACK RED MACHINED\b/g, 'GLOSS BLACK RED MACHINED')
  .replace(/\s+/g, ' ')
  .trim();

const parseCSVLine = (line) => {
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

const getRawCatalogue = async () => {
  const text = await readFile('supplier_data/tyreLifeWheelsData.ts', 'utf8');
  const match = text.match(/TYRE_LIFE_WHEELS_RAW_DATA\s*=\s*"([\s\S]*)";?\s*$/);
  if (!match) throw new Error('Unable to find TYRE_LIFE_WHEELS_RAW_DATA export.');
  return JSON.parse(`"${match[1]}"`);
};

const parseCatalogueGroups = async () => {
  const raw = await getRawCatalogue();
  const lines = raw.split(/\r?\n/).filter(Boolean);
  lines.shift();
  const groups = new Map();

  for (const line of lines) {
    const cols = parseCSVLine(line);
    const sku = cols[1]?.trim();
    const brand = cols[2]?.trim();
    const wheelName = cols[3]?.replace(/\s+/g, ' ').trim();
    const finish = cols[4]?.replace(/\s+/g, ' ').trim();
    if (!sku || !brand || !wheelName) continue;
    const designKey = canonicalDesign(brand, wheelName);
    const finishKey = normalizeToken(finish || brand);
    const groupKey = `${normalizeToken(brand)}::${designKey}::${finishKey}`;
    const existing = groups.get(groupKey) ?? {
      supplier: SUPPLIER,
      brand,
      brandKey: normalizeToken(brand),
      design: wheelName,
      designKey,
      finish,
      finishKey,
      affectedSkus: [],
      affectedRows: 0
    };
    existing.affectedSkus.push(sku);
    existing.affectedRows += 1;
    groups.set(groupKey, existing);
  }

  return [...groups.values()].sort((first, second) => (
    first.brandKey.localeCompare(second.brandKey)
    || first.designKey.localeCompare(second.designKey)
    || first.finishKey.localeCompare(second.finishKey)
  ));
};

const absoluteUrl = (baseUrl, maybeUrl) => {
  if (!maybeUrl) return '';
  const decoded = decodeHtml(maybeUrl);
  if (/^https?:\/\//i.test(decoded)) return decoded;
  return new URL(decoded, baseUrl).toString();
};

const extractImagesNearOfficialText = (html, pageUrl, brand, textPattern, designResolver) => {
  const records = [];
  const sections = html.split(textPattern);
  for (let index = 1; index < sections.length; index += 1) {
    const before = sections[index - 1].slice(-900);
    const after = sections[index].slice(0, 30000);
    const heading = stripTags((before.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi) ?? []).at(-1) ?? '');
    const designKey = designResolver(heading);
    if (!designKey) continue;

    const slideMatches = [...after.matchAll(/<a\b[^>]*href="([^"]+)"[\s\S]{0,1800}?(?:data-src|src)="([^"]+)"[\s\S]{0,1200}?alt="([^"]*)"[\s\S]{0,1200}?<div class="image-slide-title"[^>]*>([\s\S]*?)<\/div>/gi)];
    for (const match of slideMatches) {
      const finishText = stripTags(match[4] || match[3]);
      const imageUrl = absoluteUrl(pageUrl, match[2]);
      const sourceUrl = absoluteUrl(pageUrl, match[1]);
      if (!imageUrl || !finishText) continue;
      records.push({
        brand,
        brandKey: normalizeToken(brand),
        designKey,
        finishKey: normalizeToken(finishText),
        canonicalFinishKey: canonicalFinish(finishText),
        sourceTitle: `${heading} - ${finishText}`,
        sourceUrl,
        imageUrl,
        officialPage: pageUrl
      });
    }
  }
  return records;
};

const extractSquarespaceCards = (html, pageUrl, brand, designResolver) => {
  const records = [];
  const cardMatches = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[\s\S]{0,1600}?(?:data-src|src)="([^"]+)"[\s\S]{0,1200}?alt="([^"]*)"[\s\S]{0,1200}?<div class="image-slide-title"[^>]*>([\s\S]*?)<\/div>/gi)];
  for (const match of cardMatches) {
    const href = absoluteUrl(pageUrl, match[1]);
    const imageUrl = absoluteUrl(pageUrl, match[2]);
    const title = stripTags(match[4] || match[3]);
    const designKey = designResolver(`${href} ${title}`);
    if (!designKey || !imageUrl || !title) continue;
    records.push({
      brand,
      brandKey: normalizeToken(brand),
      designKey,
      finishKey: normalizeToken(title),
      canonicalFinishKey: canonicalFinish(title),
      sourceTitle: title,
      sourceUrl: href,
      imageUrl,
      officialPage: pageUrl
    });
  }
  return records;
};

const designFromDirty = (text) => {
  const source = normalizeToken(text).replace(/DT\s+(\d)\b/g, 'DT$1');
  const code = source.match(/\b(?:83\d{2}|93\d{2}S?|94\d{2})[A-Z]?\b/)?.[0];
  if (!code) return '';
  const codeMap = {
    '8306': 'A8306 MAYHEM RIDGELINE',
    '8309': 'A8309 MAYHEM GRANITE',
    '9301': 'A9301 ROADKILL',
    '9302': 'A9302 ROADKILL RACE',
    '9303': 'A9303 DT1',
    '9304': 'A9304 DT2',
    '9305': 'A9305 THEORY',
    '9306': 'A9306 MESA',
    '9307': 'A9307 DRIFTER',
    '9308': 'A9308 NEW CAGE',
    '9309': 'A9309 CANYON PRO',
    '9309S': 'A9309S CANYON PRO SE',
    '9310': 'A9310 CANYON',
    '9311': 'A9311 ENIGMA PRO',
    '9312': 'A9312 MESA RACE',
    '9313': 'A9313 ENIGMA RACE',
    '9315': 'A9315 COMPOUND',
    '9317': 'A9317 DT3',
    '9318': 'A9318 DT4'
  };
  if (codeMap[code]) return codeMap[code];
  if (source.includes('DT1')) return `A${code} DT1`;
  if (source.includes('DT2')) return `A${code} DT2`;
  if (source.includes('DT3')) return `A${code} DT3`;
  if (source.includes('DT4')) return `A${code} DT4`;
  const names = ['ROADKILL RACE', 'ROADKILL', 'THEORY', 'MESA RACE', 'MESA', 'DRIFTER', 'NEW CAGE', 'CANYON PRO SE', 'CANYON PRO', 'CANYON', 'ENIGMA RACE', 'ENIGMA PRO', 'COMPOUND'];
  const name = names.find((candidate) => source.includes(candidate));
  return name ? `A${code} ${name}` : `A${code}`;
};

const designFromIon = (text) => {
  const code = normalizeToken(text).match(/\bION\s*(142|143|171|179)\b|\b(142|143|171|179)\b/)?.[1] ?? normalizeToken(text).match(/\b(142|143|171|179)\b/)?.[1];
  return code ? code : '';
};

const designFromMomo = (text) => {
  const source = normalizeToken(text)
    .replace(/\bRF\s+0/g, 'RF 0')
    .replace(/\bRF 02\b/g, 'RF 02')
    .replace(/\bRF 03\b/g, 'RF 03')
    .replace(/\bRF 04\b/g, 'RF 04')
    .replace(/\bRF 05\b/g, 'RF 05');
  const names = ['QUANTUM EVO', 'REVENGE EVO', 'REVENGE', 'MASSIMO', 'RF 02', 'RF 03', 'RF 04', 'RF 05', 'SPIDER', 'STEALTH'];
  return names.find((candidate) => source.includes(candidate)) ?? '';
};

const designFromProcomp = (text) => {
  const source = normalizeToken(text);
  if (source.includes('PA40') || source.includes('SERIES 40')) return 'SERIES 40 VERTIGO';
  if (source.includes('PA43') || source.includes('SERIES 43')) return 'SERIES 43 SLEDGE';
  if (source.includes('PA48') || source.includes('SERIES 48')) return 'SERIES 48 QUICK 8';
  if (source.includes('5050') || source.includes('SERIES 50')) return 'SERIES 50 GAUGE';
  const names = ['SERIES 40 VERTIGO', 'SERIES 43 SLEDGE', 'SERIES 48 QUICK 8', 'SERIES 50 GAUGE'];
  return names.find((candidate) => source.includes(candidate)) ?? '';
};

const designFromDynamic = (text) => {
  const source = normalizeToken(text);
  if (source.includes('BEADLOCK IMITATION')) return 'BEADLOCK IMITATION';
  if (source.includes('GENUINE BEADLOCK')) return 'GENUINE BEADLOCK';
  if (source.includes('DYNAMIC SUNRAYSIA') || source.includes('SUNRAYSIA')) return 'DYNAMIC SUNRAYSIA';
  if (source.includes('BLACK ROUND')) return 'BLACK ROUND';
  if (source.includes('SOFT 8')) return 'SOFT 8';
  return '';
};

const extractMomoCards = (html, pageUrl) => {
  const records = [];
  const productMatches = [...html.matchAll(/<div\b[^>]*class="[^"]*product[\s\S]*?(?=<div\b[^>]*class="[^"]*product|<\/div>\s*<\/div>\s*<\/div>\s*<\/div>)/gi)];
  const blocks = productMatches.length ? productMatches.map((match) => match[0]) : [
    ...html.matchAll(/https:\/\/momo\.com\/wp-content\/uploads\/[^"'\s<>]+\.(?:png|jpg|webp)/gi)
  ].map((match) => match[0]);
  for (const block of blocks) {
    const title = stripTags(block.match(/woocommerce-loop-product__title[^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] ?? block.match(/alt="([^"]+)"/i)?.[1] ?? '');
    const imageUrl = absoluteUrl(pageUrl, block.match(/(https:\/\/momo\.com\/wp-content\/uploads\/[^"'\s<>]+(?:750x750|primary)[^"'\s<>]*\.(?:png|jpg|webp))/i)?.[1] ?? block.match(/(https:\/\/momo\.com\/wp-content\/uploads\/[^"'\s<>]+\.(?:png|jpg|webp))/i)?.[1] ?? '');
    const sourceUrl = absoluteUrl(pageUrl, block.match(/href="([^"]+)"/i)?.[1] ?? pageUrl);
    const designKey = designFromMomo(`${title} ${imageUrl} ${sourceUrl}`);
    if (!designKey || !imageUrl) continue;
    records.push({
      brand: 'MOMO',
      brandKey: 'MOMO',
      designKey,
      finishKey: normalizeToken(`${title} ${imageUrl}`),
      canonicalFinishKey: canonicalFinish(`${title} ${imageUrl}`),
      sourceTitle: title || designKey,
      sourceUrl,
      imageUrl,
      officialPage: pageUrl
    });
  }
  return records;
};

const extractImageRecords = async () => {
  const records = [];
  for (const pageUrl of officialPages) {
    const response = await fetch(pageUrl);
    if (!response.ok) throw new Error(`Unable to fetch ${pageUrl}: HTTP ${response.status}`);
    const html = decodeHtml(await response.text());

    if (pageUrl.includes('dirtylifewheels.com')) {
      records.push(...extractSquarespaceCards(html, pageUrl, 'Dirty Life', designFromDirty));
    } else if (pageUrl.includes('ionalloy.com')) {
      records.push(...extractSquarespaceCards(html, pageUrl, 'Ion', designFromIon));
    } else if (pageUrl.includes('momo.com')) {
      records.push(...extractMomoCards(html, pageUrl));
    } else if (pageUrl.includes('mickeythompsontires.com')) {
      const imageUrl = html.match(/https:\/\/www\.mickeythompsontires\.com\/media\/pages\/wheels\/sidebiter-ii\/[^"'\s<>]+\.png/i)?.[0] ?? '';
      if (imageUrl) {
        records.push({
          brand: 'Mickey Thompson',
          brandKey: 'MICKEY THOMPSON',
          designKey: 'MT SIDEBITER LOCK',
          finishKey: 'BLACK',
          canonicalFinishKey: 'BLACK',
          sourceTitle: 'Sidebiter II - official black wheel image',
          sourceUrl: `${pageUrl}#sidebiter-ii`,
          imageUrl,
          officialPage: pageUrl
        });
      }
    } else if (pageUrl.includes('wheelpros.com')) {
      const images = [...new Set((html.match(/https:\\?\/\\?\/www\.wheelpros\.com\\?\/media\\?\/catalog\\?\/product\\?\/[^"'\s<>]+?\.(?:png|jpg|webp)/gi) ?? [])
        .map((url) => decodeHtml(url).replace(/\\/g, '')))];
      for (const imageUrl of images) {
        const designKey = designFromProcomp(imageUrl);
        if (!designKey) continue;
        records.push({
          brand: 'Procomp',
          brandKey: 'PROCOMP',
          designKey,
          finishKey: normalizeToken(imageUrl),
          canonicalFinishKey: canonicalFinish(imageUrl),
          sourceTitle: imageUrl.split('/').at(-1),
          sourceUrl: pageUrl,
          imageUrl,
          officialPage: pageUrl
        });
      }
    } else if (pageUrl.includes('dynamicwheelco.nz')) {
      const images = [...new Set((html.match(/https:\/\/dynamicwheelco\.nz\/wp-content\/uploads\/[^"'\s<>]+\.(?:png|jpg|webp)/gi) ?? []))];
      for (const imageUrl of images) {
        const sourceText = `${pageUrl} ${imageUrl}`;
        const designKey = designFromDynamic(sourceText);
        if (!designKey) continue;
        records.push({
          brand: pageUrl.includes('dwc-wheels') ? 'DWC' : 'Dynamic Steel Wheels',
          brandKey: pageUrl.includes('dwc-wheels') ? 'DWC' : 'DYNAMIC STEEL WHEELS',
          designKey,
          finishKey: normalizeToken(imageUrl),
          canonicalFinishKey: canonicalFinish(imageUrl),
          sourceTitle: imageUrl.split('/').at(-1),
          sourceUrl: pageUrl,
          imageUrl,
          officialPage: pageUrl
        });
      }
    }
  }

  const byIdentity = new Map();
  for (const record of records) {
    const key = `${record.brandKey}::${record.designKey}::${record.imageUrl}`;
    if (!byIdentity.has(key)) byIdentity.set(key, record);
  }
  return [...byIdentity.values()];
};

const finishMatches = (stockFinish, sourceFinish) => {
  const stock = canonicalFinish(stockFinish);
  const source = canonicalFinish(sourceFinish);
  if (!stock || !source) return false;
  const criticalFinishTerms = ['GENUINE', 'COMP', 'PLASTIC', 'SIMULATED'];
  if (criticalFinishTerms.some((term) => stock.includes(term) && !source.includes(term))) return false;
  if (source.includes(stock) || stock.includes(source)) return true;
  const required = stock.split(' ').filter((token) => !['AND', 'WITH', 'W'].includes(token));
  if (!required.length) return false;
  return required.every((token) => source.includes(token));
};

const findMatch = (group, sourceRecords) => {
  const designMatches = sourceRecords.filter((source) => (
    source.brandKey === group.brandKey
    && source.designKey === group.designKey
  ));
  const finishMatchesExact = designMatches.filter((source) => finishMatches(group.finishKey, source.canonicalFinishKey || source.finishKey));

  if (finishMatchesExact.length === 1) {
    return {
      status: 'matched',
      confidence: 'exact',
      source: finishMatchesExact[0]
    };
  }

  if (finishMatchesExact.length > 1) {
    const uniqueImageUrls = new Set(finishMatchesExact.map((candidate) => candidate.imageUrl));
    if (uniqueImageUrls.size === 1) {
      return {
        status: 'matched',
        confidence: 'exact',
        source: finishMatchesExact[0]
      };
    }
    return {
      status: 'ambiguous',
      candidates: finishMatchesExact.slice(0, 6)
    };
  }

  if (designMatches.length) {
    return {
      status: 'missing',
      reason: 'Official design found, but exact finish was not available.',
      candidates: designMatches.slice(0, 6)
    };
  }

  return {
    status: 'missing',
    reason: 'No official design image found.'
  };
};

const extensionForMime = (mimeType, sourceUrl) => {
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('webp')) return '.webp';
  if (mimeType.includes('gif')) return '.gif';
  const sourceExt = extname(new URL(sourceUrl).pathname).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(sourceExt) ? sourceExt : '.jpg';
};

const downloadImage = async (entry) => {
  const response = await fetch(entry.source.imageUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status} downloading ${entry.source.imageUrl}`);
  const arrayBuffer = await response.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  const mimeType = response.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
  const fingerprint = createHash('sha256')
    .update(`${SUPPLIER}|${entry.brandKey}|${entry.designKey}|${entry.finishKey}`)
    .digest('hex');
  const ext = extensionForMime(mimeType, entry.source.imageUrl);
  const fileName = `${entry.brandKey.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${entry.designKey.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${entry.finishKey.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${ext}`.replace(/-+/g, '-');
  const localPath = join(DOWNLOAD_DIR, `${fingerprint}${ext}`);
  await mkdir(DOWNLOAD_DIR, { recursive: true });
  await writeFile(localPath, bytes);
  return {
    bytes,
    payload: {
      supplier: SUPPLIER,
      sourceFileId: `tyre-life-wheels-${fingerprint}`,
      fileName,
      storagePath: `${STORAGE_PREFIX}/${fingerprint}${ext}`,
      mimeType,
      designKey: entry.designKey,
      finishKey: entry.finishKey,
      rimSize: null,
      pcd: null,
      tags: [entry.brandKey, entry.designKey, entry.finishKey, 'official-source'].filter(Boolean),
      localFile: localPath
    }
  };
};

const uploadDirect = async (payload, bytes) => {
  const uploadResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${payload.storagePath}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': payload.mimeType,
      'x-upsert': 'true',
      'Cache-Control': '3600'
    },
    body: bytes
  });
  if (!uploadResponse.ok) {
    const body = await uploadResponse.text().catch(() => '');
    throw new Error(`Storage upload failed (${uploadResponse.status}): ${body}`);
  }

  const publicImageUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${payload.storagePath}`;
  const row = {
    supplier: payload.supplier,
    source: 'official-import',
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
  };
  const rowResponse = await fetch(`${SUPABASE_URL}/rest/v1/supplier_stock_images?on_conflict=supplier,source_file_id`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify(row)
  });
  if (!rowResponse.ok) {
    const body = await rowResponse.text().catch(() => '');
    throw new Error(`Image row upsert failed (${rowResponse.status}): ${body}`);
  }
};

const uploadViaFunction = async (payload, bytes) => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${IMPORT_FUNCTION_SLUG}`, {
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

const htmlEscape = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const writeReports = async (report) => {
  await mkdir(REPORT_PATH.split(/[\\/]/).slice(0, -1).join(sep) || '.', { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const cards = [...report.matched, ...report.ambiguous, ...report.missing].map((entry) => {
    const source = entry.source ?? entry.candidates?.[0];
    const image = source?.imageUrl ? `<img src="${htmlEscape(source.imageUrl)}" alt="">` : '<div class="no-image">No exact official image</div>';
    return `<article class="${entry.status}">
      ${image}
      <div>
        <strong>${htmlEscape(entry.brand)} / ${htmlEscape(entry.designKey)}</strong>
        <span>${htmlEscape(entry.finishKey)}</span>
        <small>${htmlEscape(entry.status.toUpperCase())}${entry.reason ? ` - ${htmlEscape(entry.reason)}` : ''}</small>
        <small>SKUs: ${htmlEscape(entry.affectedSkus.join(', '))}</small>
        ${source?.sourceUrl ? `<a href="${htmlEscape(source.sourceUrl)}">${htmlEscape(source.sourceTitle || source.sourceUrl)}</a>` : ''}
      </div>
    </article>`;
  }).join('\n');

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>TYRE LIFE WHEELS Image Review</title>
  <style>
    body { margin: 0; background: #101010; color: #f5f5f5; font-family: Arial, sans-serif; }
    header { position: sticky; top: 0; background: #d90404; padding: 18px 24px; z-index: 1; }
    h1 { margin: 0; font-size: 24px; letter-spacing: .04em; }
    main { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 14px; padding: 18px; }
    article { display: grid; grid-template-columns: 128px 1fr; gap: 14px; min-height: 140px; background: #1c1c1c; border: 1px solid #333; padding: 12px; }
    article.matched { border-color: #197a36; }
    article.ambiguous { border-color: #b87400; }
    article.missing { border-color: #870000; }
    img, .no-image { width: 128px; height: 128px; object-fit: contain; background: #fff; display: grid; place-items: center; color: #555; text-align: center; font-size: 12px; }
    strong, span, small, a { display: block; margin-bottom: 8px; }
    small { color: #b7b7b7; }
    a { color: #79b8ff; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <header>
    <h1>TYRE LIFE WHEELS image review</h1>
    <p>${report.matchedCount} exact matched / ${report.ambiguousCount} ambiguous / ${report.missingCount} missing</p>
  </header>
  <main>${cards}</main>
</body>
</html>`;
  await mkdir(REVIEW_PATH.split(/[\\/]/).slice(0, -1).join(sep) || '.', { recursive: true });
  await writeFile(REVIEW_PATH, html, 'utf8');
};

const groups = await parseCatalogueGroups();
const sourceRecords = await extractImageRecords();
const classified = groups.map((group) => ({ ...group, ...findMatch(group, sourceRecords) }));
const report = {
  generatedAt: new Date().toISOString(),
  supplier: SUPPLIER,
  officialSources: officialPages,
  catalogueRows: groups.reduce((sum, group) => sum + group.affectedRows, 0),
  uniqueKeys: groups.length,
  sourceRecords: sourceRecords.length,
  sourceSamples: sourceRecords.slice(0, 25).map((source) => ({
    brand: source.brand,
    designKey: source.designKey,
    finishKey: source.finishKey,
    sourceTitle: source.sourceTitle,
    imageUrl: source.imageUrl,
    sourceUrl: source.sourceUrl
  })),
  matchedCount: classified.filter((entry) => entry.status === 'matched').length,
  ambiguousCount: classified.filter((entry) => entry.status === 'ambiguous').length,
  missingCount: classified.filter((entry) => entry.status === 'missing').length,
  matched: classified.filter((entry) => entry.status === 'matched'),
  ambiguous: classified.filter((entry) => entry.status === 'ambiguous'),
  missing: classified.filter((entry) => entry.status === 'missing')
};

await writeReports(report);

let imported = 0;
let failed = 0;
const failures = [];

if (SHOULD_IMPORT) {
  let nextIndex = 0;
  const importable = report.matched;

  const importOne = async (entry) => {
    try {
      const { payload, bytes } = await downloadImage(entry);
      entry.localFile = payload.localFile;
      entry.storagePath = payload.storagePath;
      if (IMPORT_TOKEN) await uploadViaFunction(payload, bytes);
      else await uploadDirect(payload, bytes);
      imported += 1;
    } catch (error) {
      failed += 1;
      failures.push({
        designKey: entry.designKey,
        finishKey: entry.finishKey,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const worker = async () => {
    while (nextIndex < importable.length) {
      const current = importable[nextIndex];
      nextIndex += 1;
      await importOne(current);
    }
  };

  await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, importable.length) }, () => worker()));
  report.importedAt = new Date().toISOString();
  report.importMode = IMPORT_TOKEN ? 'edge-function' : 'direct';
  report.importedCount = imported;
  report.failedCount = failed;
  report.failures = failures;
  await writeReports(report);
}

console.log(JSON.stringify({
  ok: failed === 0,
  importRequested: SHOULD_IMPORT,
  uniqueKeys: report.uniqueKeys,
  sourceRecords: report.sourceRecords,
  matchedCount: report.matchedCount,
  ambiguousCount: report.ambiguousCount,
  missingCount: report.missingCount,
  imported,
  failed,
  reportPath: REPORT_PATH,
  reviewPath: REVIEW_PATH
}, null, 2));

process.exit(failed === 0 ? 0 : 1);
