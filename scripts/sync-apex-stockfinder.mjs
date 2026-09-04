import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { selectCompleteApexTyres } from './apex-stockfinder-catalog.mjs';

const argument = (name, fallback = '') => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : fallback;
};

const credentialsFile = resolve(argument(
  '--credentials',
  'C:/Users/User/Documents/GP TYRES SITE/supplier_credentials_local.csv'
));
const seedFile = resolve(argument(
  '--seed',
  'outputs/apex-stockfinder-2026-08-05/apex_stockfinder_raw_2026-08-05.json'
));
const previousCsvFile = resolve(argument(
  '--previous-csv',
  'outputs/apex-stockfinder-2026-08-05/apex_stockfinder_inventory_2026-08-05.csv'
));
const date = argument('--date', new Date().toISOString().slice(0, 10));
const outputDirectory = resolve(argument('--output-dir', `outputs/apex-stockfinder-${date}`));
const sellerName = argument('--seller');
const sellerId = Number(argument('--seller-id', '1245'));
const concurrency = Math.max(1, Math.min(10, Number(argument('--concurrency', '6')) || 6));

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (quoted && char === '"' && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
};

const csvCell = (value) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const toCsv = (rows) => rows.map((row) => row.map(csvCell).join(',')).join('\n');
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const parseStock = (value) => {
  const number = Number.parseInt(String(value ?? '').replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};
const parseMoney = (value) => {
  const number = Number.parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};
const sellingPrice = (cost) => Math.round((cost * 1.15) + 1e-9);
const stableSourceKey = (...parts) => `apex-${parts.map((part) => clean(part).toLowerCase())
  .join('-')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')}`;

const credentialsRows = parseCsv(await readFile(credentialsFile, 'utf8'));
const credentialHeaders = credentialsRows[0].map(clean);
const supplierIndex = credentialHeaders.indexOf('Supplier Name');
const usernameIndex = credentialHeaders.indexOf('Username');
const passwordIndex = credentialHeaders.indexOf('Password');
const apexCredentials = credentialsRows.slice(1).find((row) => /^apex$/i.test(clean(row[supplierIndex])));
if (!apexCredentials) throw new Error(`Apex credentials were not found in ${credentialsFile}.`);
const username = clean(apexCredentials[usernameIndex]);
const password = clean(apexCredentials[passwordIndex]);
if (!username || !password) throw new Error('The Apex username or password is blank.');

const tokenResponse = await fetch('https://api2.stockfinder.co.za/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ username, password })
});
if (!tokenResponse.ok) throw new Error(`StockFinder login failed (${tokenResponse.status}).`);
const tokenPayload = await tokenResponse.json();
const accessToken = clean(tokenPayload.access_token);
if (!accessToken) throw new Error('StockFinder did not return an access token.');

const seedRows = JSON.parse(await readFile(seedFile, 'utf8'));
const previousRows = parseCsv(await readFile(previousCsvFile, 'utf8'));
const previousHeaders = previousRows[0].map(clean);
const previousBySku = new Map(previousRows.slice(1).map((row) => [clean(row[0]), Object.fromEntries(
  previousHeaders.map((header, index) => [header, clean(row[index])])
)]));

const sizeTerm = (description) => {
  const text = clean(description).toUpperCase().replace(/×/g, 'X');
  const patterns = [
    /(?:^|\b)(?:LT)?\s*(\d{3})\s*\/\s*(\d{2})\s*Z?R\s*(\d{2}(?:\.5)?)(?:C|LT)?\b/i,
    /(?:^|\b)(\d{2,3}(?:\.\d+)?)X(\d{1,2}(?:\.\d+)?)R(\d{2}(?:\.5)?)(?:LT)?\b/i,
    /(?:^|\b)(\d{1,3}(?:\.\d+)?)\s*\/\s*(\d{2,3}(?:\.\d+)?)\s*-\s*(\d{2}(?:\.5)?)\b/i,
    /(?:^|\b)(\d{1,3}(?:\.\d+)?L?)\s*-\s*(\d{2}(?:\.5)?)(?:SL)?\b/i,
    /(?:^|\b)(\d{1,3}(?:\.\d+)?)\s*R\s*(\d{2}(?:\.5)?)(?:C|LT)?\b/i
  ];
  for (let index = 0; index < patterns.length; index += 1) {
    const match = text.match(patterns[index]);
    if (!match) continue;
    if (index === 0) return `${match[1]}/${match[2]}R${match[3]}`;
    if (index === 1) return `${match[1]}X${match[2]}R${match[3]}`;
    if (index === 2) return `${match[1]}/${match[2]}-${match[3]}`;
    if (index === 3) return `${match[1]}-${match[2]}`;
    return `${match[1]}R${match[2]}`;
  }
  const compactTruck = text.match(/(?:^|\b)(\d{2})225\b/);
  if (compactTruck) return `${compactTruck[1]}R22.5`;
  return '';
};

