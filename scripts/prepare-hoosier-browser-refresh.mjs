import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(process.argv[2]);
const capture=JSON.parse(await readFile(resolve(root,'captures/hoosier-details-full.json'),'utf8'));
const listing=JSON.parse(await readFile(resolve(root,'captures/hoosier-full.json'),'utf8')).pages;
assert.equal(listing.length,6);
assert.equal(capture.rows.length,66);
assert.equal(new Set(capture.rows.map(r=>r.sku)).size,66);
assert.deepEqual(capture.rows.map(r=>r.sku).sort(),listing.flatMap(p=>p.rows.map(r=>r.sku)).sort());
const rows=capture.rows.filter(r=>r.category!=='Tubes').map(r=>{
 const stock=r.stock.match(/^(\d+) in stock$/i);
 assert.ok(stock || /backorder/i.test(r.stock),`Unknown stock for ${r.sku}`);
 const parts=r.name.split(/\s+[\u2013\u2014]\s+/);
 const price=Number(r.price.replace(/[^\d,]/g,'').replace(',','.'));
 assert.ok(parts.length===2&&price>0,`Missing Hoosier size or price ${r.sku}`);
 return {websiteProductId:Number(r.id),supplierSku:r.sku,brand:'HOOSIER',
  pattern:parts[0].replace(/^Hoosier\s+/i,''),size:parts[1].replace(/\u00d7/g,'X').replace(/\s+/g,'').toUpperCase(),
  category:r.category,productName:r.name,stockUnits:stock?Number(stock[1]):0,
  orderStatus:stock?'AVAILABLE':'PREORDER',websiteStockDetail:r.stock,
  sellingPrice:Math.round(price),imageUrl:r.image,sourceUrl:r.source,
  sourceSpecifications:r.description?.match(/Specifications\n([\s\S]*?)(?:\n\n|$)/)?.[1]||'',
  sourceRestrictions:(r.description?.split('\n').filter(line=>line.startsWith('⚠'))||[]).join(' '),
  capturedAt:r.captured_at};
});
assert.equal(rows.length,64);
const syncedAt=capture.rows.map(r=>r.captured_at).sort().at(-1);
await writeFile(resolve('supplier_data/hoosierData.ts'),
 '// Generated from complete Codex browser catalogue and individual product-page captures.\n'
 +'// Website prices already include VAT; no VAT is added again.\n'
 +`export const HOOSIER_CATALOG_SOURCE_URL = ${JSON.stringify(capture.source)};\n`
 +`export const HOOSIER_CATALOG_SYNCED_AT = ${JSON.stringify(syncedAt)};\n`
 +`export const HOOSIER_ROWS = ${JSON.stringify(rows,null,2)} as const;\n`);
await writeFile(resolve(root,'normalized/hoosier-excluded-tubes.json'),JSON.stringify(capture.rows.filter(r=>r.category==='Tubes'),null,2));
console.log(JSON.stringify({products:rows.length,stocked:rows.filter(r=>r.stockUnits>0).length,preorder:rows.filter(r=>!r.stockUnits).length,units:rows.reduce((s,r)=>s+r.stockUnits,0),categories:Object.fromEntries([...new Set(rows.map(r=>r.category))].map(c=>[c,rows.filter(r=>r.category===c).length]))}));
