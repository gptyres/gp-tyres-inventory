import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';

const SUPPLIERS = ['ALINE', 'TYRE LIFE WHEELS'];
const BUCKET_NAME = 'supplier-stock-images';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://moiybakshvuvppesbnpt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_CmagmxnGcxu9bGWdwWfwjQ_2y_ZXw9j';
const IMPORT_TOKEN = process.env.SUPPLIER_IMAGE_IMPORT_TOKEN;
const IMPORT_FUNCTION_SLUG = process.env.SUPPLIER_IMAGE_IMPORT_FUNCTION || 'import-supplier-stock-image';
const IMPORT_CONCURRENCY = Math.max(1, Number.parseInt(process.env.SUPPLIER_IMAGE_IMPORT_CONCURRENCY || '4', 10));
const SHOULD_IMPORT = process.argv.includes('--import');
const REPORT_PATH = process.env.SUPPLIER_WHEEL_GAP_REPORT_PATH || 'reports/supplier-wheel-visual-gap-report.json';
const REVIEW_PATH = process.env.SUPPLIER_WHEEL_GAP_REVIEW_PATH || 'reports/supplier-wheel-visual-gap-review.html';
const DOWNLOAD_DIR = process.env.SUPPLIER_WHEEL_GAP_DOWNLOAD_DIR || 'tmp/supplier-wheel-visual-gaps';

