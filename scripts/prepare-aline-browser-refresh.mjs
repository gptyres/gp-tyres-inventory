import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=resolve(process.argv[2]);
const raw=JSON.parse(await readFile(resolve(root,'captures/aline-full.json'),'utf8'));
const all=raw.pages.flatMap(p=>p.rows.map(r=>({...r,captured_at:p.capturedAt})));
if(all.length!==raw.expectedTotal || new Set(all.map(r=>r.sku)).size!==raw.expectedTotal) throw new Error('A-Line page coverage mismatch');
const excluded=all.filter(r=>/each/i.test(r.cells[7]));
const wheels=all.filter(r=>!/each/i.test(r.cells[7]));
const adapted=wheels.map(r=>({stock_code:r.sku,description:r.cells[3].split('\n')[0],fitment:r.cells[3].split('\n').slice(1).join(' '),qty_jhb:r.cells[4],qty_cpt:r.cells[5],qty_dbn:r.cells[6],dealer_price_display:r.cells[7],rrp_display:r.cells[8],category:'Wheels',image_url:r.imageHtml.match(/data-image="([^"]+)"/)?.[1]||''}));
const adaptedPath=resolve(root,'captures/aline-adapted.json');
const out=resolve(root,'normalized/ALINE.json');
await writeFile(adaptedPath,JSON.stringify(adapted,null,2));
const result=spawnSync(process.execPath,[resolve('scripts/normalize-aline-cataloghive.mjs'),'--file',adaptedPath,'--out',out],{stdio:'inherit'});
if(result.status!==0)throw new Error('A-Line normalization failed');
const normalized=JSON.parse(await readFile(out,'utf8'));
const index=new Map(all.map(r=>[r.sku,r]));
for(const item of normalized){
 const r=index.get(item.supplier_sku);
 const title=r.cells[3].split('\n')[0];
 const fitment=r.cells[3].split('\n').slice(1).join(' ');
 const titleOffset=title.match(/\bET\s*([+-]?\d+)/i)?.[1];
 const fitmentOffset=fitment.match(/\bET\s*([+-]?\d+)/i)?.[1];
 // Do not guess an offset from an unrelated number in the wheel name.
 item.wheel_offset=titleOffset && fitmentOffset && Number(titleOffset)!==Number(fitmentOffset) ? null : titleOffset || fitmentOffset || null;
 const pcd=fitment.split('—')[0].split('·').map(x=>x.trim()).find(x=>/^[3-8]x\d{2,3}(?:\.\d+)?$/i.test(x));
 if(pcd && !item.wheel_pcd.includes('&'))item.wheel_pcd=pcd.replace(/x/i,'/');
 item.imported_at=r.captured_at;
 item.selling_price=Math.round(item.selling_price);
 item.source_file='Codex browser A-Line complete catalogue 2026-09-10';
 item.source_stock_detail+=` | Original description: ${title} | ${JSON.stringify({source:raw.source,raw:r.cells})}`;
 if(titleOffset && fitmentOffset && Number(titleOffset)!==Number(fitmentOffset))item.source_stock_detail+=' | Conflicting portal offsets: left blank pending supplier confirmation';
}
await writeFile(out,JSON.stringify(normalized,null,2));
await writeFile(resolve(root,'normalized/aline-excluded-accessories.json'),JSON.stringify(excluded,null,2));
console.log(JSON.stringify({sourceRows:all.length,wheels:normalized.length,accessoriesSavedSeparately:excluded.length}));
