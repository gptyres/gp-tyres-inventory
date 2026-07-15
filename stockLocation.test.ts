import { describe, expect, it } from 'vitest';
import {
  normalizeStockByLocation,
  parseStockLocationSummary,
  sortStockLocationEntries
} from './stockLocation';

describe('supplier stock locations', () => {
  it('parses numeric location summaries used by supplier fallback catalogues', () => {
    expect(parseStockLocationSummary('JHB: 7 | CPT: 0 | DBN: 2 | GLK: 1')).toEqual({
      JHB: 7,
      CPT: 0,
      DBN: 2,
      GLK: 1
    });
  });

  it('merges verbose supplier aliases into clean branch names', () => {
    expect(normalizeStockByLocation({
      'Cape Town': 2,
      'EWT - Cape Town - Cape Town': 3,
      'EXOTIC WHEEL AND TYRE - Johannesburg': 4
    })).toEqual({ 'Cape Town': 5, Johannesburg: 4 });
  });

  it('keeps the familiar branch order before additional locations', () => {
    expect(sortStockLocationEntries({ 'Port Elizabeth': 1, CPT: 2, JHB: 3, DBN: 4 })).toEqual([
      ['JHB', 3],
      ['CPT', 2],
      ['DBN', 4],
      ['Port Elizabeth', 1]
    ]);
  });
});
