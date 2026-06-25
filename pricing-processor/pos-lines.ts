import { PricingPOSQuoteLine, PricingRules, TyreRecord } from './types';

const getDescriptionParts = (record: TyreRecord, rules: PricingRules): string[] => {
  const parts: string[] = [];
  if (rules.showCategory && record.category) parts.push(record.category);
  if (rules.showRating && record.rating) parts.push(record.rating);
  if (rules.showOemSpec && record.oemSpec) parts.push(record.oemSpec);
  if (rules.showStock && record.stock) parts.push(`Stock: ${record.stock}`);
  if (rules.showLeadTime && record.leadTime) parts.push(`Lead Time: ${record.leadTime}`);
  return parts;
};

export const buildPOSQuoteLines = (
  records: TyreRecord[],
  rules: PricingRules
): PricingPOSQuoteLine[] => records
  .filter((record) => record.size && record.brand && record.pattern && record.calculatedPrice !== null)
  .map((record) => ({
    sourceRecordId: record.id,
    title: [record.size, record.brand, record.pattern].filter(Boolean).join(' '),
    description: getDescriptionParts(record, rules).join(' | '),
    quantity: 1,
    unitPrice: Math.max(0, Math.round(record.calculatedPrice ?? 0))
  }));
