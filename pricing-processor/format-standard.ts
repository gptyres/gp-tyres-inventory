import { canonicalSizeKey } from './extract-size';
import { PricingRules, TyreRecord } from './types';

export const formatRand = (value: number | null): string => `R${Math.round(value ?? 0)}`;

const formatOptionalFields = (record: TyreRecord, rules: PricingRules): string[] => {
  const fields: string[] = [];
  if (rules.showCategory && record.category) fields.push(record.category);
  if (rules.showRating && record.rating) fields.push(record.rating);
  if (rules.showOemSpec && record.oemSpec) fields.push(record.oemSpec);
  return fields;
};

const formatAvailability = (record: TyreRecord, rules: PricingRules): string => {
  const details: string[] = [];
  if (rules.showStock && record.stock) details.push(record.stock);
  if (rules.showLeadTime && record.leadTime) details.push(`Lead Time: ${record.leadTime}`);
  return details.length ? ` (${details.join(' | ')})` : '';
};

export const formatProductLine = (record: TyreRecord, rules: PricingRules): string => {
  const product = [record.brand, record.pattern, ...formatOptionalFields(record, rules)]
    .filter(Boolean)
    .join(' ');
  return `${product} @ ${formatRand(record.calculatedPrice)}${formatAvailability(record, rules)}`;
};

export const formatStandardOutput = (records: TyreRecord[], rules: PricingRules): string => {
  if (records.length === 0) {
    return 'No customer-ready tyre records were found. Check the review panel for unresolved records.';
  }

  const groups = new Map<string, TyreRecord[]>();
  for (const record of records) {
    const key = canonicalSizeKey(record.size);
    const existing = groups.get(key) ?? [];
    existing.push(record);
    groups.set(key, existing);
  }

  return Array.from(groups.values())
    .sort((a, b) => (a[0].size ?? '').localeCompare(b[0].size ?? '', undefined, { numeric: true }))
    .map((group) => {
      const sorted = [...group].sort((a, b) => (a.calculatedPrice ?? 0) - (b.calculatedPrice ?? 0));
      const heading = sorted[0].size ?? 'UNKNOWN SIZE';
      const lines = sorted.map((record) => formatProductLine(record, rules));
      return [heading, ...lines].join('\n');
    })
    .join('\n\n');
};
