import { describe, expect, it } from 'vitest';
import data from './supplier_data/vitourData.json';
import { loadVitourCatalog, parseVitourCatalog } from './vitourCatalog';
import { calculateSupplierSellingPrice, getSupplierCostTaxBasis } from './supplierMarkup';
import { loadSupplierCatalogItems, SUPPLIER_CATALOG_OPTIONS } from './supplierCatalogLoader';
import { isLiveSupplierCatalog } from './supplierCatalogMapping';

describe('VITOUR January 2025 price list', () => {
  const items = loadVitourCatalog();

  it('retains all unique sizes, removes only the exact duplicate and reconciles prices', () => {
    expect(data.sourceRows).toBe(553);
    expect(data.duplicatesRemoved).toBe(1);
    expect(items).toHaveLength(552);
    expect(new Set(items.map((item) => item.id)).size).toBe(552);
    expect(items.filter((item) => item.sellingPrice > 0)).toHaveLength(443);
    expect(items.filter((item) => item.sellingPrice === 0)).toHaveLength(109);
    items.forEach((item, index) => {
      expect(item.sellingPrice).toBe(data.rows[index].priceIncludingVat ?? 0);
      expect(item.costPrice).toBe(data.rows[index].priceExcludingVat ?? 0);
      expect(item.size).toBe(data.rows[index].size);
      expect(item.brand).toBe(data.rows[index].brand);
    });
  });

  it('keeps supplied inclusive selling prices and uses ex-VAT cost for markup', () => {
    const item = items.find((item) => item.size === '155R12C')!;
    expect(item.sellingPrice).toBe(750);
    expect(item.costPrice).toBe(652.17);
    for (const catalog of ['VITOUR', 'ALL_SUPPLIERS'] as const) {
      expect(getSupplierCostTaxBasis(item, catalog)).toBe('EXCLUDES_VAT');
      expect(calculateSupplierSellingPrice(item, { mode: 'BASE', value: 0 }, catalog)).toBe(750);
      expect(calculateSupplierSellingPrice(item, { mode: 'PERCENT', value: 10 }, catalog)).toBe(825);
    }
  });

  it('does not invent stock, patterns or missing prices', () => {
    expect(items.every((item) => item.quantity === 0 && !item.stockByLocation)).toBe(true);
    expect(items.every((item) => item.location.includes('Stock not supplied'))).toBe(true);
    const unpriced = items.filter((item) => !item.sellingPrice);
    expect(unpriced.every((item) => item.tyreSpecs?.includes('PRICE ON REQUEST'))).toBe(true);
    expect(calculateSupplierSellingPrice(unpriced[0], { mode: 'FIXED', value: 500 }, 'VITOUR')).toBe(0);
    const noPattern = items.find((item) => item.brand === 'MAZZINI' && item.size === '195/50R15')!;
    expect(noPattern.pattern).toBe('Pattern not supplied');
    expect(noPattern.imageDesignKey).toBeUndefined();
  });

  it('preserves alternative brands, commercial and flotation sizes, specs and image keys', () => {
    expect(items.some((item) => item.brand === 'DELMAX / SAFERICH')).toBe(true);
    expect(items.some((item) => item.size === '31X10.5R15LT' && item.brand === 'JOYROAD')).toBe(true);
    expect(items.some((item) => item.size === '750R16LT' && item.tyreRating === '14PR')).toBe(true);
    const tyre = items.find((item) => item.pattern === 'Thunderlion')!;
    expect(tyre.imageDesignKey).toBe('THUNDERLION');
    expect(tyre.imageFinishKey).toBe('VITOUR');
  });

  it('registers a bundled catalogue without inventing a live sync adapter', async () => {
    expect(SUPPLIER_CATALOG_OPTIONS).toContainEqual({ catalog: 'VITOUR', label: 'VITOUR' });
    expect(isLiveSupplierCatalog('VITOUR')).toBe(false);
    const loaded = await loadSupplierCatalogItems('VITOUR');
    expect(loaded).toHaveLength(552);
    expect(loaded.every((item) => item.supplierName === 'VITOUR')).toBe(true);
  });

  it('rejects invalid prices and duplicate identifiers', () => {
    const row = data.rows[0];
    expect(() => parseVitourCatalog([row, row], data.importedAt)).toThrow('Invalid VITOUR');
    expect(() => parseVitourCatalog([{ ...row, priceIncludingVat: -1 }], data.importedAt)).toThrow('Invalid VITOUR');
    expect(() => parseVitourCatalog([{ ...row, priceExcludingVat: null }], data.importedAt)).toThrow('Invalid VITOUR');
  });
});
