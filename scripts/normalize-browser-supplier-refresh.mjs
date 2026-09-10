import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { parseSupplierTyreFields, extractSupplierTyreSize } from '../supplierTyreParsing.ts';

const arg = n => process.argv[process.argv.indexOf(n) + 1];
const root = resolve(arg('--root'));
const out = resolve(arg('--out'));
await mkdir(out, { recursive: true });
const read = async file => JSON.parse(await readFile(file, 'utf8'));
const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
export const money = value => {
  const raw = clean(value).replace(/[^\d,.-]/g, '');
  if (!raw) return 0;
  const normalized = /,\d{2}$/.test(raw) && !/\.\d{2}$/.test(raw)
    ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) throw new Error(`Invalid price ${value}`);
  return number;
};
export const quantity = value => {
  if (/sold out|no stock|out of stock/i.test(String(value))) return 0;
  const match = clean(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) throw new Error(`Unknown stock: ${value}`);
  return Math.max(0, Math.floor(Number(match[0])));
};
const rounded = n => Math.round(n + 1e-8);
const cents = n => Math.round((n + 1e-8) * 100) / 100;
const loc = value => ({ 'Cape Town':'CPT', 'Johannesburg':'JHB', 'Durban':'DUR', 'DBN':'DUR', 'Port Elizabeth':'PLZ', 'Eastport (Jhb)':'JHB', 'Durban CDC':'DUR CDC' }[clean(value)] || clean(value));
const pages = x => Array.isArray(x) ? x : x.pages || [x];
const load = async name => pages(await read(resolve(root, 'captures', name)));
const existing = {};
const brandSet = new Set();
for (const key of ['REVOLUTION_TYRES','TYREWAREHOUSE','STAMFORD','SUMITOMO_DUNLOP','TREADS_UNLIMITED','EXOTIC','ALINE','TUBESTONE']) {
  const rows = await read(resolve(root, 'backup', `${key}.json`));
  existing[key] = new Map(rows.map(r => [clean(r.supplier_sku).toUpperCase(), r]));
  rows.forEach(r => { if(clean(r.brand)) brandSet.add(clean(r.brand)); });
}
const brands = [...brandSet].sort((a,b)=>b.length-a.length);
const findBrand = name => brands.find(b=>new RegExp(`(?:^|\\s)${b.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:$|\\s)`, 'i').test(name)) || '';
const sourceSize = name => clean(name).match(/^(?:VF|IF|LT)?\d+(?:\.\d+)?(?:[LX/\d.]+)?(?:ZRF|ZR|R|-|X|L)\d+(?:\.\d+)?(?:SL|MPT|NHS|CFO|C|LT)?\b/i)?.[0] || extractSupplierTyreSize(name);
const outputs = new Map();
const exclusions = [];
const issues = [];
function add({key,supplier,sku,identity=sku,name,brand='',strictBrand=false,category='',size='',pattern='',index='',rating='',specs='',stock,cost,inclusive=false,image='',page,raw,lead='',type='TYRE',wheel={}}) {
  if (!sku || !name) throw new Error(`Missing identity in ${key}`);
  const prior = existing[key]?.get(clean(sku).toUpperCase());
  brand = clean(strictBrand ? brand : brand || prior?.brand || findBrand(name));
  const parsed = parseSupplierTyreFields({ description:name, explicitBrand:brand, explicitSize:size, explicitPattern:pattern, explicitIndex:index, explicitRating:rating, explicitSpecs:specs });
  const stockByLocation = Object.fromEntries(Object.entries(stock).map(([k,v])=>[loc(k),quantity(v)]));
  const units = Object.values(stockByLocation).reduce((a,b)=>a+b,0);
  const net = inclusive ? cents(cost / 1.15) : cost;
  const gross = inclusive ? rounded(cost) : rounded(cost * 1.15);
  const sourceKey = createHash('sha256').update(`${key}|${identity}|${type}`).digest('hex');
  const item = {
    catalog_key:key, supplier, source_key:sourceKey, supplier_sku:clean(sku), product_type:type,
    product_name:clean(name), brand, category:category || prior?.category || '',
    size:type==='TYRE' ? parsed.size : wheel.size || size,
    tyre_pattern:type==='TYRE' ? parsed.pattern : pattern,
    tyre_rating:type==='TYRE' ? parsed.rating : '', tyre_index:type==='TYRE' ? parsed.index : '',
    tyre_specs:type==='TYRE' ? parsed.specs : specs,
    wheel_pcd:wheel.pcd || null, wheel_offset:wheel.offset || null, wheel_center_bore:wheel.cb || null,
    stock_by_location:stockByLocation, stock_location:Object.entries(stockByLocation).map(([k,v])=>`${k}: ${v}`).join(' | '),
    stock_units:units, stock_units_availability:units>0 ? 'In stock' : 'Out of stock',
    supplier_lead_time:lead || null, cost_price:net, selling_price:gross,
    product_url:image || null, imported_at:page.captured_at || page.capturedAt,
    source_file:`Codex browser full catalogue ${key} 2026-09-10`,
    source_stock_detail:`Source price basis: ${inclusive?'VAT inclusive; VAT removed for cost':'cost excluding VAT'} | ${JSON.stringify({source:page.source,stock_display:stock,raw})}`
  };
  if (!item.imported_at) throw new Error(`Missing capture timestamp ${key}`);
  if (Object.values(stock).some(v=>/\+/.test(v))) {
    item.stock_units_availability = `At least ${units}; portal stock counts are capped`;
    issues.push({key,sku,issue:'Portal-capped stock retained as minimum',stock});
  }
  if (!brand || !item.size) issues.push({key,sku,issue:'Missing brand or size left blank',brand,size:item.size});
  if (cost===0) issues.push({key,sku,issue:'No price supplied; retained as 0 sentinel, not a free offer'});
  const map = outputs.get(key) || new Map(); outputs.set(key,map);
  if (map.has(sourceKey)) {
    const prev=map.get(sourceKey);
    if(prev.cost_price!==item.cost_price || prev.product_name!==item.product_name) throw new Error(`Conflicting duplicate ${key}/${sku}`);
    for(const [warehouse,qty] of Object.entries(stockByLocation)) {
      if(warehouse in prev.stock_by_location && prev.stock_by_location[warehouse]!==qty) throw new Error(`Conflicting stock ${key}/${sku}/${warehouse}`);
      prev.stock_by_location[warehouse]=qty;
    }
    prev.stock_units=Object.values(prev.stock_by_location).reduce((a,b)=>a+b,0);
    const capped=/portal stock counts are capped/.test(prev.stock_units_availability)||/portal stock counts are capped/.test(item.stock_units_availability);
    prev.stock_units_availability=capped?`At least ${prev.stock_units}; portal stock counts are capped`:prev.stock_units>0?'In stock':'Out of stock';
    prev.stock_location=Object.entries(prev.stock_by_location).map(([k,v])=>`${k}: ${v}`).join(' | ');
    prev.source_stock_detail+=` | ${JSON.stringify({source:page.source,stock_display:stock,raw})}`;
    prev.imported_at = prev.imported_at > item.imported_at ? prev.imported_at : item.imported_at;
  } else map.set(sourceKey,item);
  return map.get(sourceKey);
}

