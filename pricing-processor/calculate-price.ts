import { VAT_RATE } from './constants';
import { PricingRules, TyreRecord } from './types';

export const sanitizeFixedMarkup = (value: number): number => {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100) / 100;
};

export const roundToNearest50 = (value: number): number => Math.round(value / 50) * 50;

export const calculateSellingPrice = (
  record: Pick<TyreRecord, 'basePrice' | 'selectedPrice' | 'vatIncluded' | 'priceIsFinalSellingPrice'>,
  rules: PricingRules
): number | null => {
  if (record.selectedPrice === null || !Number.isFinite(record.selectedPrice)) return null;

  if (record.priceIsFinalSellingPrice) {
    return rules.roundTo50 ? roundToNearest50(record.selectedPrice) : Math.round(record.selectedPrice);
  }

  const basePrice = record.basePrice ?? record.selectedPrice;
  if (!Number.isFinite(basePrice) || basePrice < 0) return null;

  const vatAdjusted = record.vatIncluded ? basePrice : basePrice * (1 + VAT_RATE);
  const percentageAdjusted = vatAdjusted * (1 + rules.percentageMarkup / 100);
  const withFixedMarkup = percentageAdjusted + sanitizeFixedMarkup(rules.fixedMarkup);
  return rules.roundTo50 ? roundToNearest50(withFixedMarkup) : Math.round(withFixedMarkup);
};

export const setPercentageMarkup = (
  rules: PricingRules,
  percentageMarkup: PricingRules['percentageMarkup']
): PricingRules => ({
  ...rules,
  percentageMarkup: rules.percentageMarkup === percentageMarkup ? 0 : percentageMarkup
});
