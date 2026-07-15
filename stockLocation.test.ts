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
      DUR: 2,
      GLK: 1
    });
  });

  it('merges verbose supplier aliases into standard branch abbreviations', () => {
    expect(normalizeStockByLocation({
      'Cape Town': 2,
      'EWT - Cape Town - Cape Town': 3,
      'EXOTIC WHEEL AND TYRE - Johannesburg': 4,
      Eastport: 5,
      Durban: 6,
      'Durban CDC': 7,
      Ladysmith: 8,
      'Port Elizabeth': 9
    })).toEqual({ CPT: 5, JHB: 9, DUR: 21, PLZ: 9 });
  });

  it('keeps the standard branch order before additional locations', () => {
    expect(sortStockLocationEntries({ PLZ: 1, CPT: 2, JHB: 3, DUR: 4, GLK: 5 })).toEqual([
      ['JHB', 3],
      ['CPT', 2],
      ['DUR', 4],
      ['PLZ', 1],
      ['GLK', 5]
    ]);
  });

  it('removes inbound and non-stock status rows from available locations', () => {
    expect(normalizeStockByLocation({
      'Inbound To Cape Town': 4,
      'No Stock Listed': 0,
      'Cape Town': 3
    })).toEqual({ CPT: 3 });
  });
});
