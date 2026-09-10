import { describe, expect, it } from 'vitest';
import { applyRoyalCapeTownUpdate } from './royalTyresCapeTownUpdate.mjs';
import { royalWorkbookItem } from './royalTyresWorkbook.mjs';
import { ROYAL_CPT_SEPTEMBER_2026 } from './supplier_data/royalTyresCapeTownSeptember2026.mjs';
import { ROYAL_TYRES_RAW_DATA } from './supplier_data/royalTyresData';
import { parseRoyalTyresData } from './utils';
import { parseCsvGrid } from './manualSupplierImport';

const lines = parseCsvGrid(ROYAL_TYRES_RAW_DATA);
const headers = lines[0];
const baseline = lines.slice(1).map((values) => {
  return royalWorkbookItem(Object.fromEntries(headers.map((key, index) => [key, values[index] || ''])));
});
const updated = applyRoyalCapeTownUpdate(baseline);

describe('Royal Cape Town September PDF update', () => {
  it('imports all 145 reviewed tyre rows with exact CPT balances and VAT-inclusive selling prices', () => {
    expect(ROYAL_CPT_SEPTEMBER_2026).toHaveLength(145);
    expect(ROYAL_CPT_SEPTEMBER_2026.reduce((sum, row) => sum + row.units, 0)).toBe(4937);
    for (const source of ROYAL_CPT_SEPTEMBER_2026) {
      const row = updated.find((item) => item.source_key === `${source.sourceKey}::cpt`)
        || updated.find((item) => item.source_key === source.sourceKey);
      expect(row).toMatchObject({ stock_by_location: { CPT: source.units }, cost_price: source.cost,
        selling_price: Math.round(source.cost * 1.15 + 1e-9), size: source.size, product_type: 'TYRE' });
    }
  });

  it('preserves every non-CPT warehouse balance, price, SKU and specification', () => {
    for (const before of baseline) {
      const after = updated.find((row) => row.source_key === before.source_key)!;
      for (const branch of ['KZN', 'JHB', 'RIVER TRUCK']) {
        expect(after.stock_by_location[branch]).toBe(before.stock_by_location[branch]);
      }
      expect(after.cost_price).toBe(before.cost_price);
      expect(after.selling_price).toBe(before.selling_price);
      expect(after.product_name).toBe(before.product_name);
      expect(after.size).toBe(before.size);
      if (before.product_type === 'WHEEL' || !ROYAL_CPT_SEPTEMBER_2026.some((row) => row.sourceKey === before.source_key)) {
        expect(after).toEqual(before);
      }
    }
  });

  it('separates six changed CPT prices without duplicating any units and adds the new size', () => {
    expect(updated).toHaveLength(1176);
    expect(updated.filter((row) => row.source_key.endsWith('::cpt'))).toHaveLength(6);
    expect(updated.reduce((sum, row) => sum + row.stock_units, 0)).toBe(44754);
    expect(updated.reduce((sum, row) => sum + (row.stock_by_location.CPT || 0), 0)).toBe(5069);
    expect(updated.find((row) => row.source_key === 'royal-cpt-anchee-195-60r15-ac808-88h')).toMatchObject({
      brand: 'ANCHEE', size: '195/60R15', tyre_pattern: 'AC808', tyre_index: '88H',
      stock_units: 10, cost_price: 499, selling_price: 574, stock_by_location: { CPT: 10 }
    });
    expect(updated.find((row) => row.source_key === 'royal-3220002269')?.stock_by_location).not.toHaveProperty('CPT');
  });

  it('is idempotent and leaves source data untouched', () => {
    expect(applyRoyalCapeTownUpdate(updated)).toEqual(updated);
    expect(baseline.reduce((sum, row) => sum + row.stock_units, 0)).toBe(44676);
    expect(new Set(updated.map((row) => row.source_key)).size).toBe(updated.length);
  });

  it('uses the same updated stock, unique identities and prices in the bundled catalogue', () => {
    const items = parseRoyalTyresData(ROYAL_TYRES_RAW_DATA);
    expect(items).toHaveLength(updated.length);
    expect(new Set(items.map((row) => row.id)).size).toBe(items.length);
    expect(items.reduce((sum, row) => sum + row.quantity, 0)).toBe(44754);
    expect(items.find((row) => row.id === 'royal-tyres-3220002269-cpt')).toMatchObject({
      quantity: 8, costPrice: 509, sellingPrice: 585, location: 'CPT: 8'
    });
  });

  it('rejects missing or duplicate identities, negative quantities and invalid prices', () => {
    const row = ROYAL_CPT_SEPTEMBER_2026[0];
    expect(() => applyRoyalCapeTownUpdate([], [row])).toThrow('Missing Royal SKU');
    expect(() => applyRoyalCapeTownUpdate(baseline, [row, row])).toThrow('Duplicate CPT');
    expect(() => applyRoyalCapeTownUpdate(baseline, [{ ...row, units: -1 }])).toThrow('Invalid CPT');
    expect(() => applyRoyalCapeTownUpdate(baseline, [{ ...row, cost: NaN }])).toThrow('Invalid CPT');
  });
});
