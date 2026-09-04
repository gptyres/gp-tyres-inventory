import { describe, expect, it } from 'vitest';
import { isApexSeller, selectCompleteApexTyres } from './apex-stockfinder-catalog.mjs';

describe('Apex StockFinder catalogue selection', () => {
  it('keeps every Apex tyre brand without an allowlist', () => {
    const rows = selectCompleteApexTyres([
      { seller_name: 'APEX TYRES WC', stock_type: 'TYRE', brand: 'VREDESTEIN' },
      { seller_name: 'Apex National', stock_type: 'TYRE', brand: 'SUMITOMO' },
      { seller_name: 'APEX TYRES WC', stock_type: 'WHEEL', brand: 'WHEEL BRAND' },
      { seller_name: 'Another Supplier', stock_type: 'TYRE', brand: 'DUNLOP' },
    ]);

    expect(rows.map(({ brand }) => brand)).toEqual(['VREDESTEIN', 'SUMITOMO']);
  });

  it('supports an exact configured Apex seller location', () => {
    expect(isApexSeller({ seller_name: 'apex tyres wc' }, 'APEX TYRES WC')).toBe(true);
    expect(isApexSeller({ seller_name: 'APEX NATIONAL' }, 'APEX TYRES WC')).toBe(false);
  });
});

