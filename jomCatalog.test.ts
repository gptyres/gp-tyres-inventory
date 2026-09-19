import { describe, expect, it } from 'vitest';
import data from './supplier_data/jomData.json';
import { loadJomCatalog, parseJomCatalog } from './jomCatalog';
import { SIDEBAR_SUPPLIER_CATALOGS } from './components/Sidebar';
import { getItemDisplayName, getItemTypeLabel } from './components/InventoryView';
import { calculateSupplierSellingPrice, getSupplierCostTaxBasis } from './supplierMarkup';
import { SUPPLIER_CATALOG_OPTIONS, loadSupplierCatalogItems } from './supplierCatalogLoader';
import { isLiveSupplierCatalog, isRegistryBackedSupplierCatalog } from './supplierCatalogMapping';
import { searchInventory } from './utils';
import { searchSupplierInventory } from './supplierInventorySearch';

describe('JOM supplier report import', () => {
  const items = loadJomCatalog();
  it('reconciles every stock code and the printed warehouse total', () => {
    expect(items).toHaveLength(98);
    expect(new Set(items.map(item => item.supplierStockCode)).size).toBe(98);
    expect(items.reduce((sum,item) => sum + item.quantity, 0)).toBe(2581);
    expect(items.every(item => item.stockByLocation?.['Main Warehouse'] === item.quantity)).toBe(true);
    expect(items.every(item => item.lastUpdated === data.importedAt)).toBe(true);
  });
  it('retains VAT-inclusive prices, including with an explicit markup', () => {
    const kit = items.find(item => item.supplierStockCode === '741000')!;
    expect(kit.quantity).toBe(29);
    expect(kit.costPrice).toBe(4500);
    expect(kit.sellingPrice).toBe(4500);
    expect(getSupplierCostTaxBasis(kit,'JOM')).toBe('INCLUDES_VAT');
    expect(getSupplierCostTaxBasis(kit,'ALL_SUPPLIERS')).toBe('INCLUDES_VAT');
    expect(calculateSupplierSellingPrice(kit,{mode:'BASE',value:0},'JOM')).toBe(4500);
    expect(calculateSupplierSellingPrice(kit,{mode:'PERCENT',value:10},'JOM')).toBe(4950);
    expect(calculateSupplierSellingPrice(kit,{mode:'FIXED',value:100},'JOM')).toBe(4615);
    items.forEach((item,index) => expect(item.sellingPrice).toBe(data.rows[index].priceIncludingVat));
  });
  it('preserves long descriptions without including quantity digits', () => {
    const row = data.rows.find(row => row.supplierSku === '741254')!;
    expect(row.stockUnits).toBe(1);
    expect(row.priceIncludingVat).toBe(4800);
    expect(row.description).toBe('VW Golf 7 R 4Motion,Clubsport,GTI TCR, 2.0 R,GTD 2012-2019 m');
    expect(data.rows.find(row => row.supplierSku === 'GF 200226')?.stockUnits).toBe(9);
  });
  it('keeps accessories accurately labelled and searchable', () => {
    expect(getItemTypeLabel(items.find(item => item.supplierStockCode === '127095')!)).toBe('Plastic dip');
    expect(getItemTypeLabel(items.find(item => item.supplierStockCode === 'FK01510')!)).toBe('Wheel spacer');
    expect(getItemDisplayName(items.find(item => item.supplierStockCode === '741015')!)).toBe('BMW E46 1998 - 2005');
    expect(searchInventory(items,'BMW E46').length).toBeGreaterThan(0);
    expect(searchInventory(items,'741015').map(item=>item.supplierStockCode)).toContain('741015');
    expect(searchSupplierInventory(items,'741015').map(item=>item.supplierStockCode)).toEqual(['741015']);
  });
  it('registers the supplier in sidebar, search and catalogue loading', async () => {
    expect(SIDEBAR_SUPPLIER_CATALOGS.some(item=>item.catalog==='JOM' && item.label==='JOM')).toBe(true);
    expect(SUPPLIER_CATALOG_OPTIONS.some(item=>item.catalog==='JOM')).toBe(true);
    expect(isRegistryBackedSupplierCatalog('JOM')).toBe(false);
    expect(isLiveSupplierCatalog('JOM')).toBe(false);
    expect(await loadSupplierCatalogItems('JOM')).toHaveLength(98);
  });
  it('rejects invalid amounts, counts and duplicate SKUs', () => {
    expect(()=>parseJomCatalog([{...data.rows[0],stockUnits:-1}],data.importedAt)).toThrow();
    expect(()=>parseJomCatalog([{...data.rows[0],priceIncludingVat:NaN}],data.importedAt)).toThrow();
    expect(()=>parseJomCatalog([data.rows[0],data.rows[0]],data.importedAt)).toThrow();
  });
});
