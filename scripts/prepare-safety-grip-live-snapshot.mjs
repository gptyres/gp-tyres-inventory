import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
};

const input = argument('--input');
const output = argument('--output');
if (!input || !output) throw new Error('Usage: --input <portal-raw.json> --output <snapshot.json>');

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const token = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, '');
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sizePattern = /\b(?:(?:LT)?\d{2,3}\/\d{2,3}(?:ZR|RF|R)\d{2}(?:\.\d)?(?:CP|C|LT)?|\d{2,3}R\d{2}(?:\.\d)?(?:CP|C|LT)?|\d{2,3}(?:\.\d+)?R\d{2}(?:\.\d)?(?:LT)?|\d{1,3}(?:\.\d{1,2})?\/\d{2,3}-\d{2}(?:\.\d)?|\d{1,3}(?:\.\d{1,2})?L-\d{2}(?:\.\d)?|\d{1,3}(?:\.\d{1,2})?(?:R|-)\d{2}(?:\.\d)?|\d{3}-\d{2}(?:\.\d)?)\b/i;
const ratingPattern = /\b\d{1,2}\s*(?:PR|PLY)\b/gi;
const indexPattern = /\b\d{2,3}(?:\s*\/\s*\d{2,3})?\s*(?:A[1-8]|[A-Z])\b/gi;
const specsPattern = /(?:^|\s)(M\+S|M\/S|R\/B|A\/T|M\/T|H\/T|R\/T|TLR|TL|TT|RFT|RUN\s*FLAT|RUNFLAT|XL|RF|OWL|RWL|BSW|WSW)(?=\s|$)/gi;
const brands = [
  'ALWAYS RUN', 'ALWAYSRUN', 'TOTAL TRUST', 'TOTALTRUST', 'TECHSHIELD',
  'ANNAITE', 'EUDEMON', 'GALLANT', 'RECAMIC', 'HIFLY', 'ATLAS'
].sort((left, right) => right.length - left.length);

const unique = (values) => [...new Set(values.map(clean).filter(Boolean).map((value) => value.toUpperCase()))];
const removeOnce = (value, target) => target ? value.replace(new RegExp(escapeRegExp(target), 'i'), ' ') : value;
const extractSize = (value) => clean(value).replace(/\u00d7/g, 'X').toUpperCase().match(sizePattern)?.[0] || '';
const extractBrand = (value) => {
  const upper = clean(value).toUpperCase();
  return brands.find((brand) => new RegExp(`(^|[^A-Z0-9])${escapeRegExp(brand)}([^A-Z0-9]|$)`).test(upper)) || '';
};
const parseMoney = (value) => Number(String(value ?? '').replace(/[^0-9.-]+/g, '')) || 0;
const parseStock = (value) => Math.max(0, Math.trunc(Number(String(value ?? '').replace(/[^0-9-]+/g, '')) || 0));
const vatInclusivePrice = (cost) => Math.round((cost * 115) / 100);

const classify = (title, size) => {
  const upper = clean(title).toUpperCase();
  const upperSize = clean(size).toUpperCase();
  if (/\b(?:TUBE|FLAP)\b/.test(upper)) return { productType: 'TYRE', category: 'Tubes & Flaps' };
  if (/\b(?:STEER|DRIVE|TRAILER|MULTI|TBR)\b/.test(upper)
    || /R(?:17\.5|19\.5|22\.5)\b/.test(upperSize)
    || /^(?:7\.50|8\.25|9\.00|10\.00|11|12)R(?:16|20|22\.5)\b/.test(upperSize)) {
    return { productType: 'TYRE', category: 'Truck / Bus' };
  }
  if (/\b(?:IND|OTR|E[2-5]|L[3-5]|R[1-4]|SKS|RIB|F[1-3])\b/.test(upper)
    || /(?:^|\D)(?:1[2-9]|2[0-9])(?:\.\d+)?(?:\/\d+)?-\d{2}(?:\.\d+)?\b/.test(upperSize)) {
    return { productType: 'TYRE', category: 'OTR / Agricultural' };
  }
  return { productType: 'TYRE', category: 'Passenger / SUV / LDV' };
};

