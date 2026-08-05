import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
};

const inputFile = argument('--file');
const outputFile = argument('--out') || 'aline_cataloghive_items.json';
if (!inputFile) throw new Error('Usage: --file <raw.json> [--out <items.json>]');

const rows = JSON.parse(await readFile(resolve(inputFile), 'utf8'));
if (!Array.isArray(rows) || rows.length === 0) throw new Error('The A-Line extraction contains no rows.');

const money = (value) => Number(String(value || '').replace(/[^0-9.-]/g, '')) || 0;
const quantity = (value) => Math.max(0, Number.parseInt(String(value || '').replace(/[^0-9-]/g, ''), 10) || 0);
const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const finishHints = [
  ['ARCTICSILVERMF', 'ARCTIC SILVER'], ['ARCTICSILVER', 'ARCTIC SILVER'],
  ['ARCTICSIL', 'ARCTIC SILVER'], ['ARCTIC SILVER', 'ARCTIC SILVER'],
  ['AMBER BRNZ', 'AMBER BRONZE'], ['BKML', 'BLACK MACHINED LIP'],
  ['BLKML', 'BLACK MACHINED LIP'], ['BRNZ BLK LIP', 'BRONZE BLACK LIP'],
  ['BRONZE BLK LIP', 'BRONZE BLACK LIP'], ['CRYSTAL SILVER', 'CRYSTAL SILVER'],
  ['DARK TINT SMOKE', 'DARK TINT SMOKE'], ['DIAMOND BLK', 'DIAMOND BLACK'],
  ['GLOSS BLACK', 'GLOSS BLACK'], ['GLOSS BLK', 'GLOSS BLACK'],
  ['GLOSSBLK', 'GLOSS BLACK'], ['GMML', 'GMMF'], ['GMMF', 'GMMF'],
  ['GM MF', 'GMMF'], ['GRAPHITE', 'GRAPHITE'], ['GRANITE', 'GRANITE'],
  ['HYPER BLACK', 'HYPER BLACK'], ['HYPERBLK', 'HYPER BLACK'],
  ['HYPER SILVER', 'HYPER SILVER'], ['MATT CHG', 'MATT CHG'],
  ['MATT TITANIUM', 'MATT TITANIUM'], ['MACHINE FACE', 'MACHINE FACE'],
  ['MACHINED', 'MACHINED'], ['POLISHED LIP', 'POLISHED LIP'],
  ['SATIN BLACK TINT', 'SATIN BLACK TINT'], ['SATIN BLK TINT', 'SATIN BLACK TINT'],
  ['SATINBLK TINT', 'SATIN BLACK TINT'], ['SATIN BLACK', 'SATIN BLACK'],
  ['SATIN BLK', 'SATIN BLACK'], ['SATINBLK', 'SATIN BLACK'],
  ['SEPANG SILVER', 'SEPANG SILVER'], ['SILK BLACK', 'SILK BLACK'],
  ['SILK BLK', 'SILK BLACK'], ['SILKBLK', 'SILK BLACK'],
  ['SLKBLK', 'SILK BLACK'], ['SLBLK', 'SILK BLACK'],
  ['SSML', 'SILVER MACHINED LIP'], ['SSMF', 'SSMF'],
  ['STBKTNT', 'SATIN BLACK TINT'], ['STBLKTNT', 'SATIN BLACK TINT'],
  ['STBKML', 'SATIN BLACK MACHINED LIP'], ['STBKMILLED', 'SATIN BLACK MILLED'],
  ['STBLK', 'SATIN BLACK'], ['STBK', 'SATIN BLACK'],
  ['TINTED SMOKE', 'TINTED SMOKE'], ['TITANIUM BLK LIP', 'TITANIUM BLACK LIP'],
  ['VELVET BLACK', 'VELVET BLACK'], ['VELVET BLK', 'VELVET BLACK'],
  ['VELVETBLK', 'VELVET BLACK'], ['VELBLK', 'VELVET BLACK'],
  ['GOLD', 'GOLD'], ['CIDER', 'CIDER'], ['CHG TINT', 'CHG TINT'],
  ['CHGTINT', 'CHG TINT'], ['CHGTNT', 'CHG TINT'], ['CHG', 'CHG']
];

const normalizeToken = (value) => normalize(value)
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/[^A-Za-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const finishFromDescription = (description) => {
  const normalized = normalizeToken(description);
  return finishHints
    .filter(([hint]) => normalized.includes(normalizeToken(hint)))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[1] || '';
};

const normalizePcdDiameter = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '';
  if (parsed === 114) return '114.3';
  if (parsed === 139) return '139.7';
  return String(parsed);
};

const normalizeDesign = (value) => {
  const words = normalizeToken(value).split(' ').filter(Boolean);
  const first = words[0] || '';
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
  return first;
};

