import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [apexSource, treadsSource, tubestoneSource] = process.argv.slice(2);

if (!apexSource || !treadsSource || !tubestoneSource) {
  throw new Error('Usage: node scripts/refresh-supplier-pricing-data.mjs <apex.csv> <treads-unlimited.csv> <tubestone.csv>');
}

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
const parseMoney = (value) => {
  const parsed = Number.parseFloat(clean(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};
const parseStock = (value) => {
  const parsed = Number.parseInt(clean(value).replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};
const formatMoney = (value) => Number.isInteger(value) ? `R${value}` : `R${value.toFixed(2)}`;
const roundToNearest25 = (value) => Math.round((value / 25) + 1e-9) * 25;

const OUTPUT_HEADERS = [
  'Supplier SKU',
  'TYRE_SIZE',
  'TYRE_BRAND',
  'TYRE_PATTERN',
  'TYRE_RATING',
  'TYRE_INDEX',
  'TYRE_SPECS',
  'Category',
  'Product Name',
  'Cost Price',
  'Selling Price'
];

const refreshSupplier = async ({ input, output, exportName, supplier, locations }) => {
  const parsed = parseCsv(await readFile(resolve(input), 'utf8'));
  const headers = parsed[0].map(clean);
  const indexOf = (name) => {
    const index = headers.indexOf(name);
    if (index < 0) throw new Error(`${supplier}: missing ${name} column.`);
    return index;
  };
  const columns = Object.fromEntries([
    'Supplier SKU', 'TYRE_SIZE', 'TYRE_BRAND', 'TYRE_PATTERN', 'TYRE_RATING', 'TYRE_INDEX',
    'OTHER_SPECS', 'Category', 'Product Name', 'Stock Location', 'Stock Units', 'Cost Price', 'Selling Price'
  ].map((name) => [name, indexOf(name)]));

  const products = new Map();
  let correctedSellingRows = 0;
  for (const row of parsed.slice(1)) {
    const sku = clean(row[columns['Supplier SKU']]);
    if (!sku) throw new Error(`${supplier}: encountered a row without a supplier SKU.`);
    const location = clean(row[columns['Stock Location']]);
    if (!locations.includes(location)) throw new Error(`${supplier}: unexpected stock location ${location || '(blank)'}.`);
    const cost = parseMoney(row[columns['Cost Price']]);
    const suppliedSelling = parseMoney(row[columns['Selling Price']]);
    if (!Number.isFinite(cost) || !Number.isFinite(suppliedSelling)) throw new Error(`${supplier} ${sku}: invalid pricing.`);
    const expectedSelling = roundToNearest25(cost * 1.15);
    const selling = expectedSelling;
    if (suppliedSelling !== expectedSelling) correctedSellingRows += 1;

    const identity = [
      sku,
      clean(row[columns.TYRE_SIZE]),
      clean(row[columns.TYRE_BRAND]),
      clean(row[columns.TYRE_PATTERN]),
      clean(row[columns.TYRE_RATING]),
      clean(row[columns.TYRE_INDEX]),
      clean(row[columns.OTHER_SPECS]),
      clean(row[columns.Category]),
      clean(row[columns['Product Name']])
    ];
    const existing = products.get(sku) ?? {
      identity,
      cost,
      selling,
      stock: Object.fromEntries(locations.map((name) => [name, 0]))
    };
    if (JSON.stringify(existing.identity) !== JSON.stringify(identity) || existing.cost !== cost || existing.selling !== selling) {
      throw new Error(`${supplier} ${sku}: inconsistent product or price data across location rows.`);
    }
    existing.stock[location] += parseStock(row[columns['Stock Units']]);
    products.set(sku, existing);
  }

  const outputRows = [[...OUTPUT_HEADERS, ...locations.map((location) => `${location} Stock Units`), 'Total Stock Units']];
  products.forEach(({ identity, cost, selling, stock }) => {
    const total = Object.values(stock).reduce((sum, quantity) => sum + quantity, 0);
    outputRows.push([
      ...identity.slice(0, 7),
      identity[7] || 'Tyres',
      identity[8],
      formatMoney(cost),
      formatMoney(selling),
      ...locations.map((location) => `${stock[location]} units`),
      `${total} units`
    ]);
  });

  const csv = toCsv(outputRows);
  await writeFile(resolve(output), `export const ${exportName} = ${JSON.stringify(csv)};\n`, 'utf8');
  return { supplier, sourceRows: parsed.length - 1, products: products.size, correctedSellingRows, locations };
};

const results = await Promise.all([
  refreshSupplier({
    input: apexSource,
    output: 'supplier_data/apexData.ts',
    exportName: 'APEX_RAW_DATA',
    supplier: 'Apex',
    locations: ['Cape Town']
  }),
  refreshSupplier({
    input: treadsSource,
    output: 'supplier_data/treadsUnlimitedData.ts',
    exportName: 'TREADS_RAW_DATA',
    supplier: 'Threads Unlimited',
    locations: ['Regional', 'National']
  }),
  refreshSupplier({
    input: tubestoneSource,
    output: 'supplier_data/tubestoneData.ts',
    exportName: 'TUBESTONE_RAW_DATA',
    supplier: 'Tubestone',
    locations: ['BFN', 'CPT', 'DBN', 'JHB', 'NWH']
  })
]);

console.log(JSON.stringify(results, null, 2));