const apiSize = (row) => {
  const width = Number(row.width);
  const profile = Number(row.profile);
  const rim = Number(row.rim);
  if (Number.isFinite(width) && width >= 100 && Number.isFinite(profile) && profile > 0 && Number.isFinite(rim) && rim > 0) {
    const commercial = /Z?R\s*\d{2}(?:\.5)?C\b/i.test(clean(row.description)) ? 'C' : '';
    return `${width}/${profile}R${rim}${commercial}`;
  }
  return sizeTerm(row.description);
};

const inferredBrand = (description, size) => clean(description)
  .replace(size, ' ')
  .replace(/\b\d{2,3}(?:\s*\/\s*\d{2,3})?\s*[A-Z]\b/gi, ' ')
  .replace(/\b(?:XL|TL|TT|LT|C|RADIAL)\b/gi, ' ')
  .split(/\s+/)
  .find((token) => /^[A-Z][A-Z0-9-]{2,}$/i.test(token)) || '';

// StockFinder returns its complete tyre result set for an empty search. This
// avoids silently missing brands or sizes that were absent from an old seed.
const broadQueries = [''];

const search = async (query, attempt = 1) => {
  const response = await fetch('https://api2.stockfinder.co.za/v1/search/searchStock', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      search_logic: {
        search_requirements: {
          raw_search: query,
          searchType: 1,
          specialPriceSetId: 0,
          includeUsedStock: true,
          stock_msfids: []
        }
      },
      sellerId
    })
  });
  if (!response.ok) {
    if (attempt < 4) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 500));
      return search(query, attempt + 1);
    }
    throw new Error(`Search failed for ${query} (${response.status}).`);
  }
  const payload = await response.json();
  return Array.isArray(payload.tyres) ? payload.tyres : [];
};

const liveBySku = new Map();
const failures = [];
const captureRows = (rows) => selectCompleteApexTyres(rows, sellerName)
  .forEach((row) => {
    const key = [clean(row.sellerId), clean(row.stock_code), clean(row.sla || row.sla_original)].join('|');
    liveBySku.set(key, row);
  });
let nextQuery = 0;
const workers = Array.from({ length: concurrency }, async () => {
  while (nextQuery < broadQueries.length) {
    const index = nextQuery;
    nextQuery += 1;
    const query = broadQueries[index];
    try {
      const rows = await search(query);
      captureRows(rows);
    } catch (error) {
      failures.push({ query, error: error instanceof Error ? error.message : String(error) });
    }
  }
});
await Promise.all(workers);

const capturedSkus = new Set([...liveBySku.values()].map((row) => clean(row.stock_code)));
const missingSeedSkus = seedRows.map((row) => clean(row.stock_code)).filter((sku) => sku && !capturedSkus.has(sku));
let nextMissing = 0;
const missingWorkers = Array.from({ length: concurrency }, async () => {
  while (nextMissing < missingSeedSkus.length) {
    const index = nextMissing;
    nextMissing += 1;
    const sku = missingSeedSkus[index];
    try {
      const rows = await search(sku);
      captureRows(rows);
    } catch (error) {
      failures.push({ query: sku, error: error instanceof Error ? error.message : String(error) });
    }
  }
});
await Promise.all(missingWorkers);

const liveRows = [...liveBySku.values()].sort((left, right) => {
  const brandCompare = clean(left.brand).localeCompare(clean(right.brand), 'en', { numeric: true });
  return brandCompare || clean(left.description).localeCompare(clean(right.description), 'en', { numeric: true });
});
if (!liveRows.length) throw new Error('No live APEX TYRES WC rows were returned.');

const normalizedRows = liveRows.map((row) => {
  const sku = clean(row.stock_code);
  const previous = previousBySku.get(sku) || {};
  const cost = parseMoney(row.buy_price ?? row.cost);
  const stock = parseStock(row.sohInt ?? row.soh);
  const description = clean(row.description);
  const size = previous.TYRE_SIZE || apiSize(row);
  const rawBrand = clean(row.brand);
  const brand = (!rawBrand || /^(?:NULL|N\/?A|UNKNOWN)$/i.test(rawBrand))
    ? (previous.TYRE_BRAND || inferredBrand(description, size))
    : rawBrand;
  const stockLocation = clean(row.seller_name) || 'StockFinder';
  return {
    sku,
    size,
    brand,
    pattern: previous.TYRE_PATTERN || '',
    rating: previous.TYRE_RATING || '',
    index: previous.TYRE_INDEX || [clean(row.load_rating), clean(row.speed_rating)].filter(Boolean).join(''),
    specs: previous.OTHER_SPECS || [clean(row.extra_load), clean(row.runflat), clean(row.ply_rating)].filter(Boolean).join(' '),
    category: previous.Category || 'Tyres',
    description,
    leadTime: clean(row.sla || row.sla_original),
    stockLocation,
    stock,
    cost,
    selling: sellingPrice(cost),
    raw: row
  };
});

