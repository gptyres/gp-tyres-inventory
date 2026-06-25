import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICING_RULES } from '../constants';
import { setPercentageMarkup } from '../calculate-price';
import { extractPriceData, parsePrice } from '../extract-price';
import { normalizeTyreSize } from '../extract-size';
import { buildPOSQuoteLines } from '../pos-lines';
import { processPricing } from '../process-pricing';

const rules = {
  ...DEFAULT_PRICING_RULES,
  roundTo50: false,
  percentageMarkup: 0 as const,
  fixedMarkup: 0
};

describe('pricing processor size normalization', () => {
  it('normalizes common tyre sizes', () => {
    expect(normalizeTyreSize('225/45ZR17')).toBe('225/45R17');
    expect(normalizeTyreSize('2254517')).toBe('225/45R17');
    expect(normalizeTyreSize('195R14C')).toBe('195R14C');
    expect(normalizeTyreSize('315/80R22.5')).toBe('315/80R22.5');
  });
});

describe('pricing processor price extraction', () => {
  it('normalizes Rand prices', () => {
    expect(parsePrice('R 1,499')).toBe(1499);
    expect(parsePrice('R1 499,00')).toBe(1499);
    expect(parsePrice('R494.00')).toBe(494);
  });

  it('protects VAT amounts in parentheses', () => {
    const priceData = extractPriceData('R494.00 excl 15% tax (R74.10)');
    expect(priceData.basePrice).toBe(494);
    expect(priceData.selectedPrice).toBe(494);
    expect(priceData.priceTo).toBeNull();
  });

  it('does not treat VAT amount as price-to', () => {
    const priceData = extractPriceData('R615.00 excl 15% tax (R92.25)');
    expect(priceData.basePrice).toBe(615);
    expect(priceData.priceTo).toBeNull();
  });
});

describe('pricing processor records', () => {
  it('uses price-to as final selling price in concatenated two-price rows', () => {
    const result = processPricing({
      rawData: 'DUNLOP AT3G WLT265/65/170R2,900.00R3,750.00',
      rules,
      mode: 'standard'
    });

    const record = result.records[0];
    expect(record.size).toBe('265/65R17');
    expect(record.brand).toBe('DUNLOP');
    expect(record.pattern).toBe('GRANDTREK AT3G');
    expect(record.priceFrom).toBe(2900);
    expect(record.priceTo).toBe(3750);
    expect(record.selectedPrice).toBe(3750);
    expect(record.priceIsFinalSellingPrice).toBe(true);
  });

  it('applies VAT and markup rules for one-price rows', () => {
    const result = processPricing({
      rawData: 'APTANY RU149Y R/T265/65/17121650R2499.00',
      rules,
      mode: 'standard'
    });

    const record = result.records[0];
    expect(record.size).toBe('265/65R17');
    expect(record.brand).toBe('APTANY');
    expect(record.pattern).toBe('RU149Y R/T');
    expect(record.selectedPrice).toBe(2499);
    expect(record.calculatedPrice).toBe(2874);
  });

  it('deduplicates standard output by size brand and pattern using cheapest price', () => {
    const result = processPricing({
      rawData: [
        'DUNLOP AT3G 265/65R17 R3000',
        'DUNLOP AT3G 265/65R17 R2500'
      ].join('\n'),
      rules,
      mode: 'standard'
    });

    expect(result.validRecords).toHaveLength(1);
    expect(result.validRecords[0].calculatedPrice).toBe(2875);
  });

  it('formats standard output without comma prices', () => {
    const result = processPricing({
      rawData: [
        'BRIDGESTONE DUELLER D693 AT 265/65R17 Price R2348',
        'DUNLOP AT3G WLT265/65/170R2,900.00R3,750.00'
      ].join('\n'),
      rules: {
        ...rules,
        showCategory: true
      },
      mode: 'standard'
    });

    expect(result.standardOutput).toContain('265/65R17');
    expect(result.standardOutput).toContain('BRIDGESTONE DUELLER D693 AT @ R2700');
    expect(result.standardOutput).toContain('DUNLOP GRANDTREK AT3G AT @ R3750');
    expect(result.standardOutput).not.toContain('3,750');
  });
});

describe('markup rule helpers', () => {
  it('keeps percentage markup mutually exclusive', () => {
    const fifteen = setPercentageMarkup(rules, 15);
    expect(fifteen.percentageMarkup).toBe(15);
    const thirty = setPercentageMarkup(fifteen, 30);
    expect(thirty.percentageMarkup).toBe(30);
  });
});

describe('POS quote lines', () => {
  it('converts ready quote records to POS lines without supplier names', () => {
    const result = processPricing({
      rawData: 'DUNLOP AT3G WLT265/65/170R2,900.00R3,750.00\nSupplier: APEX TYRES WC',
      rules,
      mode: 'standard'
    });
    const lines = buildPOSQuoteLines(result.validRecords, rules);

    expect(lines).toHaveLength(1);
    expect(lines[0].title).toBe('265/65R17 DUNLOP GRANDTREK AT3G');
    expect(lines[0].unitPrice).toBe(3750);
    expect(`${lines[0].title} ${lines[0].description}`).not.toContain('APEX');
  });
});
