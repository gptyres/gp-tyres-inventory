import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { transform } from 'esbuild';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const argument = name => { const index = process.argv.indexOf(name); return index < 0 ? '' : process.argv[index + 1] || ''; };
const input = argument('--input');
const output = argument('--output');
const expected = Number(argument('--expected-rows'));
if (!input || !output || !Number.isInteger(expected) || expected < 1) throw new Error('Usage: --input <raw.json> --output <directory> --expected-rows <count> [--previous <snapshot.json>]');
await mkdir(resolve(output), { recursive: true });
const parserSource = await readFile(new URL('../supplierTyreParsing.ts', import.meta.url), 'utf8');
const { code } = await transform(parserSource, { loader: 'ts', format: 'esm' });
const { parseSupplierTyreFields } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const raw = JSON.parse(await readFile(resolve(input), 'utf8'));
assert.equal(raw.rows.length, expected, 'Must match the final live ATT catalogue count');
assert.equal(new Set(raw.rows.map(r => r.sku)).size, expected, 'Duplicate supplier SKU');
const aliases = { LANV: 'LANVIGATOR', LANVI: 'LANVIGATOR', LANVIG: 'LANVIGATOR', AUTOG: 'AUTOGRIP', 'F-RUN': 'FULLRUN', MARCH: 'MARCHER' };
const portalBrands = ['ANCHEE','ANNAITE','AUTOGRIP','AUTOG','BISON','BLACKLION','BRUTUS','CEAT','CHAOYANG','D/COIN','D/S','FULLRUN','F-RUN','HILO','LANVIGATOR','LANVIG','LANVI','LANV','LEAO','MARANGONI','MARCHER','MARCH','MULTISTAR','NEUMASTER','NUMA','RISEN','R/S','SOLO','SPEEDWAYS','SPEEDWAY','SUNBEAR','TALON','TECHKING','TIANLI','W/P','WELLPLUS','ZEXTOUR'];
const escape = value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const parseTitle = description => {
  const fractional = description.match(/^\d+(?:\s+\d+\/\d+)?\s*X\s*\d+(?:\.\d+)?-\d+(?:\s+\d+\/\d+)?/i)?.[0];
  const size = fractional || description.match(/^(?:LT|VF|IF)?\d[\d./]*(?:L|[X*]\d[\d./]*)?(?:ZR|R|D|-)\d+(?:\.\d+)?(?:LT|C)?/i)?.[0] || '';
  const found = portalBrands.map(brand=>new RegExp(`(?:^|\\s)(${escape(brand)})(?=\\s|$)`,'i').exec(description)).filter(Boolean).sort((a,b)=>a.index-b.index)[0];
  const brand = found?.[1] || '';
  const brandPosition = found ? found.index + found[0].length - brand.length : -1;
  const prefix = brandPosition >= 0 ? description.slice(size.length,brandPosition).trim() : '';
  const tail = (brandPosition >= 0 ? description.slice(brandPosition+brand.length).trim() : description.slice(size.length).trim()).replace(/\b(VMAX)(\d{2,3}\/\d{2,3}[A-Z])\b/,'$1 $2');
  const parsed = parseSupplierTyreFields({description:tail,explicitSize:size,explicitBrand:brand});
  parsed.size = size.replaceAll('*','X');
  parsed.brand = brand;
  parsed.specs = [prefix,parsed.specs].filter(Boolean).join(' / ');
  return parsed;
};
const previous = argument('--previous') ? JSON.parse(await readFile(resolve(argument('--previous')), 'utf8')) : [];
const identity = (fields) => `${fields.size}|${aliases[fields.brand] || fields.brand}|${fields.pattern}`.toUpperCase().replace(/[^A-Z0-9|]/g,'');
const previousCategories = new Map();
for(const row of previous){
  const parsed = parseSupplierTyreFields({description:row.product_name,explicitSize:row.size,inferBrandFromDescription:true});
  previousCategories.set(identity(parsed),row.category);
}
const classify = (size, description) => {
  if (/\b(?:OTR|INDUSTRIAL|FORKLIFT|AGRI|TRACTOR|SOLID)\b/i.test(description) || /(?:R|-)(?:24|25|26|28|30|32|33|34|38|42|46)\b/.test(size)) return 'OTR / AGRICULTURAL / INDUSTRIAL';
  if (/R(?:17\.5|19\.5|22\.5|24\.5)\b/.test(size) || /^(?:7\.50|8\.25|9\.00|10\.00|11\.00|12\.00|11|12|13|14)(?:R|-)20\b/.test(size)) return 'TRUCK / TBR';
  return 'PASSENGER / SUV / LDV';
};
const issues = [];
const unavailable = raw.rows.filter(row => row.availability === 'Unavailable' && row.cost === '-' && row.stock === '');
const nonInventory = raw.rows.filter(row=>/TRAINING DEMO PRODUCT/i.test(row.description));
const items = raw.rows.filter(row=>!nonInventory.includes(row)).map((row, index) => {
  const isUnavailable = unavailable.includes(row);
  if (!isUnavailable) {
    assert.match(row.stock, /^\d+\+?$/, `Invalid stock at row ${index+1}`);
    assert.match(row.cost, /^[\d,]+\.\d{2}$/, `Invalid cost at row ${index+1}`);
  }
  // Zero is the database sentinel for an undisclosed price, not a free item.
  const costCents = isUnavailable ? 0 : Math.round(Number(row.cost.replaceAll(',', '')) * 100);
  assert.ok(Number.isSafeInteger(costCents) && costCents >= 0);
  const wheel = /^RIM\s/i.test(row.description) || /^R(?:\d|-)/.test(row.sku);
  const description = row.description.replace(/((?:R|-)\d+)\.50\b/g,'$1.5').replace(/^(\d+(?:\.\d+)?)\s*[xX]\s*(\d)/,'$1X$2');
  const parsed = wheel ? {size:row.description.match(/^(?:RIM\s+)?(\d+(?:\.\d+)?)\s*X\s*(\d+(?:\.\d+)?)/i)?.slice(1).map(Number).join('x')||row.description.match(/^[\d.]+-[\d.]+/)?.[0]||'',brand:'',pattern:'',rating:'',index:'',specs:''} : parseTitle(description);
  parsed.brand = aliases[parsed.brand] || parsed.brand;
  if (!parsed.size || (!parsed.brand && !wheel && !/^(?:RCS|LLS)/.test(row.sku)) || (!isUnavailable && costCents === 0)) issues.push({ sku: row.sku, description: row.description, size: parsed.size, brand: parsed.brand, cost: costCents/100 });
  const stock = isUnavailable ? 0 : Number.parseInt(row.stock, 10);
  return {
    source_key: `att-live-${createHash('sha1').update(row.sku).digest('hex').slice(0,20)}`,
    product_type: wheel ? 'WHEEL' : 'TYRE',
    supplier_sku: row.sku,
    product_name: wheel ? row.description : [parsed.size, parsed.brand, parsed.pattern].filter(Boolean).join(' '),
    brand: parsed.brand,
    size: parsed.size,
    tyre_pattern: parsed.pattern,
    tyre_rating: parsed.rating,
    tyre_index: parsed.index,
    tyre_specs: parsed.specs,
    category: wheel ? 'Rim' : /^FT-/.test(row.sku) ? 'Forklift' : /^PB-/.test(row.sku) ? 'Industrial' : /^(?:RCS|LLS)/.test(row.sku) ? 'Retread Stock' : previousCategories.get(identity(parsed)) || (/FARMAX|TORQUEMAX|SPRAYMAX|FLOT|TRACTOR|IMPLEMENT|FARM IMP|YIELDMAX|IRRIG|(?:\sR1W?\s)/i.test(description) ? 'Agricultural' : classify(parsed.size, row.description)),
    stock_location: 'CAPE TOWN',
    stock_by_location: { CPT: stock },
    stock_units: stock,
    stock_units_availability: isUnavailable ? 'Unavailable — price on request' : row.stock.endsWith('+') ? `${row.stock} (supplier minimum)` : stock > 0 ? 'In stock' : 'Out of stock',
    cost_price: costCents / 100,
    selling_price: Math.floor((costCents * 115 + 5000) / 10000),
    product_url: row.image?.endsWith('/42f0dc30-816f-47cb-9243-3856558346e6') ? '' : row.image || '',
    source_stock_detail: JSON.stringify({ description: row.description, quantity_display: row.stock, quantity_is_minimum: row.stock.endsWith('+'), warehouse: raw.warehouse, price_basis: isUnavailable ? 'Not displayed by supplier' : 'Your Price (Excl)', price_available: !isUnavailable, availability: row.availability || 'In stock', captured_at: raw.captured_at, catalogue_url: raw.source }),
    source_file: `att-live-browser-${raw.captured_at.slice(0,10)}`,
    imported_at: raw.captured_at
  };
});
const summary = {
  capturedAt: raw.captured_at, warehouse: raw.warehouse, portalRows: raw.rows.length, rows: items.length, unavailableWithoutPrice: unavailable.length, excludedDemoProducts: nonInventory.length,
  inStockProducts: items.filter(r=>r.stock_units>0).length,
  stockUnitsMinimum: items.reduce((sum,r)=>sum+r.stock_units,0),
  supplierCappedQuantities: raw.rows.filter(r=>r.stock.endsWith('+')).length,
  brands: [...new Set(items.map(r=>r.brand))].sort(),
  categories: Object.fromEntries([...new Set(items.map(r=>r.category))].map(c=>[c,items.filter(r=>r.category===c).length])),
  issues
};
await writeFile(join(resolve(output),'att-snapshot.json'),JSON.stringify(items,null,2));
if (argument('--bundle')) {
  const bundle = resolve(argument('--bundle'));
  const rows = items.map(item => ({ ...item, catalog_key: 'ATT', supplier: 'ATT' }));
  await writeFile(bundle, `// Generated from the verified ATT live catalogue. Do not edit prices manually.\nimport type { LiveSupplierCatalogRow } from '../liveSupplierCatalog';\n\nexport const ATT_SNAPSHOT_ROWS: Array<Omit<LiveSupplierCatalogRow, 'id' | 'snapshot_id'>> = ${JSON.stringify(rows, null, 2)};\n`);
}
await writeFile(join(resolve(output),'att-validation.json'),JSON.stringify(summary,null,2));
await writeFile(join(resolve(output),'att-unavailable-without-price.json'),JSON.stringify(unavailable,null,2));
await writeFile(join(resolve(output),'att-non-inventory.json'),JSON.stringify(nonInventory,null,2));
const columns = ['supplier_sku','size','brand','tyre_pattern','tyre_rating','tyre_index','tyre_specs','category','stock_location','stock_units','stock_units_availability','cost_price','selling_price','product_url','imported_at'];
const cell = v => `"${String(v??'').replaceAll('"','""')}"`;
await writeFile(join(resolve(output),`ATT-latest-inventory-${raw.captured_at.slice(0,10)}.csv`), '\uFEFF' + [columns.map(cell).join(','),...items.map(r=>columns.map(c=>cell(['cost_price','selling_price'].includes(c) && r.cost_price === 0 ? '' : r[c])).join(','))].join('\r\n'));
console.log(JSON.stringify(summary,null,2));
