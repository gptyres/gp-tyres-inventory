import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const inputPath = process.argv[2];
const outputPath = process.argv[3] || 'supplier_data/alineData.ts';

if (!inputPath) {
  throw new Error('Usage: node scripts/refresh-aline-data.mjs <aline-raw-inventory.csv> [output.ts]');
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

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const parseStock = (value) => {
  const parsed = Number.parseInt(clean(value).replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const sourceRows = parseCsv(await readFile(resolve(inputPath), 'utf8'));
const headers = sourceRows.shift().map(clean);
const indexOf = (name) => {
  const index = headers.indexOf(name);
  if (index < 0) throw new Error(`Missing required ALINE column: ${name}`);
  return index;
};

const columns = Object.fromEntries([
  'Stock Code',
  'Brand',
  'Description',
  'Product Class',
  'Category',
  'Stock Location',
  'Stock Units',
  'Price inc VAT',
  'Recommended Retail From',
  'Cat. Nr.'
].map((name) => [name, indexOf(name)]));

const grouped = new Map();
for (const row of sourceRows) {
  const stockCode = clean(row[columns['Stock Code']]);
  if (!stockCode) continue;
  const existing = grouped.get(stockCode) || {
    stockCode,
    brand: clean(row[columns.Brand]),
    description: clean(row[columns.Description]),
    productClass: clean(row[columns['Product Class']]),
    category: clean(row[columns.Category]),
    jhb: 0,
    cpt: 0,
    dbn: 0,
    price: clean(row[columns['Price inc VAT']]),
    recommended: clean(row[columns['Recommended Retail From']]),
    catalogueNumber: clean(row[columns['Cat. Nr.']])
  };
  const quantity = parseStock(row[columns['Stock Units']]);
  const location = clean(row[columns['Stock Location']]).toLowerCase();
  if (location === 'johannesburg') existing.jhb += quantity;
  else if (location === 'cape town') existing.cpt += quantity;
  else if (location === 'durban') existing.dbn += quantity;
  grouped.set(stockCode, existing);
}

const outputRows = [[
  'Stock Code',
  'Brand',
  'Description',
  'Product Class',
  'Category',
  'Qty JHB',
  'Qty CPT',
  'Qty DBN',
  'Price inc VAT',
  'Recommended Retail From',
  'Cat. Nr.'
]];

for (const item of grouped.values()) {
  outputRows.push([
    item.stockCode,
    item.brand,
    item.description,
    item.productClass,
    item.category,
    item.jhb,
    item.cpt,
    item.dbn,
    item.price,
    item.recommended,
    item.catalogueNumber
  ]);
}

const csv = outputRows.map((row) => row.map(csvCell).join(',')).join('\n');
await writeFile(resolve(outputPath), `export const ALINE_RAW_DATA = ${JSON.stringify(csv)};\n`, 'utf8');
console.log(`Refreshed ALINE supplier data: ${grouped.size} products.`);
