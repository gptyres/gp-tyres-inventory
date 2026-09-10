import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(process.argv[2]);
const capture=JSON.parse(await readFile(resolve(root,'captures/eibach-full.json'),'utf8'));
assert.equal(capture.queue.length,0,'Every discovered category/page must be visited');
const listed=new Map(capture.products.map(r=>[r.id,r]));
assert.equal(capture.details.length,listed.size);
assert.equal(new Set(capture.details.map(r=>r.id)).size,listed.size);
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const rows=capture.details.map(d=>{
 const listing=listed.get(d.id);assert.ok(listing);
 const categories=listing.categories;
 const deepest=categories.toSorted((a,b)=>b.url.split('/').length-a.url.split('/').length)[0];
 const brand=listing.brand==='Chrystler'?'Chrysler':listing.brand==='Landcruiser'?'Toyota Land Cruiser':listing.brand;
 const model=deepest.name===listing.brand?'':deepest.name;
 const lines=(d.description||d.shortDescription||'').split('\n').map(clean).filter(s=>s&&s!=='Description');
 const fitment=lines.filter(s=>!/^(?:Lowering (?:Rear|Front)|(?:Rear|Front) Lowering)\s*:/i.test(s));
 const prefix=[brand,model].filter(Boolean).join(' ');
 const source=fitment.join(' ')||d.name.replace(/\b(?:Pro[- ]?Kit|Sportline|Lift Kit)\b/gi,' ').trim();
 const year=lines.join(' ').match(/\b((?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:19|20)\d{2}|present|current)\b/i);
 const lowering=axle=>lines.join(' | ').match(new RegExp(`(?:Lowering\\s+${axle}|${axle}\\s+Lowering)\\s*:?\\s*([^|]+)`,'i'))?.[1]?.trim()||'';
 // Unpriced, unavailable products omit the detail stock element. Their rendered
 // category cards explicitly carry WooCommerce's outofstock state.
 const stockStatus=d.stock || (/\boutofstock\b/.test(listing.state||'')?'Out of stock':'');
 const stock=stockStatus.match(/^(\d+) in stock$/i);
 assert.ok(stock || /out of stock|backorder/i.test(stockStatus),`Stock not numeric or unavailable: ${d.id} ${d.stock}`);
 const price=Number(String(d.price||'').replace(/[^\d.]/g,''));
 assert.ok(Number.isFinite(price)&&price>=0);
 assert.ok(!stock || Number(stock[1])===0 || price>0,'Do not publish available stock without a price');
 return {websiteProductId:Number(d.id),supplierSku:d.sku||'',vehicleBrand:brand,vehicleModel:model,
  productName:clean(d.name),productLine:/sportline/i.test(`${d.name} ${lines}`)?'SPORTLINE':/lift\s*kit|pro-lift/i.test(`${d.name} ${lines}`)?'LIFT KIT':'PRO-KIT',
  vehicleCompatibility:source.toUpperCase().includes(prefix.toUpperCase())?source:`${prefix} ${source}`.trim(),
  yearRange:year?`${year[1]} - ${year[2]}`:'',frontLowering:lowering('Front'),rearLowering:lowering('Rear'),
  details:fitment.join(' | '),stockUnits:stock?Number(stock[1]):0,stockStatus,costPrice:price,
  imageUrl:d.image||'',sourceUrl:d.source};
}).sort((a,b)=>a.vehicleBrand.localeCompare(b.vehicleBrand)||a.vehicleModel.localeCompare(b.vehicleModel)||a.websiteProductId-b.websiteProductId);
const brands=[...new Set(rows.map(r=>r.vehicleBrand))].sort();
const syncedAt=capture.details.map(r=>r.captured_at).sort().at(-1);
await writeFile(resolve('supplier_data/eibachData.ts'),
 '// Generated from complete Codex browser category and product-page captures.\n'
 +'// Existing approved Eibach pricing policy is applied separately by supplierPricing.ts.\n'
 +`export const EIBACH_CATALOG_SOURCE_URL = "https://www.eibachsa.co.za/index.php/product-category/eibach-products/";\n`
 +`export const EIBACH_CATALOG_SYNCED_AT = ${JSON.stringify(syncedAt)};\n`
 +`export const EIBACH_VEHICLE_BRANDS = ${JSON.stringify(brands,null,2)} as const;\n`
 +`export const EIBACH_ROWS = ${JSON.stringify(rows,null,2)} as const;\n`);
console.log(JSON.stringify({products:rows.length,brands:brands.length,stocked:rows.filter(r=>r.stockUnits>0).length,units:rows.reduce((sum,r)=>sum+r.stockUnits,0)}));
