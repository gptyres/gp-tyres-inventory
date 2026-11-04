import { describe, expect, it } from 'vitest';
import { apexSellingPrice, apexTyreSpecs } from './apex-stockfinder-normalize.mjs';

describe('Apex StockFinder tyre specifications', () => {
  it('does not label a tyre runflat when the portal flag is false or missing', () => {
    expect(apexTyreSpecs({ runflat: false, extra_load: false })).toBe('');
    expect(apexTyreSpecs({ runflat: null, extra_load: null })).toBe('');
  });

  it('uses the portal runflat flag and structured extra-load and ply fields', () => {
    expect(apexTyreSpecs({ runflat: true, extra_load: true, ply_rating: 3 })).toBe('XL / RUNFLAT / 3PR');
    expect(apexTyreSpecs({ runflat: 'yes', ply_rating: '6PR' })).toBe('RUNFLAT / 6PR');
  });

  it('does not treat truthy-looking false strings as positive flags', () => {
    expect(apexTyreSpecs({ runflat: 'false', extra_load: '0', ply_rating: 'false' })).toBe('');
  });
});

describe('Apex StockFinder VAT pricing', () => {
  it('adds 15% VAT and rounds to the nearest Rand using integer cents', () => {
    expect(apexSellingPrice(2850)).toBe(3278);
    expect(apexSellingPrice(1666)).toBe(1916);
    expect(apexSellingPrice(1000.01)).toBe(1150);
  });
});