const csvHeaders = [
  'Supplier SKU', 'TYRE_SIZE', 'TYRE_BRAND', 'TYRE_PATTERN', 'TYRE_RATING', 'TYRE_INDEX',
  'OTHER_SPECS', 'Category', 'Product Name', 'Lead Time', 'Stock Location', 'Stock Units',
  'Cost Price', 'Selling Price'
];
const csvRows = [csvHeaders, ...normalizedRows.map((row) => [
  row.sku, row.size, row.brand, row.pattern, row.rating, row.index, row.specs, row.category,
  row.description, row.leadTime, row.stockLocation, `${row.stock} units`, `R${row.cost.toFixed(2)}`, `R${row.selling}`
])];

const sourceFile = `apex_stockfinder_inventory_${date}.csv`;
const items = normalizedRows.map((row) => ({
  catalog_key: 'APEX',
  source_key: stableSourceKey(row.sku, row.stockLocation, row.leadTime),
  product_type: 'TYRE',
  supplier: 'Apex',
  supplier_sku: row.sku,
  brand: row.brand,
  product_name: row.description,
  tyre_pattern: row.pattern || null,
  tyre_rating: row.rating || null,
  tyre_index: row.index || null,
  tyre_specs: row.specs || null,
  stock_by_location: { [row.stockLocation]: row.stock },
  category: row.category,
  size: row.size,
  stock_location: `${row.stockLocation}: ${row.stock}`,
  stock_units_availability: row.stock > 0 ? 'In stock' : 'Out of stock',
  supplier_lead_time: row.leadTime || null,
  stock_units: row.stock,
  cost_price: row.cost,
  selling_price: row.selling,
  source_stock_detail: `${row.stockLocation}: ${row.stock}`,
  source_file: sourceFile
}));

const duplicateSourceKeys = items.filter((item, index, all) => all.findIndex((candidate) => candidate.source_key === item.source_key) !== index);
const priceMismatches = items.filter((item) => item.selling_price !== sellingPrice(item.cost_price));
const invalidRows = items.filter((item) => !item.supplier_sku || !item.product_name || item.cost_price <= 0 || item.stock_units < 0);
if (duplicateSourceKeys.length || priceMismatches.length || invalidRows.length) {
  throw new Error(`Validation failed: duplicates=${duplicateSourceKeys.length}, pricing=${priceMismatches.length}, invalid=${invalidRows.length}.`);
}

await mkdir(outputDirectory, { recursive: true });
const rawOutput = resolve(outputDirectory, `apex_stockfinder_raw_${date}.json`);
const csvOutput = resolve(outputDirectory, sourceFile);
const itemsOutput = resolve(outputDirectory, `APEX_live_snapshot_${date}.json`);
const failuresOutput = resolve(outputDirectory, `apex_stockfinder_failures_${date}.json`);
await Promise.all([
  writeFile(rawOutput, `${JSON.stringify(liveRows, null, 2)}\n`, 'utf8'),
  writeFile(csvOutput, `${toCsv(csvRows)}\n`, 'utf8'),
  writeFile(itemsOutput, `${JSON.stringify(items, null, 2)}\n`, 'utf8'),
  writeFile(failuresOutput, `${JSON.stringify(failures, null, 2)}\n`, 'utf8')
]);

const seedSkuSet = new Set(seedRows.map((row) => clean(row.stock_code)));
const primarySellerRows = liveRows.filter((row) => clean(row.seller_name) === 'APEX TYRES WC');
const liveSkuSet = new Set(primarySellerRows.map((row) => clean(row.stock_code)));
const summary = {
  seller: sellerName || 'ALL STOCKFINDER SUPPLIERS',
  source: basename(csvOutput),
  queries: broadQueries.length,
  seedRows: seedRows.length,
  primarySellerRows: primarySellerRows.length,
  liveRows: liveRows.length,
  addedSinceSeed: [...liveSkuSet].filter((sku) => !seedSkuSet.has(sku)).length,
  removedSinceSeed: [...seedSkuSet].filter((sku) => !liveSkuSet.has(sku)).length,
  stockUnits: items.reduce((total, item) => total + item.stock_units, 0),
  minCost: Math.min(...items.map((item) => item.cost_price)),
  maxCost: Math.max(...items.map((item) => item.cost_price)),
  supplierLocations: new Set(liveRows.map((row) => clean(row.seller_name))).size,
  leadTimes: [...new Set(liveRows.map((row) => clean(row.sla || row.sla_original)).filter(Boolean))].sort(),
  failures: failures.length,
  rawOutput,
  csvOutput,
  itemsOutput,
  failuresOutput
};
console.log(JSON.stringify(summary, null, 2));
