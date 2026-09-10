import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=resolve(process.argv[2]);
const keys=process.argv.slice(3);
const snapshots=JSON.parse(await readFile(resolve(root,'backup/snapshots.json'),'utf8'));
for(const key of keys){
 const before=snapshots.find(s=>s.catalog_key===key);
 if(!before)throw new Error(`Missing backup for ${key}`);
 // A correction within this run may replace our own published snapshot, but
 // still refuses any intervening publication from another task or user.
 const ownReceipt=await readFile(resolve(root,'normalized',`${key}-publish-receipt.json`),'utf8').then(JSON.parse,error=>{if(error.code==='ENOENT')return null;throw error;});
 const result=spawnSync(process.execPath,[resolve('scripts/publish-supplier-snapshot-json.mjs'),'--file',resolve(root,'normalized',`${key}.json`),'--catalog',key,'--supplier',before.registry_supplier,'--source',`Codex browser full catalogue ${key} 2026-09-10`,'--expected-snapshot',ownReceipt?.snapshotId || before.id,'--requested-by','User-requested complete supplier refresh via Codex browser'],{encoding:'utf8',env:process.env});
 if(result.status!==0){console.error(result.stderr);throw new Error(`Publication failed for ${key}`);}
 const receipt=JSON.parse(result.stdout);
 await writeFile(resolve(root,'normalized',`${key}-publish-receipt.json`),JSON.stringify(receipt,null,2));
 console.log(JSON.stringify(receipt));
}