const parseTitle = (title) => {
  const original = clean(title);
  const accessory = /\b(?:TUBE|FLAP)\b/i.test(original);
  const size = extractSize(original);
  const brand = accessory ? '' : extractBrand(original);
  const ratings = unique(original.match(ratingPattern) || []).map((value) => value.replace(/\s+/g, '').replace(/PLY$/i, 'PR'));
  const withoutSize = removeOnce(original, size);
  let remainder = removeOnce(withoutSize, brand);
  const indexes = unique((brand ? withoutSize.slice(0, withoutSize.toUpperCase().indexOf(brand)) : withoutSize).match(indexPattern) || [])
    .slice(0, 1).map((value) => value.replace(/\s+/g, ''));
  const specs = unique(original.match(specsPattern) || []).map((value) => value.trim().replace(/RUN\s*FLAT/i, 'RUNFLAT'));
  remainder = remainder.replace(ratingPattern, ' ').replace(specsPattern, ' ');
  indexes.forEach((value) => { remainder = removeOnce(remainder, value); });
  return {
    size,
    brand,
    pattern: clean(remainder.replace(/\*+/g, '').replace(/\s+-\s+/g, ' ')),
    rating: ratings.join(' / '),
    index: indexes.join(' / '),
    specs: specs.join(' / ')
  };
};

const rawDocument = JSON.parse(await readFile(resolve(input), 'utf8'));
const rawRows = Array.isArray(rawDocument) ? rawDocument : rawDocument.rows;
if (!Array.isArray(rawRows) || rawRows.length === 0) throw new Error('The live capture contains no products.');

const duplicateCounts = new Map();
const items = rawRows.map((row, rowIndex) => {
  const productName = clean(row.name);
  const parsed = parseTitle(productName);
  const cost = parseMoney(row.price);
  const stock = parseStock(row.stock);
  if (!productName || cost < 0) throw new Error(`Invalid live product at row ${rowIndex + 1}.`);
  const identityBase = `${productName}|${cost}|${stock}`;
  const duplicateIndex = duplicateCounts.get(identityBase) || 0;
  duplicateCounts.set(identityBase, duplicateIndex + 1);
  const sourceKey = `safety-grip-live-${createHash('sha1').update(`${token(identityBase)}|${duplicateIndex}`).digest('hex').slice(0, 20)}`;
  const kind = classify(productName, parsed.size);
  return {
    source_key: sourceKey,
    product_type: kind.productType,
    product_name: productName,
    supplier_sku: sourceKey,
    brand: parsed.brand,
    tyre_pattern: parsed.pattern,
    tyre_rating: parsed.rating,
    tyre_index: parsed.index,
    tyre_specs: parsed.specs,
    category: kind.category,
    size: parsed.size,
    stock_location: 'Supplier Network',
    stock_by_location: { SUPPLIER: stock },
    stock_units_availability: stock > 0 ? 'In stock' : 'Out of stock',
    stock_units: stock,
    cost_price: cost,
    selling_price: vatInclusivePrice(cost),
    supplier_lead_time: '',
    product_url: 'https://safetygrip.brilliantcloud.online/SafetyGripCustomerPortal/Main?CompanyID=SafetyGrip&ScreenId=SP504001',
    source_file: basename(resolve(input))
  };
});

items.sort((left, right) => left.selling_price - right.selling_price || left.product_name.localeCompare(right.product_name));
await mkdir(dirname(resolve(output)), { recursive: true });
await writeFile(resolve(output), JSON.stringify(items, null, 2));

const summary = items.reduce((result, item) => {
  result.categories[item.category] = (result.categories[item.category] || 0) + 1;
  result.stockUnits += item.stock_units;
  if (!item.size) result.blankSizes += 1;
  if (item.product_type === 'TYRE' && !item.brand) result.blankBrands += 1;
  return result;
}, { rows: items.length, stockUnits: 0, blankSizes: 0, blankBrands: 0, categories: {} });

console.log(JSON.stringify({ input: resolve(input), output: resolve(output), ...summary }, null, 2));
