import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
const root=resolve(process.argv[2]);
const keys=process.argv.slice(3);
const db=createClient('https://moiybakshvuvppesbnpt.supabase.co',process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const reports=[];
for(const key of keys){
 const expected=JSON.parse(await readFile(resolve(root,'normalized',`${key}.json`),'utf8'));
 const receipt=JSON.parse(await readFile(resolve(root,'normalized',`${key}-publish-receipt.json`),'utf8'));
 const active=await db.from('supplier_catalog_snapshots').select('id,row_count').eq('catalog_key',key).eq('status','active').single();
 if(active.error)throw active.error;
 assert.equal(active.data.id,receipt.snapshotId);
 const found=[];
 for(let offset=0;offset<expected.length;offset+=1000){const result=await db.from('supplier_catalog_items').select('*').eq('snapshot_id',receipt.snapshotId).order('id').range(offset,offset+999);if(result.error)throw result.error;found.push(...result.data);}
 assert.equal(found.length,expected.length);
 const bySource=new Map(found.map(r=>[r.source_key,r]));
 for(const row of expected){
  const actual=bySource.get(row.source_key); assert.ok(actual,`${key}/${row.supplier_sku}`);
  for(const [field,value] of Object.entries(row)){
   if(field==='imported_at')assert.equal(new Date(actual[field]).toISOString(),new Date(value).toISOString());
   else assert.deepEqual(actual[field],value,`${key}/${row.supplier_sku}/${field}`);
  }
 }
 reports.push({catalog:key,verifiedProducts:found.length,snapshotId:receipt.snapshotId,verifiedAt:new Date().toISOString()});
}
await writeFile(resolve(root,'normalized/live-verification.json'),JSON.stringify(reports,null,2));
console.log(JSON.stringify({passed:true,reports},null,2));
