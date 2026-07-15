import { describe, expect, it } from 'vitest';
import { calculateDeterministicMargin, calculateDeterministicPrice } from './gpBusinessMath';

describe('GP Business Agent deterministic financial rules', () => {
  it('adds 15% VAT once to an exclusive cost and rounds to the nearest R25', () => {
    expect(calculateDeterministicPrice({ costPrice: 100, costIncludesVat: false })).toMatchObject({
      vatAmount: 15,
      sellingPriceBeforeRounding: 115,
      sellingPrice: 125
    });
  });

  it('does not add VAT a second time when the supplied cost is VAT inclusive', () => {
    expect(calculateDeterministicPrice({ costPrice: 115, costIncludesVat: true })).toMatchObject({
      sellingPriceBeforeRounding: 115,
      sellingPrice: 125
    });
  });

  it('calculates gross profit, gross margin and markup without model arithmetic', () => {
    expect(calculateDeterministicMargin(1000, 1500, 4)).toEqual({
      quantity: 4,
      costPriceEach: 1000,
      sellingPriceEach: 1500,
      grossProfitEach: 500,
      grossProfitTotal: 2000,
      grossMarginPercent: 33.33,
      markupPercent: 50
    });
  });
});