for (const file of ['passenger','truck','agricultural','industrial','off-the-road','forestry']) {
  for(const p of await load(`revolution-${file}.json`)) for(const r of p.rows) {
    const stock=Object.fromEntries(r.warehouses.map(w=>[w.location,w.stock]));
    add({key:'REVOLUTION_TYRES',supplier:'Revolution Tyres',sku:r.sku,name:r.name,size:sourceSize(r.name),category:p.category || file,stock,cost:money(r.price),page:p,raw:r});
  }
}
for (const p of await load('treads-full.json')) for (const r of p.rows) {
  if(p.mode!=='Buying') throw new Error('Treads capture must use Buying mode');
  const [name,sku] = r.cells[0].split(/\nSKU:\s*/);
  const item=add({key:'TREADS_UNLIMITED',supplier:'Threads Unlimited',sku,name,brand:r.brand,size:r.cells[1],stock:{Regional:r.stockRegional ?? r.cells[4],National:r.stockNational ?? r.cells[5]},cost:money(r.sourcePrice),image:r.image,page:p,raw:r,lead:'Regional: 1–2 days | National: 1–3 days'});
  if(r.cells[3].split('\n').length>1){item.tyre_specs=[item.tyre_specs,'SPECIAL'].filter(Boolean).join(' / '); item.source_stock_detail+=` | Normal selling price incl VAT: R${rounded(money(r.cells[3].split('\n').at(-1))*1.15)}`;}
}
for(const p of await load('sumitomo-full.json')) for(const r of p.rows) {
  const sku=r.meta.find(s=>/^SKU:/.test(s))?.split('\n')[1];
  const category=r.meta.find(s=>/^Category:/.test(s))?.split('\n')[1];
  if(/tube|flap/i.test(category||'') || /\bTUBE\b/i.test(r.name)) {exclusions.push({catalog:'SUMITOMO_DUNLOP',reason:'Inner tube/flap, not a tyre or wheel',raw:r});continue;}
  add({key:'SUMITOMO_DUNLOP',supplier:'Sumitomo/Dunlop',sku,name:r.name,brand:r.brand,category,stock:Object.fromEntries(r.stock.map(s=>s.split(/:\s*\n/))),cost:money(r.price),image:/default-product-image/.test(r.image)?'':r.image,page:p,raw:r});
  if(r.stock.some(s=>/:\s*-\d/.test(s))) issues.push({key:'SUMITOMO_DUNLOP',sku,issue:'Negative portal allocation retained in raw source; available stock floored at zero'});
}
const wheelSpecs = text => {
  const s=clean(text).replace(/(\d),(\d)/g,'$1.$2');
  const size=s.match(/\b(\d{2}(?:\.\d)?)"?\s*[Xx*-]\s*(\d{1,2}(?:\.\d+)?)\b/);
  const diameter=s.match(/^(\d{2})"/), width=s.match(/\b(\d{1,2}(?:\.\d+)?)J\b/);
  const ordered=s.match(/^\d{2}(?:\.\d)?\s*[Xx-]\s*\d+(?:\.\d+)?\s+([+-]?\d+)\s+((?:[3-8]|10)[Xx/]\d{2,3}(?:\.\d+)?(?:\/\d{2,3}(?:\.\d+)?)?)\s+(\d{2,3}(?:\.\d+)?)\b/);
  return {size:size?`${size[1]}X${size[2]}`:diameter&&width?`${diameter[1]}X${width[1]}`:diameter?diameter[1]:'',pcd:s.match(/\b(?:[3-8]|10)[Xx/]\d{2,3}(?:\.\d+)?(?:\/\d{2,3}(?:\.\d+)?)?\b/)?.[0]?.replace(/[xX]/,'/')||'',offset:s.match(/\bET\s*([+-]?\d+(?:\/\d+)?)/i)?.[1]||ordered?.[1]||'',cb:s.match(/\b(?:CB|CH)\s*(\d{2,3}(?:\.\d+)?)/i)?.[1]||(ordered?.[3]?.includes('.')?ordered[3]:'')};
};
for(const file of ['passenger','truck','offroad','agricultural','passenger-wheels','truck-wheels']) {
  for(const p of await load(`tyrewarehouse-${file}.json`)) for(const r of p.rows) {
    const sku=r.name.match(/\nCode:\s*([^\n]+)/)?.[1];
    const name=r.name.split('\n')[0];
    const detail=r.name.match(/\nSpec\.:\s*([^\n]+)/)?.[1]||'';
    const price=r.prices.match(/(?:Discount|Promotion) Price\(Exc\.\):\s*R\s*([\d,.]+)/)?.[1];
    if(!price) issues.push({key:'TYREWAREHOUSE',sku,issue:'No discounted dealer price exposed; retail list price not substituted for cost'});
    const stock=Object.fromEntries(r.warehouses.map(s=>{const m=s.match(/^(.+?)\s+(-?\d+)\(pc\)/);if(!m)throw new Error(`Unparsed TW stock ${s}`);return [m[1],m[2]];}));
    const isWheel=file.endsWith('wheels');
    const tyreDetails=parseSupplierTyreFields({description:detail,explicitSize:sourceSize(detail)});
    add({key:'TYREWAREHOUSE',supplier:'Tyrewarehouse',sku,name:isWheel?`${name} ${detail}`:name,stock,cost:money(price),image:r.image,page:p,raw:r,type:isWheel?'WHEEL':'TYRE',wheel:wheelSpecs(detail),specs:detail,index:isWheel?'':tyreDetails.index,rating:isWheel?'':tyreDetails.rating,pattern:isWheel?'':name.split('/').slice(0,-1).join('/'),category:file,brand:name.split('/').at(-1),size:isWheel?'':sourceSize(detail)});
  }
}
for(const p of await load('exotic-full.json')) for(const r of p.rows) {
  const sku=r.skuText.match(/^\[([^\]]+)\]/)?.[1];
  const isWheel=/\bWheel\b/i.test(r.name) && !/Wheelbarrow/i.test(r.name);
  const wheel=wheelSpecs(r.name);
  const item=add({key:'EXOTIC',supplier:'Exotic',sku,identity:new URL(r.url).pathname,name:r.name,size:isWheel?'':sourceSize(r.name),stock:Object.fromEntries(r.stock.map(s=>[s.location,s.stock])),cost:money(r.price.split('\n')[0]),inclusive:true,image:r.image,page:p,raw:r,type:isWheel?'WHEEL':'TYRE',wheel,category:isWheel?'Alloy Wheels':''});
  // The current web UI only exposes Johannesburg. Keep previously verified CPT
  // quantities with their original timestamp rather than inventing a fresh value.
  item.source_stock_detail+=' | Cape Town stock not exposed in this browser session; not reverified';
}
for(const file of ['stamford-tyres-all-dcs.json','stamford-wheels-all-dcs.json']) {
  const isWheel=file.includes('wheels');
  for(const p of await load(file)) for(const r of p.rows) {
    const [sku,...availability]=r.cells[0].split('\n');
    const display=availability.join(' ');
    const remaining=display.match(/(\d+) Remaining/);
    let stock;
    if(/No Stock/i.test(display))stock=0;
    else if(remaining)stock=Number(remaining[1]);
    else if(/Ample Stock/i.test(display) && r.quantityLimit)stock=`${r.quantityLimit}+`;
    else throw new Error(`Unverified Stamford stock ${sku}: ${display}`);
    const size=isWheel?'':r.cells[2].split('\n')[0];
    const idx=r.cells[2].match(/Load Index:\s*([\d/]+)\s*Speed Index:\s*([A-Z]\d?)/);
    const wheel=wheelSpecs(r.cells[2]);
    const brandSlug=r.url?.match(/\/tyre\/([^/]+)\//)?.[1];
    const firstWord=r.cells[1].split(' ')[0];
    const brand=/^Eurogrip Tyres\b/.test(r.cells[1])?'Eurogrip':brandSlug && firstWord.toLowerCase().replace(/[^a-z0-9]/g,'')===brandSlug.replace(/[^a-z0-9]/g,'') ? firstWord : '';
    const item=add({key:'STAMFORD',supplier:'Stamford',sku,name:isWheel?`${r.cells[1]} ${r.cells[2]}`:r.cells[1],brand,size,index:idx?idx[1]+idx[2]:'',stock:{[p.location.replace('Stamford DC ','')]:stock},cost:money(r.cost || r.cells[3].split(/EX\./)[0]),image:r.image||'',page:p,raw:r,type:isWheel?'WHEEL':'TYRE',wheel,category:isWheel?'Wheels':''});
    if(r.normalPrice){item.tyre_specs=[item.tyre_specs,'SPECIAL'].filter(Boolean).join(' / ');item.source_stock_detail+=` | Normal selling price incl VAT: R${rounded(money(r.normalPrice)*1.15)}`;}
  }
}
if(await access(resolve(root,'captures/tubestone-full.json')).then(()=>true,()=>false)) {
 const all=await load('tubestone-full.json');
 if(all.length!==122 || all.some((p,i)=>Number(p.toolbar.match(/Page (\d+) of 122/)?.[1])!==i+1))throw new Error('Tubestone full page sequence not verified');
 const logos={deestone:'Deestone',maxtrek:'Maxtrek',bkt:'BKT',nankang:'Nankang',conti:'Continental',sailun:'Sailun',dunlop:'Dunlop',goodyear:'Goodyear',gtthumb:'General',bridgestone:'Bridgestone',tortuga:'Tortuga',nexen:'Nexen'};
 const namedBrands=['Deestone','Maxtrek','BKT','Nankang','Continental','Sailun','Dunlop','Goodyear','General','Bridgestone','Tortuga','Nexen','NEX','Marvelous','IRA','Sumitomo'];
 const fileName=src=>new URL(src).searchParams.get('filename')?.toLowerCase()||'';
 const logoBrand=src=>Object.entries(logos).find(([hint])=>fileName(src).includes(hint))?.[1];
 for(const p of all)for(const r of p.rows){
  const sku=clean(r.cells[5]); const name=clean(r.cells[3]);
  const brand=namedBrands.find(b=>new RegExp(`\\b${b}\\b`,'i').test(name)) || (/\bCONTI\b/i.test(name)?'Continental':'') || r.images.map(i=>logoBrand(i.src)).find(Boolean) || '';
  if(/\b(?:FLAP|TUBE|VALVE)\b/i.test(name) || (!brand && /\b(?:TR\s*-?\s*\d+[A-Z]*|TRJ\d+|TC131|VS3|JS\d+|SC95)\b/i.test(name))){exclusions.push({catalog:'TUBESTONE',reason:'Tube, flap or valve rather than tyre/wheel',raw:r});continue;}
  const size=name.match(/^(?:\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?(?:L-\d+(?:FI)?|D\d+|\-\d+K))\b/i)?.[0]||sourceSize(name);
  if(!brand && !size){exclusions.push({catalog:'TUBESTONE',reason:'Unmatched product type requires review; not mislabeled as a tyre',raw:r});continue;}
  const stock=Object.fromEntries(r.stock.map(w=>{const [warehouse,...count]=w.text.split('\n');return[warehouse,count.join(' ')];}));
  const image=r.images.find(i=>fileName(i.src)&&!logoBrand(i.src))?.src||'';
  const item=add({key:'TUBESTONE',supplier:'Tubestone',sku,name,brand,strictBrand:true,size,stock,cost:money(r.cells[4]),image,page:p,raw:r});
  if(!item.size&&size)item.size=size.toUpperCase();
 }
}
// A-Line set pricing is prepared separately; it requires an explicit frontend
// set-of-four basis marker to avoid multiplying an already-totalled price again.
for(const [key,map] of outputs) {
  const items=[...map.values()];
  await writeFile(resolve(out,`${key}.json`),JSON.stringify(items,null,2));
  console.log(JSON.stringify({catalog:key,products:items.length,zeroStock:items.filter(r=>!r.stock_units).length,warehouses:[...new Set(items.flatMap(r=>Object.keys(r.stock_by_location)))],missingBrand:items.filter(r=>!r.brand).length,missingSize:items.filter(r=>!r.size).length}));
}
await writeFile(resolve(out,'issues.json'),JSON.stringify(issues,null,2));
await writeFile(resolve(out,'excluded-non-catalogue-products.json'),JSON.stringify(exclusions,null,2));
