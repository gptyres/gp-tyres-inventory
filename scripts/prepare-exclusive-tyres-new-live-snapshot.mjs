import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { cleanExclusiveTyresNewPattern } from './exclusive-tyres-new-normalization.mjs';

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
};

const input = argument('--input');
const output = argument('--output');
if (!input || !output) throw new Error('Usage: --input <live-raw.json> --output <snapshot.json>');

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const token = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, '');
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sizePattern = /\b(?:(?:LT)?\d{2,3}\/\d{2,3}(?:ZR|RF|R)\d{2}(?:\.\d)?(?:CP|C|LT)?|\d{2,3}R\d{2}(?:\.\d)?(?:CP|C|LT)?|\d{2,3}X\d{1,2}(?:\.\d+)?(?:R|-)\d{2}(?:\.\d)?(?:LT)?|\d{1,3}(?:\.\d{1,2})?\/\d{2,3}-\d{2}(?:\.\d)?|\d{1,3}(?:\.\d{1,2})?(?:R|-)\d{2}(?:\.\d)?|\d{3}-\d{2}(?:\.\d)?)\b/i;
const ratingPattern = /\b\d{1,2}\s*(?:PR|PLY)\b/gi;
const indexPattern = /\b\d{2,3}(?:\s*\/\s*\d{2,3})?\s*(?:A[1-8]|[A-Z])\b/gi;
const specsPattern = /(?:^|\s)(M\+S|M\/S|R\/B|A\/T|M\/T|H\/T|R\/T|TLR|TL|TT|RFT|RUN\s*FLAT|RUNFLAT|XL|RF|OWL|RWL|BSW|WSW)(?=\s|$)/gi;
const brands = [
  'BFGOODRICH', 'BRIDGESTONE', 'CONTINENTAL', 'DOUBLE COIN', 'DRIVEMASTER',
  'FIRESTONE', 'LANDSPIDER', 'WINDFORCE', 'YOKOHAMA', 'FIREMAX', 'GOODYEAR',
  'LANDSAIL', 'TRACMAX', 'ANNAITE', 'GENERAL', 'KAPSEN', 'ANCHEE', 'PIRELLI',
  'DUNLOP', 'RADAR', 'TIMAX', 'XCENT', 'CEAT', 'ROADKING', 'DOUBLE KING',
  'ALPHA MOTORS', 'SUMITOMO', 'CENTARA', 'LONG TRAX', 'FULLRUN', 'KELLY', 'SAVA'
].sort((left, right) => right.length - left.length);

const unique = (values) => [...new Set(values.map(clean).filter(Boolean).map((value) => value.toUpperCase()))];
const removeOnce = (value, target) => target ? value.replace(new RegExp(escapeRegExp(target), 'i'), ' ') : value;
const extractSize = (value) => clean(value).replace(/\u00d7/g, 'X').toUpperCase().match(sizePattern)?.[0] || '';
const extractBrand = (value) => {
  const upper = clean(value).toUpperCase();
  return brands.find((brand) => new RegExp(`(^|[^A-Z0-9])${escapeRegExp(brand)}([^A-Z0-9]|$)`).test(upper)) || '';
};

const parseTitle = (title) => {
  const original = clean(title);
  const size = extractSize(original);
  const brand = extractBrand(original);
  const ratings = unique(original.match(ratingPattern) || []).map((value) => value.replace(/\s+/g, '').replace(/PLY$/i, 'PR'));
  const withoutSize = removeOnce(original, size);
  const brandPosition = brand ? withoutSize.toUpperCase().indexOf(brand) : -1;
  const indexSource = brandPosition >= 0 ? withoutSize.slice(0, brandPosition) : withoutSize;
  const indexes = unique(indexSource.match(indexPattern) || []).slice(0, 1).map((value) => value.replace(/\s+/g, ''));
  const specs = unique(original.match(specsPattern) || []).map((value) => value.trim().replace(/RUN\s*FLAT/i, 'RUNFLAT'));
  let remainder = withoutSize;
  remainder = removeOnce(remainder, brand);
  remainder = remainder.replace(ratingPattern, ' ').replace(specsPattern, ' ');
  indexes.forEach((value) => { remainder = removeOnce(remainder, value); });
  const pattern = cleanExclusiveTyresNewPattern(remainder, brand);
  return { size, brand, pattern, rating: ratings.join(' / '), index: indexes.join(' / '), specs: specs.join(' / ') };
};

