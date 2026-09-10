import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {parseSupplierTyreFields,extractSupplierTyreSize} from '../supplierTyreParsing.ts';

const root=resolve(process.argv[2]);
const pages=JSON.parse(await readFile(resolve(root,'captures/treadzone-full.json'),'utf8'));
const shipmentPages=JSON.parse(await readFile(resolve(root,'captures/treadzone-shipments-full.json'),'utf8'));
const prior=JSON.parse(await readFile(resolve(root,'backup/TREAD_ZONE.json'),'utf8'));
const old=new Map(prior.map(r=>[r.supplier_sku,r]));
const brands=[...new Set([...prior.map(r=>r.brand).filter(Boolean),'Solideal'])].sort((a,b)=>b.length-a.length);
const warehouses={'5761':'CPT','2966':'DUR','2956':'JHB','2951':'PLZ'};
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const escape=v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const products=new Map(),coverage=[];
let referenceSkus;
for(const [id,location] of Object.entries(warehouses)){
 const group=pages.filter(p=>p.warehouse.id===id).sort((a,b)=>a.page-b.page);
 assert.ok(group.length>0,`Missing ${location}`);
 assert.equal(group.length,group[0].last);
 assert.deepEqual(group.map(p=>p.page),Array.from({length:group.length},(_,i)=>i+1));
 assert.equal(group.at(-1).next,false);
 const rows=group.flatMap(p=>p.rows);
 const skus=rows.map(r=>clean(r.sku)).sort();
 assert.equal(new Set(skus).size,skus.length,`Duplicate ${location} products`);
 if(referenceSkus)assert.deepEqual(skus,referenceSkus,`Incomplete ${location} coverage`);else referenceSkus=skus;
 coverage.push({warehouse:location,pages:group.length,products:rows.length});
 for(const page of group)for(const raw of page.rows){
  const sku=clean(raw.sku),name=clean(raw.description||raw.name.replace(/\s+-\s+[^ ]+$/,''));
  const price=Number(clean(raw.price).replace(/[^\d.]/g,''));
  assert.ok(sku&&name&&Number.isFinite(price)&&price>0,`Invalid product/price ${sku}`);
  const stock=clean(raw.stock),match=stock.match(/^(\d+) In stock\b/i);
  assert.ok(match||/backorder|out of stock/i.test(stock),`Unrecognized stock ${sku}: ${stock}`);
  const quantity=match?Number(match[1]):0;
  assert.ok(Number.isInteger(quantity)&&quantity>=0);
  const previous=old.get(sku);
  const isTube=/^(?:Tube|Flap)\b/i.test(name)||/^Tubes\b/.test(previous?.category||'');
  const brand=brands.find(b=>new RegExp(`(?:^|\\s)${escape(b)}(?:\\s|$)`,'i').test(name))||'';
  const sizeText=name.replace(/^(?:Tube|Flap)\s*-?\s*/i,'');
  const size=sizeText.match(/^(?:VF|IF|LT)?\d+(?:\.\d+)?(?:[LX/\d.]+)?(?:ZRF|ZR|R|-|X|L)\d+(?:\.\d+)?(?:SL|MPT|NHS|CFO|C|LT)?\b/i)?.[0]||extractSupplierTyreSize(name);
  const description=name.replace(new RegExp(`^${escape(size)}\\s*`,'i'),'')
   .replace(/\((TL|TT|TTF|RWL|OWL|BSW|WSW|XL|NHS)\)/gi,' $1 ')
   .replace(brand?new RegExp(`\\b${escape(brand)}\\b`,'i'):/(?!)/,'');
  const parsed=parseSupplierTyreFields({description,explicitBrand:brand,explicitSize:size,inferBrandFromDescription:false});
  let product=products.get(sku);
  if(!product){
   product={catalog_key:'TREAD_ZONE',supplier:'Tread Zone',source_key:createHash('sha256').update(`TREAD_ZONE|${sku}`).digest('hex'),
    supplier_sku:sku,product_type:'TYRE',product_name:name,brand,category:previous?.category||(isTube?'Tubes':''),
    size:parsed.size,tyre_pattern:isTube?'':parsed.pattern,tyre_rating:isTube?'':parsed.rating,tyre_index:isTube?'':parsed.index,tyre_specs:isTube?'':parsed.specs,
    stock_by_location:{},stock_location:'',stock_units:0,stock_units_availability:'',
    cost_price:price,selling_price:Math.round(price*1.15+1e-8),product_url:raw.image||null,
    imported_at:page.captured_at,supplier_lead_time:null,
    source_file:'Codex browser Tread Zone complete four-warehouse catalogue 2026-09-10',source_stock_detail:''};
   product._source=[];products.set(sku,product);
  }
  assert.equal(product.cost_price,price,`Different warehouse cost for ${sku}; retain region-specific offers instead of flattening`);
  assert.equal(product.product_name,name,`Conflicting product identity ${sku}`);
  assert.equal(product.stock_by_location[location],undefined);
  product.stock_by_location[location]=quantity;
  product._source.push({warehouse:page.warehouse,source:page.source,captured_at:page.captured_at,raw});
  product.imported_at=[product.imported_at,page.captured_at].sort().at(-1);
 }
}
assert.deepEqual(shipmentPages.map(p=>p.page),Array.from({length:shipmentPages[0].last},(_,i)=>i+1));
assert.equal(shipmentPages.at(-1).next,false);
assert.ok(shipmentPages.every(p=>p.warehouse.id==='2965'));
const shipments=new Map(shipmentPages.flatMap(p=>p.rows.map(raw=>[raw.sku,{raw,captured_at:p.captured_at,warehouse:p.warehouse,source:p.source}])));
assert.deepEqual([...shipments.keys()].sort(),referenceSkus);
const rows=[...products.values()].sort((a,b)=>a.supplier_sku.localeCompare(b.supplier_sku)).map(p=>{
 p.stock_units=Object.values(p.stock_by_location).reduce((sum,n)=>sum+n,0);
 p.stock_location=Object.entries(p.stock_by_location).map(([loc,n])=>`${loc}: ${n}`).join(' | ');
 p.stock_units_availability=p.stock_units?'In stock':'Out of stock';
 if(!/^Tubes\b/.test(p.category))p.product_name=[p.size,p.brand,p.tyre_pattern].filter(Boolean).join(' ');
 p.source_stock_detail=JSON.stringify({price_basis:'Cost excluding VAT; 15% VAT added once, nearest R1',
  category_source:'Existing supplier SKU metadata retained',catalogue_entry_type:/^Tubes\b/.test(p.category)?'Tube/flap (existing catalogue entry)':'Tyre',warehouses:p._source,
  incoming_shipment:{...shipments.get(p.supplier_sku),excluded_from_available_stock:true}});
 delete p._source;return p;
});
assert.equal(rows.length,referenceSkus.length);
for(const row of rows){
 assert.equal(row.selling_price,Math.round(row.cost_price*1.15+1e-8));
 assert.equal(row.stock_units,Object.values(row.stock_by_location).reduce((n,q)=>n+q,0));
 assert.equal(Object.keys(row.stock_by_location).length,4);
 assert.ok(row.size,`Source tyre/tube size was lost: ${row.supplier_sku}`);
 if(row.brand)assert.ok(!new RegExp(`^${escape(row.brand)}(?:\\s|$)`,'i').test(row.tyre_pattern),`Repeated brand: ${row.supplier_sku}`);
}
await mkdir(resolve(root,'normalized'),{recursive:true});
await writeFile(resolve(root,'normalized/TREAD_ZONE.json'),JSON.stringify(rows,null,2));
const audit={coverage,products:rows.length,tyres:rows.filter(r=>!/^Tubes\b/.test(r.category)).length,
 tubesAndFlaps:rows.filter(r=>/^Tubes\b/.test(r.category)).length,stocked:rows.filter(r=>r.stock_units>0).length,
 unavailable:rows.filter(r=>!r.stock_units).length,units:rows.reduce((s,r)=>s+r.stock_units,0),
 blankBrands:rows.filter(r=>!r.brand).map(r=>r.supplier_sku),blankSizes:rows.filter(r=>!r.size).map(r=>r.supplier_sku)};
await writeFile(resolve(root,'normalized/TREAD_ZONE-audit.json'),JSON.stringify(audit,null,2));
console.log(JSON.stringify(audit,null,2));
