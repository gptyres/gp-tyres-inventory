import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {extractSupplierTyreSize} from '../supplierTyreParsing.ts';
import {cleanExclusiveTyresNewPattern} from './exclusive-tyres-new-normalization.mjs';

const root=resolve(process.argv[2]);
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const escape=v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const old=JSON.parse(await readFile(resolve(root,'backup/EXCLUSIVE_TYRES_NEW.json'),'utf8'));
const detailRows=JSON.parse(await readFile(resolve(root,'captures/exclusive-product-details.json'),'utf8'));
const details=new Map(detailRows.map(d=>[d.sku,d]));
const brands=[...new Set([...old.map(r=>r.brand).filter(Boolean),
 'BFGOODRICH','BRIDGESTONE','CONTINENTAL','DOUBLE COIN','DRIVEMASTER','FIRESTONE','LANDSPIDER',
 'WINDFORCE','YOKOHAMA','FIREMAX','GOODYEAR','LANDSAIL','TRACMAX','ANNAITE','GENERAL','KAPSEN',
 'ANCHEE','PIRELLI','DUNLOP','RADAR','TIMAX','XCENT','CEAT','ROADKING','DOUBLE KING',
 'ALPHA MOTORS','SUMITOMO','CENTARA','LONG TRAX','FULLRUN','KELLY','SAVA','MICHELIN','MAXXIS'])].sort((a,b)=>b.length-a.length);