const decodeHtml = (value = '') => String(value ?? '')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/&mdash;/g, '-')
  .replace(/&ndash;/g, '-')
  .replace(/&nbsp;/g, ' ')
  .replace(/\\\//g, '/');

const normalizeToken = (value = '') => (
  decodeHtml(value)
    .normalize('NFKD')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/\bDYMANIC\b/g, 'DYNAMIC')
    .replace(/[^A-Z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const canonicalDesignKey = (value = '') => {
  let designKey = normalizeToken(value)
    .replace(/\bDYNAMIC STEEL WHEELS\b/g, 'DYNAMIC STEEL');
  if (designKey === 'ZENNITH') designKey = 'ZENITH';
  if (designKey === 'SUNRAYSIA') designKey = 'DYNAMIC SUNRAYSIA';
  if (designKey === 'ROADKILL') designKey = 'A9301 ROADKILL';
  designKey = designKey
    .replace(/^DYNAMIC STEEL\s+(BEADLOCK IMITATION|BLACK ROUND HOLE|DYNAMIC SUNRAYSIA|GENUINE BEADLOCK|SOFT 8)$/, '$1')
    .replace(/^DYNAMIC STEEL\s+SOFT\s+8$/, 'SOFT 8');
  return designKey.trim();
};

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

const finishHints = [
  ['ARCTICSILVERMF', 'ARCTIC SILVER'], ['ARCTICSILVER', 'ARCTIC SILVER'], ['ARCTICSIL', 'ARCTIC SILVER'],
  ['BKMF', 'GMMF'], ['BKML', 'BLACK MACHINED LIP'], ['BLKML', 'BLACK MACHINED LIP'],
  ['CHGTINT', 'CHG TINT'], ['CHGTNT', 'CHG TINT'], ['CHG TN', 'CHG TINT'], ['CHG', 'CHG'],
  ['GLOSSBLK', 'GLOSS BLACK'], ['GLOSS BLK', 'GLOSS BLACK'], ['GMML', 'GMMF'], ['GMMF', 'GMMF'],
  ['SLKBLK', 'SILK BLACK'], ['SILKBLK', 'SILK BLACK'], ['SLBLK', 'SILK BLACK'],
  ['SSML', 'SILVER MACHINED LIP'], ['STBKTNT', 'SATIN BLACK TINT'], ['STBLKTNT', 'SATIN BLACK TINT'],
  ['STBKML', 'SATIN BLACK MACHINED LIP'], ['STBKMILLED', 'SATIN BLACK MILLED'],
  ['STBLK', 'SATIN BLACK'], ['STBK', 'SATIN BLACK'], ['VELVETBLK', 'VELVET BLACK'], ['VELBLK', 'VELVET BLACK']
];

const extractAlineFinishKey = (value) => {
  const source = normalizeToken(value);
  const matched = finishHints
    .filter(([hint]) => source.includes(normalizeToken(hint)))
    .sort((first, second) => second[0].length - first[0].length)[0];
  return matched ? normalizeToken(matched[1]) : '';
};

const specialDesignNames = new Set([
  'AR Z2', 'BIG ROCK', 'LE MANS', 'MEGA X', 'STEEL BLACK SPOKE',
  'STEEL CHROME MODULAR', 'STEEL MODULAR BLACK', 'STEEL SOFT 8',
  'STEEL SPOKE GREY', 'STEEL SPOKE', 'STEEL WHITE SPOKE'
]);

const extractAlineDesignName = (source) => {
  const words = normalizeToken(source).split(' ').filter(Boolean);
  const first = words[0] ?? '';
  if (first === 'BIGROCK') return 'BIG ROCK';
  if (first === 'AR' || /^AR\d*/.test(first)) return 'AR Z2';
  if (/^MONACO\d*/.test(first)) return 'MONACO';
  if (/^DESTROYER\d*/.test(first)) return 'DESTROYER';
  if (/^VILLAIN/.test(first)) return 'VILLAIN';
  if (/^HOSTILE/.test(first)) return 'HOSTILE';
  if (first === 'AW') return 'STEEL CHROME MODULAR';
  if (first === 'WHITE' && words[1] === 'SPOKE') return 'STEEL WHITE SPOKE';
  if (first === 'STBK' || first === 'STBLK') {
    if (words.some((word) => word.includes('SOFT8')) || (words.includes('SOFT') && words.includes('8'))) return 'STEEL SOFT 8';
    if (words.includes('MOD')) return 'STEEL MODULAR BLACK';
    if (words[1] === 'SPOKE') return 'STEEL SPOKE';
  }
  for (let length = Math.min(3, words.length); length >= 2; length -= 1) {
    const candidate = words.slice(0, length).join(' ');
    if (specialDesignNames.has(candidate)) return candidate;
  }
  return words[0] ?? '';
};

const stripLeadingWheelSpec = (description) => {
  let value = description
    .replace(/\bFLOW\s*FORM(?:ING)?\b/gi, ' ')
    .replace(/\bFLOWFORM\b/gi, ' ')
    .replace(/\bFLOWF\b/gi, ' ')
    .replace(/\bTRACK\s*USE\b/gi, ' ')
    .replace(/\bLOAD\b/gi, ' ')
    .replace(/\bCB\b/gi, ' ')
    .trim();
  for (const pattern of [
    /^[456]\d{3}(?:1[3-9]|2[0-6])X\d+(?:\.\d+)?(?:\/[0-9.]+)?/i,
    /^[456]\d{3}\d{2}X\d+(?:\.\d+)?(?:\/[0-9.]+)?/i,
    /^\d{2}X\d+(?:\.\d+)?(?:\/[0-9.]+)?/i,
    /^[A-Z]*\d+X\d+(?:\.\d+)?(?:\/[0-9.]+)?/i
  ]) {
    const next = value.replace(pattern, '').trim();
    if (next !== value) {
      value = next;
      break;
    }
  }
  return value.replace(/\bET\s*-?\d+\b/gi, ' ').trim();
};

const parseAlineStockImageKeys = (description) => {
  const cleaned = stripLeadingWheelSpec(description);
  const beforeSpecs = cleaned
    .split(/\b(?:ET\s*-?\d+|\d{2,3}(?:\.\d)?|R\b|F\b)\b/i)[0]
    .trim();
  return {
    designKey: canonicalDesignKey(extractAlineDesignName(beforeSpecs || cleaned)),
    finishKey: extractAlineFinishKey(description)
  };
};

const parseSupplierWheelImageKeys = (brand, wheelName, finish, stockCode = '') => {
  const brandKey = canonicalDesignKey(brand);
  let designName = normalizeToken(wheelName)
    .replace(/\bDYNAMIC STEEL WHEELS\b/g, 'DYNAMIC STEEL');
  if (brandKey) {
    designName = designName.replace(new RegExp(`^${brandKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`), '');
  }
  const stockPrefix = normalizeToken(stockCode).match(/\bA?(\d{4}S?)\b/)?.[1];
  if (stockPrefix === '9301' && designName === 'ROADKILL') designName = 'A9301 ROADKILL';
  return {
    designKey: canonicalDesignKey(designName || brandKey || 'WHEEL'),
    finishKey: normalizeToken(finish || brand)
  };
};

const readRawExport = async (filePath, exportName) => {
  const text = await readFile(filePath, 'utf8');
  const match = text.match(new RegExp(`${exportName}\\s*=\\s*(?:\`([\\s\\S]*)\`|"([\\s\\S]*)";?\\s*$)`));
  if (!match) throw new Error(`Unable to find ${exportName}`);
  return match[1] ?? JSON.parse(`"${match[2]}"`);
};

const getCatalogueGroups = async () => {
  const groups = [];
  const aline = await readRawExport('supplier_data/alineData.ts', 'ALINE_RAW_DATA');
  for (const line of aline.split(/\r?\n/).slice(1).filter(Boolean)) {
    const cols = parseCSVLine(line);
    const description = cols[2]?.replace(/\s+/g, ' ').trim();
    const classText = `${cols[3] ?? ''} ${cols[4] ?? ''}`;
    if (!description || !/Wheel/i.test(classText)) continue;
    const keys = parseAlineStockImageKeys(description);
    if (!keys.designKey) continue;
    groups.push({
      supplier: 'ALINE',
      designKey: keys.designKey,
      finishKey: keys.finishKey,
      sampleDescription: description
    });
  }

  const tyreLife = await readRawExport('supplier_data/tyreLifeWheelsData.ts', 'TYRE_LIFE_WHEELS_RAW_DATA');
  for (const line of tyreLife.split(/\r?\n/).slice(1).filter(Boolean)) {
    const cols = parseCSVLine(line);
    const sku = cols[1]?.trim();
    const brand = cols[2]?.trim();
    const wheelName = cols[3]?.replace(/\s+/g, ' ').trim();
    const finish = cols[4]?.replace(/\s+/g, ' ').trim();
    if (!sku || !brand || !wheelName) continue;
    if (/HUB\s*RINGS?|\d{2,3}\.\d\s*-\s*\d{2,3}\.\d/i.test(wheelName)) continue;
    const keys = parseSupplierWheelImageKeys(brand, wheelName, finish, sku);
    groups.push({
      supplier: 'TYRE LIFE WHEELS',
      brand,
      designKey: keys.designKey,
      finishKey: keys.finishKey,
      sampleDescription: wheelName
    });
  }

  const unique = new Map();
  for (const group of groups) {
    const key = `${group.supplier}::${group.designKey}::${group.finishKey}`;
    const existing = unique.get(key) ?? { ...group, affectedRows: 0, finishes: new Set() };
    existing.affectedRows += 1;
    existing.finishes.add(group.finishKey);
    unique.set(key, existing);
  }
  return [...unique.values()].map((group) => ({
    ...group,
    finishes: [...group.finishes].filter(Boolean)
  }));
};

const fetchExistingRows = async () => {
  const query = 'supplier_stock_images?select=supplier,design_key,finish_key,public_image_url,file_name,storage_path,active&active=eq.true&supplier=in.(ALINE,TYRE%20LIFE%20WHEELS)';
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });
  if (!response.ok) throw new Error(`Unable to load supplier image rows: HTTP ${response.status}`);
  return response.json();
};

const groupCoverage = (groups, imageRows) => {
  const designRows = new Set(imageRows.map((row) => `${normalizeToken(row.supplier)}::${canonicalDesignKey(row.design_key)}`));
  const exactRows = new Set(imageRows.map((row) => `${normalizeToken(row.supplier)}::${canonicalDesignKey(row.design_key)}::${normalizeToken(row.finish_key)}`));
  const exact = [];
  const fallback = [];
  const missing = [];
  for (const group of groups) {
    const designKey = `${normalizeToken(group.supplier)}::${canonicalDesignKey(group.designKey)}`;
    const exactKey = `${designKey}::${normalizeToken(group.finishKey)}`;
    if (exactRows.has(exactKey)) exact.push(group);
    else if (designRows.has(designKey)) fallback.push(group);
    else missing.push(group);
  }
  return { exact, fallback, missing };
};

const absoluteUrl = (baseUrl, maybeUrl) => {
  if (!maybeUrl) return '';
  const decoded = decodeHtml(maybeUrl);
  if (/^https?:\/\//i.test(decoded)) return decoded;
  return new URL(decoded, baseUrl).toString();
};

const fetchHtml = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 GP Tyres visual audit' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return decodeHtml(await response.text());
  } finally {
    clearTimeout(timeout);
  }
};

