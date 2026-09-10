import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {describe,it,expect} from 'vitest';
import {liveSupplierRowToInventoryItem, type LiveSupplierCatalogRow} from './liveSupplierCatalog';
import {calculateSupplierSellingPrice} from './supplierMarkup';

const load=(key:string):LiveSupplierCatalogRow[]=>JSON.parse(gunzipSync(readFileSync(
 new URL(`./supplier_data/snapshots/2026-09-10-tread-exclusive/${key}.json.gz`,import.meta.url))).toString());
const tread=load('TREAD_ZONE');
const exclusive=load('EXCLUSIVE_TYRES_NEW');

describe('verified September Tread Zone and Exclusive browser refresh',()=>{
 it('retains complete supplier SKU coverage and exact physical branch stock',()=>{
  expect(tread).toHaveLength(803);
  expect(new Set(tread.map(r=>r.supplier_sku)).size).toBe(803);
  expect(tread.filter(r=>r.stock_units===0)).toHaveLength(48);
  for(const row of tread){
   expect(Object.keys(row.stock_by_location!).sort()).toEqual(['CPT','DUR','JHB','PLZ']);
   expect(Object.values(row.stock_by_location!).reduce((n,q)=>n+Number(q),0)).toBe(row.stock_units);
   const source=JSON.parse(row.source_stock_detail!);
   expect(source.incoming_shipment.excluded_from_available_stock).toBe(true);
  }
 });
 it('retains every vehicle category, including truck and motorcycle tyres',()=>{
  expect(exclusive).toHaveLength(1400);
  expect(new Set(exclusive.map(r=>r.supplier_sku)).size).toBe(1400);
  expect(exclusive.filter(r=>r.category==='TRUCK / TBR')).toHaveLength(58);
  expect(exclusive.filter(r=>r.category==='BIKE / MOTORCYCLE')).toHaveLength(7);
  expect(exclusive.filter(r=>r.category==='4X4')).toHaveLength(227);
 });
 it('adds VAT once and rounds each supplier cost to the nearest rand',()=>{
  for(const row of [...tread,...exclusive]){
   expect(row.selling_price).toBe(Math.round(Number(row.cost_price)*1.15+1e-8));
   expect(liveSupplierRowToInventoryItem(row).sellingPrice).toBe(row.selling_price);
  }
 });
 it('does not turn the supplier zero-price exception into a free or marked-up quote',()=>{
  const raw=exclusive.find(r=>r.supplier_sku==='F1231HB')!;
  expect(raw.stock_units).toBe(40);
  expect(raw.cost_price).toBe(0);
  const item=liveSupplierRowToInventoryItem(raw);
  expect(item.sellingPrice).toBe(0);
  expect(calculateSupplierSellingPrice(item,{mode:'FIXED',value:500},'EXCLUSIVE_TYRES_NEW')).toBe(0);
 });
 it('keeps brand names out of the secondary specification line',()=>{
  const a=liveSupplierRowToInventoryItem(exclusive.find(r=>r.supplier_sku==='YSTX5R1302')!);
  const b=liveSupplierRowToInventoryItem(tread.find(r=>r.supplier_sku==='1.01.012.100')!);
  expect(a).toMatchObject({size:'145/80R13',brand:'TRACMAX',pattern:'X-PRIVILOTX5',loadSpeedIndex:'75T',tyreSpecs:''});
  expect(b).toMatchObject({size:'6.00-12',brand:'MRL',pattern:'MRT302 R1',loadSpeedIndex:'8PR',tyreSpecs:'TT'});
 });
});
