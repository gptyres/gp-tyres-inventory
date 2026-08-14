import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { cleanExclusiveTyresNewPattern } from './exclusive-tyres-new-normalization.mjs';

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
};

const input = argument('--input');
const output = argument('--output');

if (!input || !output) {
  throw new Error('Usage: --input <exclusive.csv> --output <snapshot.json>');
}

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value);
      if (row.some((entry) => entry !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }

  row.push(value);
  if (row.some((entry) => entry !== '')) rows.push(row);
  const headers = rows.shift() || [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
};

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const numberFrom = (value) => Number(String(value || '').replace(/[^0-9.-]/g, '')) || 0;
const token = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, '');

const classify = (size, description) => {
  const upperSize = clean(size).toUpperCase();
  const upperDescription = clean(description).toUpperCase();
  if (/\b(?:TBR|TRUCK|STEER|DRIVE|TRAILER)\b/.test(upperDescription)
    || /R(?:17\.5|19\.5|22\.5)\b/.test(upperSize)
    || /^(?:7\.50|8\.25|9\.00|10\.00|11|12|13|14)R(?:16|20|22\.5)\b/.test(upperSize)) return 'TRUCK / TBR';
  if (/^\d{2,3}(?:\/\d{2,3})?-\d{2}\b/.test(upperSize)
    || /\b(?:MOTORCYCLE|MOTORBIKE|SCOOTER|BIKE)\b/.test(upperDescription)) return 'BIKE / MOTORCYCLE';
  return 'PASSENGER / SUV / LDV';
};

const sourceRows = parseCsv(await readFile(resolve(input), 'utf8'));
const duplicateCounts = new Map();
const items = [];

for (const row of sourceRows) {
  const size = clean(row['TYRE SIZE'] || row.TYRE_SIZE || row.Size);
  const brand = clean(row.BRAND || row.TYRE_BRAND || row.Brand);
  const pattern = cleanExclusiveTyresNewPattern(row.PATTERN || row.TYRE_PATTERN || row['Product Name'], brand);
  const rating = clean(row.TYRE_RATING);
  const index = clean(row.TYRE_INDEX);
  const specifications = clean(row.OTHER_SPECS);
  const name = clean(`${size} ${brand} ${pattern}`);
  const cost = numberFrom(row['COST EXCLUDING VAT'] || row['Cost Price Ex VAT'] || row['Cost Price']);
  const stock = Math.max(0, Math.round(numberFrom(row['STOCK ON HAND'] || row['Stock Units'])));
  if (!name || !size || !cost) continue;

  const identity = [size, brand, pattern, rating, index, specifications].map(token).join('|');
  const sourceKey = `exclusive-new-${createHash('sha1').update(identity).digest('hex').slice(0, 20)}`;
  const duplicateNumber = (duplicateCounts.get(sourceKey) || 0) + 1;
  duplicateCounts.set(sourceKey, duplicateNumber);
  const uniqueSourceKey = duplicateNumber === 1 ? sourceKey : `${sourceKey}-${duplicateNumber}`;

  const item = {
    source_key: uniqueSourceKey,
    product_type: 'TYRE',
    product_name: name,
    supplier_sku: clean(row['Supplier SKU']),
    brand,
    tyre_pattern: pattern,
    tyre_rating: rating,
    tyre_index: index,
    tyre_specs: specifications,
    category: classify(size, name),
    size,
    stock_location: clean(row['Stock Location']) || 'CAPE TOWN',
    stock_by_location: { 'CAPE TOWN': stock },
    stock_units_availability: clean(row['Stock Units Availability']) || (stock > 0 ? 'Available' : 'Out of stock'),
    stock_units: stock,
    cost_price: cost,
    selling_price: Math.round(cost * 1.15),
    supplier_lead_time: clean(row.SLA || row['Lead time']),
    source_file: 'EXCLUSIVE_TYRES_NEW_clean_import_2026-08-14.xlsx'
  };
  if (clean(row['Product URL'])) item.product_url = clean(row['Product URL']);
  items.push(item);
}

items.sort((left, right) => left.selling_price - right.selling_price || left.product_name.localeCompare(right.product_name));
await mkdir(dirname(resolve(output)), { recursive: true });
await writeFile(resolve(output), JSON.stringify(items, null, 2));

const summary = items.reduce((result, item) => {
  result.categories[item.category] = (result.categories[item.category] || 0) + 1;
  result.stockUnits += item.stock_units;
  return result;
}, { rows: items.length, stockUnits: 0, categories: {} });

console.log(JSON.stringify({ input: resolve(input), output: resolve(output), ...summary }, null, 2));