const matchDesignFromText = (supplier, text, targetDesigns) => {
  const source = normalizeToken(text);
  const candidates = [...targetDesigns].sort((first, second) => second.length - first.length);
  for (const design of candidates) {
    if (source.includes(design)) return design;
    if (supplier === 'ALINE' && design === 'STEEL SOFT 8' && /SOFT\s*8|SOFT8/.test(source)) return design;
    if (supplier === 'ALINE' && design === 'STEEL MODULAR BLACK' && /\bMOD\b/.test(source)) return design;
    if (supplier === 'ALINE' && design === 'STEEL CHROME MODULAR' && /\bAW\b|CHROME/.test(source)) return design;
  }
  return '';
};

const sourceRecord = (entry) => ({
  sourceId: createHash('sha1').update(`${entry.supplier}|${entry.designKey}|${entry.imageUrl}`).digest('hex'),
  ...entry,
  designKey: canonicalDesignKey(entry.designKey)
});

const extractErrolBrandSources = async (pageUrl, supplier, targetDesigns) => {
  const html = await fetchHtml(pageUrl);
  const records = [];
  const matches = [...html.matchAll(/<img\b[^>]*>/gi)];
  for (const match of matches) {
    const tag = match[0];
    const dataSrc = tag.match(/\bdata-src="\.\.\/([^"]+)"/i)?.[1];
    const alt = tag.match(/\balt="([^"]+)"/i)?.[1];
    if (!dataSrc || !alt) continue;
    const imageUrl = `https://www.errolstyres.co.za/${dataSrc.replace('images/cmsimages/listing/', 'images/cmsimages/big/')}`;
    const sourceTitle = decodeHtml(alt);
    const designKey = matchDesignFromText(supplier, sourceTitle, targetDesigns);
    if (!designKey || /NO IMAGE|spacer\.gif/i.test(imageUrl)) continue;
    records.push(sourceRecord({
      supplier,
      designKey,
      sourceTitle,
      sourceUrl: pageUrl,
      imageUrl,
      source: 'errols-product-page'
    }));
  }
  return records;
};

