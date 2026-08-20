import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCE_URL = 'https://www.eibachsa.co.za/index.php/product-category/eibach-products/';
const API_URL = 'https://www.eibachsa.co.za/wp-json/wc/store/v1/products';
const CATEGORY_ID = 24;
const PAGE_SIZE = 100;
const OUTPUT_FILE = path.resolve('supplier_data/eibachData.ts');

const decodeHtml = (value = '') => String(value)
  .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#0?39;|&apos;/gi, "'")
  .replace(/&nbsp;/gi, ' ')
  .replace(/&ndash;|&mdash;/gi, '-')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>');

const htmlLines = (value = '') => decodeHtml(value)
  .replace(/<(?:br|\/p|\/li)>/gi, '\n')
  .replace(/<li[^>]*>/gi, '')
  .replace(/<[^>]+>/g, ' ')
  .split(/\r?\n/)
  .map((line) => line.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

const categoryPath = (link = '') => {
  const match = String(link).match(/product-category\/eibach-products\/([^?#]+)/i);
  return match?.[1]?.split('/').filter(Boolean) ?? [];
};

const getVehicleBrand = (categories = []) => {
  const category = categories.find((entry) => categoryPath(entry.link).length === 1);
  const sourceBrand = decodeHtml(category?.name || 'Other').trim();
  if (/^chrystler$/i.test(sourceBrand)) return 'Chrysler';
  if (/^landcruiser$/i.test(sourceBrand)) return 'Toyota Land Cruiser';
  return sourceBrand;
};

const getVehicleModel = (categories = []) => {
  const candidates = categories
    .map((entry) => ({ entry, depth: categoryPath(entry.link).length }))
    .filter(({ depth }) => depth > 1)
    .sort((left, right) => right.depth - left.depth);
  return decodeHtml(candidates[0]?.entry?.name || '').trim();
};

const getProductLine = (name, lines) => {
  const text = `${name} ${lines.join(' ')}`;
  if (/sportline/i.test(text)) return 'SPORTLINE';
  if (/lift\s*kit|pro-lift/i.test(text)) return 'LIFT KIT';
  return 'PRO-KIT';
};

const extractLowering = (lines, axle) => {
  const match = lines.join(' | ').match(new RegExp(`(?:Lowering\\s+${axle}|${axle}\\s+Lowering)\\s*:?\\s*([^|]+)`, 'i'));
  return match?.[1]?.trim() || '';
};

const getFitment = (name, lines, vehicleBrand, vehicleModel) => {
  const descriptiveLines = lines.filter((line) => !/^(?:lowering\s+(?:front|rear)|(?:front|rear)\s+lowering)\s*:/i.test(line));
  const source = descriptiveLines.join(' ').trim()
    || decodeHtml(name).replace(/\b(?:Pro[- ]?Kit|Sportline|Lift Kit)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const prefix = [vehicleBrand, vehicleModel].filter(Boolean).join(' ');
  return source.toUpperCase().includes(prefix.toUpperCase()) ? source : `${prefix} ${source}`.trim();
};

const getYearRange = (lines) => {
  const match = lines.join(' ').match(/\b((?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:19|20)\d{2}|present|current)\b/i);
  return match ? `${match[1]} - ${match[2]}` : '';
};

const getPrice = (product) => {
  const minorUnit = Number(product.prices?.currency_minor_unit ?? 2);
  const price = Number(product.prices?.price ?? 0) / (10 ** minorUnit);
  return Number.isFinite(price) ? price : 0;
};

const getStockUnits = (product) => {
  if (!product.is_in_stock) return 0;
  if (product.low_stock_remaining !== null && product.low_stock_remaining !== undefined) {
    const lowStock = Number(product.low_stock_remaining);
    if (Number.isFinite(lowStock) && lowStock >= 0) return Math.trunc(lowStock);
  }
  const maximum = Number(product.add_to_cart?.maximum);
  return Number.isFinite(maximum) && maximum >= 0 && maximum < 9999 ? Math.trunc(maximum) : 0;
};

const fetchPage = async (page) => {
  const url = new URL(API_URL);
  url.searchParams.set('category', String(CATEGORY_ID));
  url.searchParams.set('per_page', String(PAGE_SIZE));
  url.searchParams.set('page', String(page));
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Eibach catalogue page ${page} returned HTTP ${response.status}.`);
  return {
    products: await response.json(),
    totalPages: Number(response.headers.get('x-wp-totalpages') || 1)
  };
};

const firstPage = await fetchPage(1);
const pages = [firstPage.products];
for (let page = 2; page <= firstPage.totalPages; page += 1) {
  pages.push((await fetchPage(page)).products);
}

const syncedAt = new Date().toISOString();
const rows = pages.flat().map((product) => {
  const lines = htmlLines(product.description || product.short_description || '');
  const detailLines = lines.filter((line) => !/^(?:lowering\s+(?:front|rear)|(?:front|rear)\s+lowering)\s*:/i.test(line));
  const vehicleBrand = getVehicleBrand(product.categories);
  const vehicleModel = getVehicleModel(product.categories);
  const costPrice = getPrice(product);
  return {
    websiteProductId: product.id,
    supplierSku: decodeHtml(product.sku || String(product.id)).trim(),
    vehicleBrand,
    vehicleModel,
    productName: decodeHtml(product.name).replace(/\s+/g, ' ').trim(),
    productLine: getProductLine(product.name, lines),
    vehicleCompatibility: getFitment(product.name, lines, vehicleBrand, vehicleModel),
    yearRange: getYearRange(lines),
    frontLowering: extractLowering(lines, 'Front'),
    rearLowering: extractLowering(lines, 'Rear'),
    details: detailLines.join(' | '),
    stockUnits: getStockUnits(product),
    stockStatus: decodeHtml(product.stock_availability?.text || (product.is_in_stock ? 'In stock' : 'Out of stock')).trim(),
    costPrice,
    imageUrl: product.images?.[0]?.src || '',
    sourceUrl: product.permalink || ''
  };
}).sort((left, right) => (
  left.vehicleBrand.localeCompare(right.vehicleBrand)
  || left.vehicleModel.localeCompare(right.vehicleModel)
  || left.productName.localeCompare(right.productName)
  || left.websiteProductId - right.websiteProductId
));

const duplicateIds = rows.filter((row, index) => rows.findIndex((candidate) => candidate.websiteProductId === row.websiteProductId) !== index);
if (duplicateIds.length) throw new Error(`Duplicate Eibach product IDs found: ${duplicateIds.map((row) => row.websiteProductId).join(', ')}`);
const invalidRows = rows.filter((row) => (
  !row.supplierSku
  || !row.vehicleCompatibility
  || row.costPrice < 0
  || (row.stockUnits > 0 && row.costPrice <= 0)
));
if (invalidRows.length) {
  throw new Error(`Eibach catalogue contains invalid rows: ${invalidRows.map((row) => `${row.websiteProductId}:${row.supplierSku || 'NO-SKU'}:${row.costPrice || 'NO-PRICE'}`).join(', ')}`);
}

const brands = Array.from(new Set(rows.map((row) => row.vehicleBrand))).sort();
const fileContents = `// Generated by scripts/sync-eibach-catalog.mjs from the official Eibach South Africa WooCommerce Store API.\n`
  + `// Source: ${SOURCE_URL}\n`
  + `// Synced: ${syncedAt}\n\n`
  + `export const EIBACH_CATALOG_SOURCE_URL = ${JSON.stringify(SOURCE_URL)};\n`
  + `export const EIBACH_CATALOG_SYNCED_AT = ${JSON.stringify(syncedAt)};\n`
  + `export const EIBACH_VEHICLE_BRANDS = ${JSON.stringify(brands, null, 2)} as const;\n`
  + `export const EIBACH_ROWS = ${JSON.stringify(rows, null, 2)} as const;\n`;

await fs.writeFile(OUTPUT_FILE, fileContents, 'utf8');

const inStock = rows.filter((row) => row.stockUnits > 0);
console.log(JSON.stringify({
  source: SOURCE_URL,
  products: rows.length,
  brands: brands.length,
  inStockProducts: inStock.length,
  outOfStockProducts: rows.length - inStock.length,
  availableUnits: inStock.reduce((sum, row) => sum + row.stockUnits, 0),
  output: path.relative(process.cwd(), OUTPUT_FILE)
}, null, 2));
