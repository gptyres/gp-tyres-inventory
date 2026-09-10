import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(process.argv[2]);
const expected={REVOLUTION_TYRES:626,TREADS_UNLIMITED:2224,SUMITOMO_DUNLOP:485,TYREWAREHOUSE:693,EXOTIC:1337,STAMFORD:790,ALINE:703};
const report=[];
for(const [key,count] of Object.entries(expected)){
 const items=JSON.parse(await readFile(resolve(root,'normalized',`${key}.json`),'utf8'));
 assert.equal(items.length,count,`${key} complete product coverage`);
 assert.equal(new Set(items.map(r=>r.source_key)).size,count,`${key} stable unique identities`);
 for(const row of items){
  assert.ok(['TYRE','WHEEL'].includes(row.product_type));
  for(const v of [row.cost_price,row.selling_price,row.stock_units])assert.ok(Number.isFinite(v)&&v>=0,`${key}/${row.supplier_sku} numeric value`);
  assert.equal(row.selling_price,Math.round(row.selling_price),`${key} nearest R1`);
  if(key!=='ALINE') assert.ok(Math.abs(row.selling_price-Math.round(row.cost_price*1.15+1e-8))<=1,`${key}/${row.supplier_sku} VAT once`);
  assert.equal(row.stock_units,Object.values(row.stock_by_location).reduce((a,b)=>a+b,0));
  assert.ok(Object.values(row.stock_by_location).every(v=>Number.isInteger(v)&&v>=0));
  assert.ok(row.imported_at.startsWith('2026-09-10T'));
  assert.ok(!row.product_url || !/\/shop\//.test(row.product_url), 'Image URL must not be a product HTML page');
  if(key==='SUMITOMO_DUNLOP')assert.ok(!Object.keys(row.stock_by_location).some(l=>/inbound/i.test(l)),'Inbound is not stock on hand');
  if(key==='ALINE')assert.ok(row.source_stock_detail.includes('Pricing basis: set of 4'));
 }
 report.push({catalog:key,products:count,stocked:items.filter(r=>r.stock_units>0).length,zeroStock:items.filter(r=>!r.stock_units).length,stockUnitsOrPortalMinimum:items.reduce((a,r)=>a+r.stock_units,0),warehouses:[...new Set(items.flatMap(r=>Object.keys(r.stock_by_location)))],missingBrand:items.filter(r=>!r.brand).length,missingSize:items.filter(r=>!r.size).length,firstCapture:items.map(r=>r.imported_at).sort()[0],lastCapture:items.map(r=>r.imported_at).sort().at(-1)});
}
await writeFile(resolve(root,'normalized/audit.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:true,catalogues:report.length,products:report.reduce((a,r)=>a+r.products,0),report},null,2));