const firstUsefulImage = (html, url, patterns = []) => {
  const images = [...new Set([
    ...(html.match(/https?:\/\/[^"'\s<>]+\.(?:png|jpg|jpeg|webp)/gi) ?? []),
    ...(html.match(/https?:\\\/\\\/[^"'\s<>]+\.(?:png|jpg|jpeg|webp)/gi) ?? []).map((image) => image.replace(/\\\//g, '/'))
  ])].filter((image) => !/logo|favicon|sprite|flags|homologation|no_image/i.test(image));
  for (const pattern of patterns) {
    const matched = images.find((image) => pattern.test(image));
    if (matched) return matched;
  }
  return images[0] ? absoluteUrl(url, images[0]) : '';
};

const manualSources = async () => {
  const definitions = [
    ['ALINE', 'AR Z2', 'A-LINE AR-Z2 Racegold RSPEC', 'https://www.errolstyres.co.za/wheel/a-line/ar-z2-racegold-rspec/16082/82410229', [/ar-z2/i]],
    ['TYRE LIFE WHEELS', 'A8306 MAYHEM RIDGELINE', 'Mayhem 8306 Ridgeline Satin Black', 'https://www.mayhemwheels.com/product/8306-ridgeline-satin-black/', [/MAYHEM8306SB1\.png/i]],
    ['TYRE LIFE WHEELS', 'A8309 MAYHEM GRANITE', 'Mayhem 8309 Granite Satin Black', 'https://www.mayhemwheels.com/product/8309-granite-satin-black/', [/8309SB1\.png/i]],
    ['TYRE LIFE WHEELS', 'A9307 DRIFTER', 'Dirty Life A9307 Drifter Matte Black', 'https://www.errolstyres.co.za/brand/dirty-life', [], 'https://www.errolstyres.co.za/images/cmsimages/big/product_15587_13038_saa9307-7883mb.jpg'],
    ['TYRE LIFE WHEELS', 'A9309S CANYON PRO SE', 'Dirty Life A9309S Canyon Pro Matte Black with Chrome lip bolts', 'https://www.errolstyres.co.za/brand/dirty-life', [], 'https://www.errolstyres.co.za/images/cmsimages/big/product_16140_14008_a9309s.jpg'],
    ['TYRE LIFE WHEELS', 'A9312 MESA RACE', 'Dirty Life A9312 Mesa Race Matte Black Genuine Beadlock', 'https://www.errolstyres.co.za/brand/dirty-life', [], 'https://www.errolstyres.co.za/images/cmsimages/big/product_16142_14006_a9312-mesa-blank-matte-black.png'],
    ['TYRE LIFE WHEELS', 'A9313 ENIGMA RACE', 'Dirty Life 9313 Enigma Race Machined', 'https://www.dirtylifewheels.com/9313-machined', [/9313.*mach_0001/i]],
    ['TYRE LIFE WHEELS', 'BLACK ROUND HOLE', 'Dynamic Black Round HD Mine Spec', 'https://www.errolstyres.co.za/brand/dynamic', [], 'https://www.errolstyres.co.za/images/cmsimages/big/product_15590_12983_17912n81651brhd.png'],
    ['TYRE LIFE WHEELS', 'SOFT 8', 'Dynamic Beadlock Imitation Black Soft 8', 'https://www.errolstyres.co.za/brand/dynamic', [], 'https://www.errolstyres.co.za/images/cmsimages/big/product_15588_12979_bi16850n5150bs8.png'],
    ['TYRE LIFE WHEELS', 'MASSIMO', 'MOMO Massimo', 'https://momo.com/en-gb/product/road-wheels-eu/alloy-eu/massimo/', [/2017\/02\/1-4\.png/i]],
    ['TYRE LIFE WHEELS', 'REVENGE', 'MOMO Revenge', 'https://momo.com/en-gb/product/road-wheels-eu/limited-availability/revenge/', [/wp-content.*\.(?:png|jpg|webp)/i]],
    ['TYRE LIFE WHEELS', 'REVENGE EVO', 'MOMO Revenge EVO', 'https://momo.com/en-gb/product/road-wheels-eu/limited-availability/revenge-evo/', [/wp-content.*\.(?:png|jpg|webp)/i]],
    ['TYRE LIFE WHEELS', 'RF 04', 'MOMO RF-04', 'https://momo.com/en-gb/product/road-wheels-eu/rf-series-eu/rf-04/', [/wp-content.*\.(?:png|jpg|webp)/i]],
    ['TYRE LIFE WHEELS', 'RF 05', 'MOMO RF-05', 'https://momo.com/it-it/product/cerchi-in-lega-it/rf-series-it/rf-05/', [/wp-content.*\.(?:png|jpg|webp)/i]],
    ['TYRE LIFE WHEELS', 'SPIDER', 'MOMO Spider', 'https://momo.com/en-gb/product/road-wheels-eu/limited-availability/spider/', [/wp-content.*\.(?:png|jpg|webp)/i]],
    ['TYRE LIFE WHEELS', 'STEALTH', 'MOMO Stealth', 'https://momo.com/en-gb/product/road-wheels-eu/limited-availability/stealth/', [/wp-content.*\.(?:png|jpg|webp)/i]],
    ['TYRE LIFE WHEELS', 'SERIES 40 VERTIGO', 'Pro Comp Series 40 Vertigo', 'https://ruggedridge.com/p/pro-comp-grey-vertigo-2640-series-wheels/prc-2640-897350/', [/pro-comp.*vertigo/i], 'https://ruggedridge.com/production/4768-pro-comp-anthracite-vertigo-2640-series-wheels/r/800x600/fff/80/f0a5bc524c46abe89db5f5d1bb6421eb.jpg'],
    ['TYRE LIFE WHEELS', 'SERIES 43 SLEDGE', 'Pro Comp Series 43 Sledge', 'https://ruggedridge.com/p/pro-comp-black-sledge-5143-series-wheels/', [/pro-comp.*sledge/i], 'https://ruggedridge.com/production/4786-pro-comp-black-sledge-5143-series-wheels/r/800x600/fff/80/a66899c2603ba1e0d79b771f01f5d364.jpg'],
    ['TYRE LIFE WHEELS', 'SERIES 50 GAUGE', 'Pro Comp Series 50 Gauge', 'https://ruggedridge.com/p/pro-comp-black-10-gauge-5050-series-wheels/', [/pro-comp.*10-gauge/i], 'https://ruggedridge.com/production/4877-pro-comp-black-10-gauge-5050-series-wheels/r/800x600/fff/80/b85a5abf8a8a23ff17d665b7a7ead18d.jpg']
  ];

  const records = [];
  for (const [supplier, designKey, sourceTitle, sourceUrl, patterns, directImageUrl] of definitions) {
    try {
      const html = directImageUrl ? '' : await fetchHtml(sourceUrl);
      const imageUrl = directImageUrl || firstUsefulImage(html, sourceUrl, patterns);
      if (!imageUrl) continue;
      records.push(sourceRecord({
        supplier,
        designKey,
        sourceTitle,
        sourceUrl,
        imageUrl,
        source: 'verified-manual-source'
      }));
    } catch (error) {
      records.push({
        supplier,
        designKey,
        sourceTitle,
        sourceUrl,
        imageUrl: '',
        source: 'verified-manual-source',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return records;
};

const collectSourceRecords = async (missing) => {
  const missingBySupplier = missing.reduce((map, entry) => {
    map[entry.supplier] = map[entry.supplier] ?? new Set();
    map[entry.supplier].add(canonicalDesignKey(entry.designKey));
    return map;
  }, {});

  const records = [
    ...(await extractErrolBrandSources('https://www.errolstyres.co.za/brand/a-line', 'ALINE', missingBySupplier.ALINE ?? new Set())),
    ...(await extractErrolBrandSources('https://www.errolstyres.co.za/brand/dirty-life', 'TYRE LIFE WHEELS', missingBySupplier['TYRE LIFE WHEELS'] ?? new Set())),
    ...(await extractErrolBrandSources('https://www.errolstyres.co.za/brand/dynamic', 'TYRE LIFE WHEELS', missingBySupplier['TYRE LIFE WHEELS'] ?? new Set())),
    ...(await manualSources())
  ];

  const byDesign = new Map();
  for (const record of records) {
    if (!record.imageUrl) continue;
    const key = `${record.supplier}::${canonicalDesignKey(record.designKey)}`;
    if (!byDesign.has(key)) byDesign.set(key, record);
  }
  return [...byDesign.values()].sort((first, second) => (
    first.supplier.localeCompare(second.supplier)
    || first.designKey.localeCompare(second.designKey)
  ));
};

const extensionForMime = (mimeType, sourceUrl) => {
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('webp')) return '.webp';
  const sourceExt = extname(new URL(sourceUrl).pathname).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(sourceExt) ? sourceExt : '.jpg';
};

const downloadImage = async (entry) => {
  const response = await fetch(entry.imageUrl, {
    headers: { 'user-agent': 'Mozilla/5.0 GP Tyres visual import' }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} downloading ${entry.imageUrl}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
  if (!/^image\/(jpeg|png|webp)$/i.test(mimeType)) throw new Error(`Unsupported image type ${mimeType}`);
  const fingerprint = createHash('sha256').update(`${entry.supplier}|${entry.designKey}|${entry.imageUrl}`).digest('hex');
  const ext = extensionForMime(mimeType, entry.imageUrl);
  const supplierPath = entry.supplier === 'ALINE' ? 'aline' : 'tyre-life-wheels';
  const storagePath = `${supplierPath}/${fingerprint}${ext}`;
  const fileName = `${entry.designKey.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${ext}`.replace(/-+/g, '-');
  const localFile = join(DOWNLOAD_DIR, `${fingerprint}${ext}`);
  await mkdir(DOWNLOAD_DIR, { recursive: true });
  await writeFile(localFile, bytes);
  return {
    bytes,
    payload: {
      supplier: entry.supplier,
      sourceFileId: `visual-gap-${fingerprint}`,
      fileName,
      storagePath,
      mimeType,
      designKey: entry.designKey,
      finishKey: null,
      rimSize: null,
      pcd: null,
      tags: [entry.supplier, entry.designKey, entry.source, 'design-fallback', 'verified-source'].filter(Boolean),
      source: 'visual-gap-fill',
      localFile
    }
  };
};

const uploadViaFunction = async (payload, bytes) => {
  if (!IMPORT_TOKEN) throw new Error('SUPPLIER_IMAGE_IMPORT_TOKEN is required when --import is used.');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${IMPORT_FUNCTION_SLUG}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'x-supplier-image-import-token': IMPORT_TOKEN
    },
    body: JSON.stringify({ ...payload, base64: bytes.toString('base64') })
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

  const cards = report.importPlan.map((entry) => `
    <article class="${entry.sourceRecord ? 'matched' : 'missing'}">
      ${entry.sourceRecord?.imageUrl ? `<img src="${htmlEscape(entry.sourceRecord.imageUrl)}" alt="">` : '<div class="no-image">No verified image found</div>'}
      <div>
        <strong>${htmlEscape(entry.supplier)} / ${htmlEscape(entry.designKey)}</strong>
        <small>${htmlEscape(entry.sampleDescription ?? '')}</small>
        ${entry.sourceRecord?.sourceUrl ? `<a href="${htmlEscape(entry.sourceRecord.sourceUrl)}">${htmlEscape(entry.sourceRecord.sourceTitle)}</a>` : ''}
      </div>
    </article>
  `).join('\n');

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Supplier Wheel Visual Gap Review</title>
  <style>
    body { margin: 0; background: #111; color: #f5f5f5; font-family: Arial, sans-serif; }
    header { position: sticky; top: 0; background: #e00000; padding: 18px 24px; z-index: 1; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    main { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 14px; padding: 18px; }
    article { display: grid; grid-template-columns: 128px 1fr; gap: 14px; min-height: 140px; background: #1c1c1c; border: 1px solid #333; padding: 12px; }
    article.matched { border-color: #197a36; }
    article.missing { border-color: #870000; }
    img, .no-image { width: 128px; height: 128px; object-fit: contain; background: #fff; display: grid; place-items: center; color: #555; text-align: center; font-size: 12px; }
    strong, small, a { display: block; margin-bottom: 8px; }
    small { color: #b7b7b7; }
    a { color: #79b8ff; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <header>
    <h1>Supplier wheel visual gap review</h1>
    <p>${report.summary.sourceMatchedDesigns} source matched / ${report.summary.unresolvedDesigns} unresolved design gaps</p>
  </header>
  <main>${cards}</main>
</body>
</html>`;
  await mkdir(REVIEW_PATH.split(/[\\/]/).slice(0, -1).join(sep) || '.', { recursive: true });
  await writeFile(REVIEW_PATH, html, 'utf8');
};

const groups = await getCatalogueGroups();
const imageRowsBefore = await fetchExistingRows();
const before = groupCoverage(groups, imageRowsBefore);
const missingDesignMap = new Map();
for (const group of before.missing) {
  const key = `${group.supplier}::${canonicalDesignKey(group.designKey)}`;
  const existing = missingDesignMap.get(key) ?? { ...group, affectedGroups: 0 };
  existing.affectedGroups += 1;
  missingDesignMap.set(key, existing);
}

const missingDesigns = [...missingDesignMap.values()].sort((first, second) => (
  first.supplier.localeCompare(second.supplier)
  || first.designKey.localeCompare(second.designKey)
));
const sourceRecords = await collectSourceRecords(missingDesigns);
const sourceByDesign = new Map(sourceRecords.map((record) => [`${record.supplier}::${canonicalDesignKey(record.designKey)}`, record]));
const importPlan = missingDesigns.map((group) => ({
  ...group,
  sourceRecord: sourceByDesign.get(`${group.supplier}::${canonicalDesignKey(group.designKey)}`) ?? null
}));

const report = {
  generatedAt: new Date().toISOString(),
  suppliers: SUPPLIERS,
  summary: {
    catalogueGroups: groups.length,
    imageRowsBefore: imageRowsBefore.length,
    exactBefore: before.exact.length,
    fallbackBefore: before.fallback.length,
    missingGroupsBefore: before.missing.length,
    missingDesignsBefore: missingDesigns.length,
    sourceMatchedDesigns: importPlan.filter((entry) => entry.sourceRecord).length,
    unresolvedDesigns: importPlan.filter((entry) => !entry.sourceRecord).length
  },
  sourceRecords,
  importPlan
};

let imported = 0;
let failed = 0;
const failures = [];

if (SHOULD_IMPORT) {
  let nextIndex = 0;
  const importable = importPlan.filter((entry) => entry.sourceRecord);
  const importOne = async (entry) => {
    try {
      const { payload, bytes } = await downloadImage(entry.sourceRecord);
      entry.localFile = payload.localFile;
      entry.storagePath = payload.storagePath;
      await uploadViaFunction(payload, bytes);
      imported += 1;
    } catch (error) {
      failed += 1;
      failures.push({
        supplier: entry.supplier,
        designKey: entry.designKey,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
  const worker = async () => {
    while (nextIndex < importable.length) {
      const entry = importable[nextIndex];
      nextIndex += 1;
      await importOne(entry);
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, importable.length) }, () => worker()));
  const imageRowsAfter = await fetchExistingRows();
  const after = groupCoverage(groups, imageRowsAfter);
  report.importedAt = new Date().toISOString();
  report.importRunId = randomUUID();
  report.importedCount = imported;
  report.failedCount = failed;
  report.failures = failures;
  report.summary.imageRowsAfter = imageRowsAfter.length;
  report.summary.exactAfter = after.exact.length;
  report.summary.fallbackAfter = after.fallback.length;
  report.summary.missingGroupsAfter = after.missing.length;
}

await writeReports(report);

console.log(JSON.stringify({
  ok: failed === 0,
  importRequested: SHOULD_IMPORT,
  ...report.summary,
  imported,
  failed,
  reportPath: REPORT_PATH,
  reviewPath: REVIEW_PATH
}, null, 2));

process.exit(failed === 0 ? 0 : 1);