const files=(await readdir(resolve(root,'captures'))).filter(f=>/^exclusive-(?:passenger|truck|motorcycle|light-truck|suv|4x4|run-flat|speciality|agriculture)-\d+\.json$/.test(f));
const pages=JSON.parse(await readFile(resolve(root,'captures/exclusive-progress.json'),'utf8'));
for(const file of files)pages.push(JSON.parse(await readFile(resolve(root,'captures',file),'utf8')));
const pageMap=new Map(pages.map(p=>[`${new URL(p.url).pathname}|${p.page}`,p]));
const categories=['passenger-car','run-flat','suv','4x4','light-truck','truck-bus','speciality','agriculture','motorcycle'];
const products=new Map(),coverage=[];
for(const category of categories){
 const group=[...pageMap.values()].filter(p=>new URL(p.url).pathname.endsWith(`/${category}`)).sort((a,b)=>a.page-b.page);
 assert.ok(group.length,`Missing category ${category}`);
 const totalText=clean(group[0].amount);
 const expected=Number(totalText.match(/of ([\d,]+) products?/)?.[1]?.replaceAll(',','')||totalText.match(/Showing ([\d,]+) products?/)?.[1]?.replaceAll(',','')||0);
 if(!expected)assert.match(group[0].empty_message||'',/We can't find products matching the selection/,'Empty catalogue must be explicitly confirmed');
 assert.deepEqual(group.map(p=>p.page),Array.from({length:Math.max(1,Math.ceil(expected/100))},(_,i)=>i+1),`Incomplete pages: ${category}`);
 assert.equal(group.at(-1).next,null,`${category} still has another page`);
 const skus=group.flatMap(p=>p.rows.map(r=>r.sku));
 assert.equal(skus.length,expected,`Count mismatch ${category}`);
 assert.equal(new Set(skus).size,expected,`Duplicate pages in ${category}`);
 coverage.push({category,products:expected,pages:group.length});
 for(const page of group)for(const raw of page.rows){
  const sku=clean(raw.sku),name=clean(raw.name);
  assert.ok(sku&&name&&/My Cost \(Excl VAT\)/i.test(clean(raw.costText)),`Unverified dealer cost ${sku}`);
  assert.match(clean(raw.cost),/^R\s*[\d,.]+$/);
  const cost=Number(clean(raw.cost).replace(/[^\d.]/g,''));
  // Portal R0.00 is retained as the app's undisclosed-price sentinel, never a free quote.
  assert.ok(Number.isFinite(cost)&&cost>=0,`Invalid cost ${sku}`);
  assert.match(clean(raw.stock),/^\d+$/,`No exact SOH ${sku}`);
  const stock=Number(raw.stock);
  const previous=products.get(sku);
  if(previous){
   assert.equal(previous.cost_price,cost,`Changing dealer cost while paging ${sku}`);
   assert.equal(previous.product_name,name,`Conflicting SKU name ${sku}`);
   previous._categories.push(category);previous._source.push({page:page.url,captured_at:page.captured_at,raw});
   // A later capture is authoritative when live SOH moves during this read-only run.
   if(page.captured_at>previous.imported_at){previous.stock_units=stock;previous.imported_at=page.captured_at;}
   continue;
  }
  const size=extractSupplierTyreSize(name)||name.match(/^(?:LT|VF|IF)?\d+(?:\.\d+)?(?:[LX/\d.]+)?(?:ZR|R|-)\d+(?:\.\d+)?(?:C|LT)?\b/i)?.[0]||'';
  const detail=details.get(sku);
  const brand=brands.find(b=>new RegExp(`(?:^|[^A-Z0-9])${escape(b)}(?:[^A-Z0-9]|$)`,'i').test(name))||
   clean(detail?.specifications?.find(s=>s.label==='Brand:')?.value);
  const withoutSize=size?name.replace(new RegExp(escape(size),'i'),''):name;
  const brandAt=brand?withoutSize.toUpperCase().indexOf(brand.toUpperCase()):-1;
  const indexSource=brandAt>=0?withoutSize.slice(0,brandAt):withoutSize.match(/^\s*\d{2,3}(?:\s*\/\s*\d{2,3})?\s*(?:A[1-8]|[A-Z])\b/i)?.[0]||'';
  const indexes=[...new Set((indexSource.match(/\b\d{2,3}(?:\s*\/\s*\d{2,3})?\s*(?:A[1-8]|[A-Z])\b/gi)||[]).map(v=>v.replace(/\s/g,'').toUpperCase()))];
  const ratings=[...new Set((withoutSize.match(/\b\d{1,2}\s*(?:PR|PLY)\b/gi)||[]).map(v=>v.replace(/\s/g,'').replace(/PLY/i,'PR').toUpperCase()))];
  const specRegex=/(?:^|\s|\()(M\+S|M\/S|A\/T|M\/T|H\/T|R\/T|TLR|TL|TTF|TT|RFT|RUN\s*FLAT|RUNFLAT|XL|RF|OWL|RWL|BSW|WSW)(?=\s|\)|$)/gi;
  const specs=[...new Set([...withoutSize.matchAll(specRegex)].map(m=>clean(m[1]).toUpperCase().replace(/RUN\s*FLAT/,'RUNFLAT')))];
  let pattern=withoutSize;
  if(brand)pattern=pattern.replace(new RegExp(escape(brand),'i'),'');
  pattern=pattern.replace(/\b\d{1,2}\s*(?:PR|PLY)\b/gi,' ').replace(specRegex,' ');
  for(const index of indexes)pattern=pattern.replace(new RegExp(escape(index),'i'),' ');
  pattern=cleanExclusiveTyresNewPattern(pattern.replace(/\(\s*\)/g,''),brand);
  if(detail?.specifications?.find(s=>s.label==='Model:')?.value==='DIMAX CLASSIC')pattern='DIMAX CLASSIC';
  products.set(sku,{catalog_key:'EXCLUSIVE_TYRES_NEW',supplier:'EXCLUSIVE TYRES NEW',
   source_key:`exclusive-new-live-${createHash('sha1').update(sku.toUpperCase().replace(/[^A-Z0-9]+/g,'')).digest('hex').slice(0,20)}`,
   product_type:'TYRE',product_name:name,supplier_sku:sku,brand,size,tyre_pattern:pattern,
   tyre_rating:ratings.join(' / '),tyre_index:indexes.join(' / '),tyre_specs:specs.join(' / '),
   cost_price:cost,selling_price:Math.round(cost*1.15+1e-8),stock_units:stock,
   product_url:raw.image||null,supplier_lead_time:clean(raw.sla),imported_at:page.captured_at,
   source_file:'Codex browser Exclusive Tyres New complete vehicle-category catalogue 2026-09-10',
   _categories:[category],_source:[{page:page.url,captured_at:page.captured_at,raw}]});
 }
}
const categoryNames={'passenger-car':'PASSENGER','run-flat':'RUN FLAT',suv:'SUV','4x4':'4X4','light-truck':'LIGHT TRUCK','truck-bus':'TRUCK / TBR',speciality:'SPECIALITY',agriculture:'AGRICULTURE',motorcycle:'BIKE / MOTORCYCLE'};
const rows=[...products.values()].map(p=>{
 p.product_name=[p.size,p.brand,p.tyre_pattern].filter(Boolean).join(' ');
 p.category=[...new Set(p._categories)].map(c=>categoryNames[c]).join(' | ');
 p.stock_units_availability=p.stock_units?'Available':'Out of stock';
 p.stock_location='CAPE TOWN';
 // The portal shows the account's network SOH, not a verified warehouse split.
 const detail=details.get(p.supplier_sku);
 const confirmedCpt=detail?.text.match(/\bSOH\s+(\d+)\s+CPT\b/);
 p.stock_by_location=confirmedCpt&&Number(confirmedCpt[1])===p.stock_units?{CPT:p.stock_units}:{};
 p.source_stock_detail=JSON.stringify({price_basis:'My Cost (Excl VAT); VAT 15% added once; rounded nearest R1',
  price_status:p.cost_price>0?'verified_dealer_cost':'Portal shows R0.00; price on request, not free',
  stock_basis:'Exact portal SOH for the CAPE TOWN supplier network; warehouse allocation not disclosed on catalogue cards',
  categories:p._categories,sources:p._source,...(detail?{product_detail:detail}:{})});
 delete p._categories;delete p._source;return p;
}).sort((a,b)=>a.supplier_sku.localeCompare(b.supplier_sku));
// The combined landing page may cache a different total. The fully paginated,
// individually verified category views are the complete source of products here.
const categoryTotal=coverage.reduce((n,c)=>n+c.products,0);
assert.equal(rows.length,categoryTotal,'This capture must reconcile every category with no unexplained duplicate SKU');
assert.ok(rows.length>=1199,'Do not publish fewer than the combined catalogue advertised at capture start');
assert.equal(new Set(rows.map(r=>r.source_key)).size,rows.length);
const landing=JSON.parse(await readFile(resolve(root,'captures/exclusive-combined-count-recheck.json'),'utf8'));
for(const row of landing.rows)assert.ok(products.has(row.sku),`Landing-page SKU missing from categories: ${row.sku}`);
for(const row of rows){
 assert.equal(row.selling_price,Math.round(row.cost_price*1.15+1e-8));
 assert.ok(Number.isInteger(row.stock_units)&&row.stock_units>=0);
 assert.ok(row.size&&row.brand&&row.tyre_pattern,`Incomplete verified product fields ${row.supplier_sku}`);
}
await mkdir(resolve(root,'normalized'),{recursive:true});
await writeFile(resolve(root,'normalized/EXCLUSIVE_TYRES_NEW.json'),JSON.stringify(rows,null,2));
const previousBySku=new Map(old.map(r=>[r.supplier_sku,r]));
const audit={coverage,products:rows.length,initialCombinedLandingPageCount:1199,stocked:rows.filter(r=>r.stock_units>0).length,unavailable:rows.filter(r=>!r.stock_units).length,
 newSkus:rows.filter(r=>!previousBySku.has(r.supplier_sku)).length,
 changedCosts:rows.filter(r=>previousBySku.has(r.supplier_sku)&&previousBySku.get(r.supplier_sku).cost_price!==r.cost_price).length,
 changedStock:rows.filter(r=>previousBySku.has(r.supplier_sku)&&previousBySku.get(r.supplier_sku).stock_units!==r.stock_units).length,
 previousSkusNoLongerListed:old.filter(r=>!products.has(r.supplier_sku)).map(r=>r.supplier_sku),
 units:rows.reduce((n,r)=>n+r.stock_units,0),priceOnRequest:rows.filter(r=>!r.cost_price).map(r=>({sku:r.supplier_sku,name:r.product_name,stock:r.stock_units})),
 blankBrands:rows.filter(r=>!r.brand).map(r=>({sku:r.supplier_sku,name:r.product_name})),blankSizes:rows.filter(r=>!r.size).map(r=>({sku:r.supplier_sku,name:r.product_name}))};
await writeFile(resolve(root,'normalized/EXCLUSIVE_TYRES_NEW-audit.json'),JSON.stringify(audit,null,2));
console.log(JSON.stringify(audit,null,2));
