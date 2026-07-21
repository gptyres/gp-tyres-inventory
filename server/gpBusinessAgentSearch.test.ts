import { describe, expect, it } from 'vitest';
import {
  extractTyreSizeForAgentFallback,
  formatInternalStockComparison,
  normalizeAgentSearchText
} from './gpBusinessAgent';

describe('GP Business Agent search normalisation', () => {
  it('matches common tyre-size spelling variants to one stable form', () => {
    expect(normalizeAgentSearchText('265/65R17 all-terrain')).toBe('265/65/17 all-terrain');
    expect(normalizeAgentSearchText('265 65 17 all terrain')).toBe('265/65/17 all terrain');
  });

  it('normalises South African wheel PCD multiplication notation', () => {
    expect(normalizeAgentSearchText('BMW 5\u00d7120 PCD')).toBe('bmw 5x120 pcd');
  });

  it('extracts a safe tyre-size query for deterministic customer fallback', () => {
    expect(extractTyreSizeForAgentFallback('Please write a customer response for 265/65R17 tyres')).toBe('265/65R17');
    expect(extractTyreSizeForAgentFallback('What wheels fit a BMW?')).toBe('');
  });

  it('formats verified physical and supplier stock without exposing cost by default', () => {
    const answer = formatInternalStockComparison('245/70R16', {
      gpStockOptions: [{ title: '245/70R16 Dunlop Grandtrek', stockUnits: 4, sellingPrice: 2525, costPrice: 1900 }],
      supplierStockOptions: [{ supplier: 'TYREWAREHOUSE', size: '245/70R16', brand: 'General', pattern: 'Grabber AT3', stockUnits: 8, sellingPrice: 2375, costPrice: 1700 }]
    });

    expect(answer).toContain('Verified stock for 245/70R16');
    expect(answer).toContain('GP physical stock (1)');
    expect(answer).toContain('TYREWAREHOUSE: 245/70R16 General Grabber AT3 — 8 units — selling R2 375');
    expect(answer).not.toContain('cost R');
  });

  it('includes cost only for authorised admin internal responses', () => {
    const answer = formatInternalStockComparison('245/70R16', {
      gpStockOptions: [{ title: '245/70R16 Dunlop Grandtrek', stockUnits: 4, sellingPrice: 2525, costPrice: 1900 }]
    }, true);

    expect(answer).toContain('selling R2 525 — cost R1 900');
  });
});