const classify = (size, title) => {
  const upperSize = clean(size).toUpperCase();
  const upperTitle = clean(title).toUpperCase();
  if (/\b(?:TBR|TRUCK|STEER|DRIVE|TRAILER)\b/.test(upperTitle)
    || /R(?:17\.5|19\.5|22\.5)\b/.test(upperSize)
    || /^(?:7\.50|8\.25|9\.00|10\.00|11|12|13|14)R(?:16|20|22\.5)\b/.test(upperSize)) return 'TRUCK / TBR';
  if (/^\d{2,3}(?:\/\d{2,3})?-\d{2}\b/.test(upperSize)
    || /\b(?:MOTORCYCLE|MOTORBIKE|SCOOTER|BIKE)\b/.test(upperTitle)) return 'BIKE / MOTORCYCLE';
  return 'PASSENGER / SUV / LDV';
};

const rawDocument = JSON.parse(await readFile(resolve(input), 'utf8'));
const rawRows = Array.isArray(rawDocument) ? rawDocument : rawDocument.rows;
if (!Array.isArray(rawRows) || rawRows.length === 0) throw new Error('The live capture contains no products.');

const sourceKeys = new Set();
const items = rawRows.map((row, rowIndex) => {
  const liveTitle = clean(row.name);
  const parsed = parseTitle(liveTitle);
  const cost = Number(row.cost_ex_vat);
  const stock = Math.max(0, Math.trunc(Number(row.stock) || 0));
  if (!liveTitle || !parsed.size || !(cost > 0)) throw new Error(`Invalid live product at row ${rowIndex + 1}.`);
  const identity = clean(row.sku) || clean(row.url) || `${liveTitle}|${rowIndex}`;
  const sourceKey = `exclusive-new-live-${createHash('sha1').update(token(identity)).digest('hex').slice(0, 20)}`;
  if (sourceKeys.has(sourceKey)) throw new Error(`Duplicate live source key at row ${rowIndex + 1}: ${identity}`);
  sourceKeys.add(sourceKey);
  const productName = clean([parsed.size, parsed.brand, parsed.pattern].filter(Boolean).join(' '));
  return {
    source_key: sourceKey,
    product_type: 'TYRE',
    product_name: productName || liveTitle,
    supplier_sku: clean(row.sku),
    brand: parsed.brand,
    tyre_pattern: parsed.pattern,
    tyre_rating: parsed.rating,
    tyre_index: parsed.index,
    tyre_specs: parsed.specs,
    category: classify(parsed.size, liveTitle),
    size: parsed.size,
    stock_location: 'CAPE TOWN',
    stock_by_location: { 'CAPE TOWN': stock },
    stock_units_availability: stock > 0 ? 'Available' : 'Out of stock',
    stock_units: stock,
    cost_price: cost,
    selling_price: Math.round(cost * 1.15),
    supplier_lead_time: clean(row.sla),
    product_url: clean(row.url),
    source_file: basename(resolve(input))
  };
});

items.sort((left, right) => left.selling_price - right.selling_price || left.product_name.localeCompare(right.product_name));
await mkdir(dirname(resolve(output)), { recursive: true });
await writeFile(resolve(output), JSON.stringify(items, null, 2));

const summary = items.reduce((result, item) => {
  result.categories[item.category] = (result.categories[item.category] || 0) + 1;
  result.stockUnits += item.stock_units;
  if (!item.brand) result.blankBrands += 1;
  if (!item.tyre_pattern) result.blankPatterns += 1;
  return result;
}, { rows: items.length, stockUnits: 0, blankBrands: 0, blankPatterns: 0, categories: {} });

console.log(JSON.stringify({ input: resolve(input), output: resolve(output), ...summary }, null, 2));
