import { describe, expect, it } from 'vitest';
import { cleanExclusiveTyresNewPattern } from './exclusive-tyres-new-normalization.mjs';

describe('Exclusive Tyres New pattern normalisation', () => {
  it.each([
    ['- TYRES IMP TM568', 'TIMAX', 'TM568'],
    ['IMP FM601', 'FIREMAX', 'FM601'],
    ['- TYRES IMP X privilo TX5', 'TRACMAX', 'X-PRIVILO TX5'],
    ['IMP 80 MILAZE', 'CEAT', 'MILAZE'],
    ['IMP ACHEE AC808', 'ANCHEE', 'AC808'],
    ['- TYRES IMP CATCHFORS H P', 'WINDFORCE', 'CATCHFORS H/P'],
    ['- TYRES GDY EFFICIENTGRIP PERFORMANCE', 'GOODYEAR', 'EFFICIENTGRIP PERFORMANCE'],
  ])('cleans %s', (input, brand, expected) => {
    expect(cleanExclusiveTyresNewPattern(input, brand)).toBe(expected);
  });

  it('leaves genuinely missing pattern information blank', () => {
    expect(cleanExclusiveTyresNewPattern('IMP 108 RADIAL', 'UNKNOWN')).toBe('');
  });
});
