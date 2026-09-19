import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import XLSX from '@e965/xlsx';

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/import-vitour-xlsx.mjs <price-list.xlsx>');
const bytes = fs.readFileSync(input);
const workbook = XLSX.read(bytes, { type: 'buffer' });
const sheet = XLSX.utils.sheet_to_json(workbook.Sheets['Table 1'], { header: 1, defval: null });
if (sheet[7]?.[3] !== 'Including VAT' || sheet[7]?.[4] !== 'Excluding VAT') {
  throw new Error('Unexpected VITOUR price columns; review the workbook before importing.');
}
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const rows = new Map();
let sourceRows = 0;
for (const [index, cells] of sheet.entries()) {
  if (index < 9 || !cells[1] || !cells[2]) continue;
  const size = clean(cells[1]).toUpperCase().replace(/\s+/g, '');
  const description = clean(cells[2]);
  if (!/\d/.test(size)) throw new Error(`Invalid size at row ${index + 1}`);
  const priceIncludingVat = cells[3] == null ? null : Number(cells[3]);
  const priceExcludingVat = cells[4] == null || cells[4] === 0 ? null : Number(cells[4]);
  if ([priceIncludingVat, priceExcludingVat].some((price) => price !== null && (!Number.isFinite(price) || price <= 0))) {
    throw new Error(`Invalid price at row ${index + 1}`);
  }
  if ((priceIncludingVat === null) !== (priceExcludingVat === null)) {
    throw new Error(`Incomplete VAT price pair at row ${index + 1}`);
  }
  if (priceIncludingVat !== null && Math.abs(priceExcludingVat * 1.15 - priceIncludingVat) > 0.02) {
    throw new Error(`VAT discrepancy at row ${index + 1}`);
  }
  const brandMatch = description.match(/^(Delmax\s*\/\s*Saferich|Vitour|Delmax|Joyroad|Mazzini|Saferich|Farroad)(?:\s+(.+))?$/i);
  if (!brandMatch) throw new Error(`Unrecognized brand at row ${index + 1}`);
  const key = `${size}|${description.toUpperCase()}`;
  const existing = rows.get(key);
  sourceRows++;
  if (existing) {
    if (existing.priceIncludingVat !== priceIncludingVat || existing.priceExcludingVat !== priceExcludingVat) {
      throw new Error(`Conflicting duplicate at row ${index + 1}`);
    }
    existing.sourceRows.push(index + 1);
    continue;
  }
  rows.set(key, {
    catalogKey: createHash('sha256').update(key).digest('hex').slice(0, 16),
    size,
    description,
    brand: brandMatch[1].toUpperCase().replace(/\s*\/\s*/g, ' / '),
    pattern: brandMatch[2] || '',
    priceIncludingVat,
    priceExcludingVat,
    sourceRows: [index + 1],
  });
}
const result = {
  sourceFile: path.basename(input),
  sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  priceListPeriod: 'January 2025',
  importedAt: new Date().toISOString(),
  stockQuantitiesSupplied: false,
  sourceRows,
  duplicatesRemoved: sourceRows - rows.size,
  unpricedRows: [...rows.values()].filter((row) => row.priceIncludingVat === null).length,
  rows: [...rows.values()],
};
const output = fileURLToPath(new URL('../supplier_data/vitourData.json', import.meta.url));
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output, listings: rows.size, sourceRows, duplicatesRemoved: result.duplicatesRemoved, unpriced: result.unpricedRows }));