const detailsFromRow = (row) => {
  const description = normalize(row.description);
  const fitment = normalize(row.fitment);
  const fitmentHead = fitment.split(/\s+—\s+/)[0] || '';
  const parts = fitmentHead.split(/\s*·\s*/).map(normalize).filter(Boolean);
  const compact = description.replace(/\s+/g, '');
  const rawSpec = compact.match(/^([3-6])(\d{3})(\d{2})X(\d{1,2}(?:\.\d+)?)(?:\/(\d{2,3}(?:\.\d)?))?/i);
  const pcdFitment = parts.find((part) => /^\d+x\d+(?:\.\d+)?$/i.test(part));
  const sizeFitment = parts.find((part) => /^\d{2}x\d{1,2}(?:\.\d+)?"?$/i.test(part));
  const offsetFitment = parts.find((part) => /^ET-?\d+/i.test(part));
  const designFitment = parts.find((part, index) => index >= 3 && !/^ET/i.test(part));
  const fallbackDesign = rawSpec
    ? description.slice(rawSpec[0].length).split(/\b(?:ET\s*-?\d+|\d{2,3}\.\d)\b/i)[0]
    : description;
  const remainingDescription = rawSpec ? description.slice(rawSpec[0].length) : description;
  const centerBore = remainingDescription.match(/\b(?:CB\s*)?(\d{2,3}\.\d)\b/i)?.[1] || '';
  const explicitOffset = (offsetFitment || description.match(/\bET\s*(-?\d+)/i)?.[0] || '').replace(/^ET\s*/i, '');
  const inferredOffset = explicitOffset
    ? ''
    : remainingDescription.match(/\b(-?\d{2})(?!\.\d)(?:\s*[FR])?(?:\s*\(RS\))?\b/i)?.[1] || '';
  const rawPcd = rawSpec
    ? [
        `${rawSpec[1]}/${normalizePcdDiameter(rawSpec[2])}`,
        rawSpec[5] ? `${rawSpec[1]}/${normalizePcdDiameter(rawSpec[5])}` : ''
      ].filter(Boolean).join(' & ')
    : '';
  return {
    size: rawSpec ? `${rawSpec[3]}X${rawSpec[4]}` : sizeFitment ? sizeFitment.replace('"', '').toUpperCase() : '',
    pcd: rawPcd || (pcdFitment ? pcdFitment.replace('x', '/') : ''),
    offset: explicitOffset || inferredOffset,
    centerBore,
    design: normalizeDesign(designFitment || fallbackDesign),
    finish: finishFromDescription(description)
  };
};

const grouped = new Map();
for (const row of rows) {
  const sku = normalize(row.stock_code);
  if (!sku) continue;
  const existing = grouped.get(sku);
  if (existing) {
    existing.categories.add(normalize(row.category));
    for (const field of ['description', 'fitment', 'qty_jhb', 'qty_cpt', 'qty_dbn', 'dealer_price_display', 'rrp_display']) {
      if (normalize(existing.row[field]) !== normalize(row[field])) {
        throw new Error(`A-Line ${sku} has inconsistent ${field} values across categories.`);
      }
    }
  } else {
    grouped.set(sku, { row, categories: new Set([normalize(row.category)]) });
  }
}

const sourceFile = basename(inputFile);
const items = [...grouped.entries()].map(([sku, entry]) => {
  const row = entry.row;
  const wheel = detailsFromRow(row);
  const stockByLocation = {
    JHB: quantity(row.qty_jhb),
    CPT: quantity(row.qty_cpt),
    DUR: quantity(row.qty_dbn)
  };
  const stockUnits = Object.values(stockByLocation).reduce((total, value) => total + value, 0);
  const dealerSetPrice = money(row.dealer_price_display);
  const retailSetPrice = money(row.rrp_display);
  const costPrice = Math.round(dealerSetPrice * 100) / 100;
  const sellingPrice = Math.round((retailSetPrice || dealerSetPrice) * 100) / 100;
  const stockLocation = Object.entries(stockByLocation).map(([location, value]) => `${location}: ${value}`).join(' | ');
  const imageUrl = normalize(row.image_url);
  return {
    catalog_key: 'ALINE',
    source_key: `aline-${sku.toLowerCase()}`,
    product_type: 'WHEEL',
    supplier: 'Aline',
    supplier_sku: sku,
    brand: 'A-Line',
    product_name: `A-Line ${wheel.design || normalize(row.description)}${wheel.finish ? ` ${wheel.finish}` : ''}`,
    tyre_pattern: wheel.design || normalize(row.description),
    tyre_specs: wheel.finish || null,
    wheel_pcd: wheel.pcd || null,
    wheel_offset: wheel.offset || null,
    wheel_center_bore: wheel.centerBore || null,
    stock_by_location: stockByLocation,
    category: [...entry.categories].filter(Boolean).sort().join(' / ') || 'Wheels',
    size: wheel.size || '',
    stock_location: stockLocation,
    stock_units_availability: stockUnits > 0 ? 'In stock' : 'Out of stock',
    stock_units: stockUnits,
    cost_price: costPrice,
    selling_price: sellingPrice,
    product_url: imageUrl ? new URL(imageUrl, 'https://alinewheels.cataloghive.com/').href : null,
    source_stock_detail: `${stockLocation} | Pricing basis: set of 4 | Dealer set incl VAT: R${dealerSetPrice.toFixed(2)} | RRP set: R${retailSetPrice.toFixed(2)}`,
    source_file: sourceFile
  };
}).sort((a, b) => a.product_name.localeCompare(b.product_name) || a.supplier_sku.localeCompare(b.supplier_sku));

const invalid = items.filter((item) => !item.size || !item.wheel_pcd || !item.wheel_offset || item.cost_price <= 0 || item.selling_price <= 0);
const summary = {
  sourceRows: rows.length,
  products: items.length,
  stockUnits: items.reduce((total, item) => total + item.stock_units, 0),
  missingSize: items.filter((item) => !item.size).length,
  missingPcd: items.filter((item) => !item.wheel_pcd).length,
  missingOffset: items.filter((item) => !item.wheel_offset).length,
  missingCenterBore: items.filter((item) => !item.wheel_center_bore).length,
  invalidCoreFields: invalid.length,
  minCost: Math.min(...items.map((item) => item.cost_price)),
  maxCost: Math.max(...items.map((item) => item.cost_price))
};

await writeFile(resolve(outputFile), JSON.stringify(items, null, 2), 'utf8');
console.log(JSON.stringify(summary, null, 2));
