import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE_URL = 'https://hoosiertyres.co.za/shop/';
const API_URL = 'https://hoosiertyres.co.za/wp-json/wc/store/v1/products';
const cleanText = (value = '') => String(value)
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<\/t[dh]>/gi, ': ').replace(/<\/tr>/gi, '; ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&(nbsp|amp|quot|apos|ndash|mdash|rsquo);/gi, (_, n) => ({
    nbsp: ' ', amp: '&', quot: '"', apos: "'", ndash: '–', mdash: '—', rsquo: "'"
  })[n.toLowerCase()])
  .replace(/\s+/g, ' ').trim();

export function normalizeHoosierCapture(capture) {
  const { products, pages, scraped_at_utc: syncedAt } = capture;
  assert.ok(Array.isArray(products) && products.length > 0, 'Empty Hoosier capture');
  assert.ok(Array.isArray(pages) && pages.length > 0, 'Missing pagination evidence');
  assert.ok(!Number.isNaN(Date.parse(syncedAt)), 'Missing capture timestamp');
  const total = pages[0].total;
  assert.equal(products.length, total, 'Incomplete Hoosier catalogue');
  assert.equal(pages.length, pages[0].declared_pages, 'Missing Hoosier pages');
  assert.ok(pages.every(p => p.total === total && p.declared_pages === pages.length));
  assert.equal(pages.reduce((n, p) => n + p.records, 0), total);
  assert.equal(new Set(products.map(p => p.id)).size, total, 'Duplicate product IDs');
  const rows = products.map(product => {
    assert.equal(product.type, 'simple', 'Variable products require variation extraction');
    assert.equal(product.prices?.currency_code, 'ZAR', 'Expected ZAR prices');
    const productName = cleanText(product.name);
    const [title, ...sizeParts] = productName.split(/\s+[–—]\s+/);
    const rawSize = sizeParts.join(' - ');
    const compound = rawSize.match(/\s+(D\d+)\s*$/i)?.[1] || '';
    const size = rawSize.replace(/\s*\(ID\s+[A-Z]\)\s*$/i, '')
      .replace(/\s+D\d+\s*$/i, '').replaceAll('×', 'X').replace(/\s+/g, '').toUpperCase();
    const pattern = title.replace(/^Hoosier\s+/i, '').trim();
    const category = (product.categories || []).map(c => cleanText(c.name)).join(' / ');
    const websiteStockDetail = cleanText(product.stock_availability?.text);
    const stockClass = product.stock_availability?.class || '';
    const exact = websiteStockDetail.match(/^(\d+)\s+in\s+stock\b/i);
    const preorder = /backorder/i.test(`${stockClass} ${websiteStockDetail}`);
    const out = !preorder && (stockClass === 'out-of-stock' || product.is_in_stock === false);
    const stockUnits = preorder || out ? 0 : exact ? Number(exact[1]) : null;
    const orderStatus = preorder ? 'PREORDER' : out ? 'OUT_OF_STOCK'
      : stockUnits !== null && stockUnits > 0 ? 'AVAILABLE' : 'UNKNOWN';
    const price = Number(product.prices.price) / 10 ** Number(product.prices.currency_minor_unit ?? 2);
    assert.ok(size && pattern && category && Number.isFinite(price) && price > 0,
      `Missing identity or price for ${product.id}`);
    const description = cleanText(product.description);
    const specParts = [...String(product.description || '').matchAll(/<(tr|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
      .map(m => cleanText(m[2])).filter(s => /^[^:]{1,50}:/.test(s));
    if (compound && !specParts.some(s => /^Compound:/i.test(s))) specParts.push(`Compound: ${compound}`);
    const sourceRestrictions = [...new Set(description.match(/[^.!?]*(?:not road legal|not for (?:highway|road)|race-only|track use only|racing use only|competition use only)[^.!?]*[.!?]?/gi) || [])].join(' ');
    return {
      websiteProductId: Number(product.id), supplierSku: cleanText(product.sku) || String(product.id),
      brand: 'HOOSIER', pattern, size, category, productName,
      productLabel: category === 'Tubes' ? 'TUBE' : 'TYRE', stockUnits, orderStatus,
      websiteStockDetail, sellingPrice: price,
      imageUrl: cleanText(product.images?.[0]?.src), sourceUrl: cleanText(product.permalink),
      sourceSpecifications: specParts.join(' | '), sourceRestrictions, sourceDescription: description,
      websitePurchasable: product.is_purchasable === true, capturedAt: syncedAt
    };
  }).sort((a, b) => a.category.localeCompare(b.category) || a.pattern.localeCompare(b.pattern)
    || a.size.localeCompare(b.size, undefined, { numeric: true }));
  assert.equal(new Set(rows.map(r => r.supplierSku)).size, rows.length, 'Duplicate supplier SKUs');
  return { rows, syncedAt };
}

async function fetchCapture() {
  const products = [], pages = [];
  let pageCount = 1;
  for (let page = 1; page <= pageCount; page++) {
    const url = `${API_URL}?per_page=100&page=${page}&orderby=id&order=asc`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(30000)
    });
    assert.ok(response.ok, `Hoosier page ${page} failed (${response.status})`);
    const total = Number(response.headers.get('x-wp-total'));
    pageCount = Number(response.headers.get('x-wp-totalpages'));
    assert.ok(total > 0 && pageCount > 0 && pageCount <= 100, 'Missing or invalid pagination');
    const batch = await response.json();
    assert.ok(Array.isArray(batch));
    products.push(...batch);
    pages.push({ url, records: batch.length, total, declared_pages: pageCount });
  }
  return { products, pages, scraped_at_utc: new Date().toISOString() };
}

async function main() {
  const sourceIndex = process.argv.indexOf('--source');
  if (sourceIndex >= 0) assert.ok(process.argv[sourceIndex + 1], '--source requires a capture file');
  const capture = sourceIndex >= 0
    ? JSON.parse(await readFile(path.resolve(process.argv[sourceIndex + 1]), 'utf8'))
    : await fetchCapture();
  const { rows, syncedAt } = normalizeHoosierCapture(capture);
  const outputPath = path.resolve('supplier_data/hoosierData.ts');
  const source = '// Generated from the complete official Hoosier South Africa Store API capture.\n'
    + '// Exact listed website prices. Existing VAT-inclusive basis retained; no additional VAT.\n'
    + '// Dealer costs and undisclosed stock quantities must not be inferred.\n'
    + `export const HOOSIER_CATALOG_SOURCE_URL = ${JSON.stringify(SOURCE_URL)};\n`
    + `export const HOOSIER_CATALOG_SYNCED_AT = ${JSON.stringify(syncedAt)};\n`
    + `export const HOOSIER_ROWS = ${JSON.stringify(rows, null, 2)} as const;\n`;
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, source, 'utf8');
  console.log(JSON.stringify({ rows: rows.length, syncedAt,
    units: rows.reduce((n, r) => n + (r.stockUnits || 0), 0),
    statuses: Object.fromEntries([...new Set(rows.map(r => r.orderStatus))]
      .map(status => [status, rows.filter(r => r.orderStatus === status).length])) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
