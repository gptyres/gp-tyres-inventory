import { describe, expect, it } from 'vitest';
import { extractTyreSizeForAgentFallback, normalizeAgentSearchText } from './gpBusinessAgent';

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
});
