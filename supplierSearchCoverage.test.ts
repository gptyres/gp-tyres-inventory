import { describe, expect, it, vi } from 'vitest';
vi.mock('./liveSupplierCatalog', async importOriginal => ({ ...await importOriginal<typeof import('./liveSupplierCatalog')>(), loadLiveSupplierCatalogItems: async () => null }));
import { loadSupplierCatalogItems, SUPPLIER_CATALOG_OPTIONS } from './supplierCatalogLoader';
import { ProductType } from './types';
import { searchSupplierInventory } from './supplierInventorySearch';
import { extractSingleMetricTyreQuery } from './staggeredTyreSearch';

describe('supplier catalogue search coverage', () => {
  it('finds every bundled tyre by its supplied size, brand and pattern', async () => {
    const failures: unknown[] = [];
    let checked = 0;
    for (const { catalog } of SUPPLIER_CATALOG_OPTIONS) {
      const items = await loadSupplierCatalogItems(catalog);
      for (const item of items) {
        if (item.type !== ProductType.TYRE) continue;
        checked++;
        const canonical = extractSingleMetricTyreQuery(item.size);
        for (const query of [item.size, item.brand.toUpperCase(), item.pattern.toUpperCase(), item.supplierName, ...(canonical ? [canonical.display] : [])]) {
          if (query && !searchSupplierInventory([item], query).length) failures.push({ catalog, size: item.size, query });
        }
      }
    }
    console.log(JSON.stringify({ checked, failures: failures.length, examples: failures.slice(0, 60) }));
    expect(failures.slice(0, 20)).toEqual([]);
  }, 30000);
  it('includes every Royal Tyres listing in supplier-name search and mixed-supplier size search', async () => {
    const royal = await loadSupplierCatalogItems('ROYAL_TYRES');
    const apex = await loadSupplierCatalogItems('APEX');
    expect(royal.length).toBeGreaterThan(100);
    expect(searchSupplierInventory(royal, 'ROYAL TYRES')).toHaveLength(royal.length);
    for (const query of ['1955015', '2656018', 'ROYAL TYRES']) {
      const combinedIds = new Set(searchSupplierInventory([...apex, ...royal], query).map(item => item.id));
      for (const item of searchSupplierInventory(royal, query)) expect(combinedIds.has(item.id)).toBe(true);
    }
  });
});
