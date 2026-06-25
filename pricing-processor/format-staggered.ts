import { PricingRules, TyreRecord } from './types';
import { canonicalSizeKey } from './extract-size';
import { deduplicateStaggeredRecords } from './deduplicate';
import { formatRand } from './format-standard';

const pairKey = (record: TyreRecord): string => [
  record.brand ?? '',
  record.pattern ?? '',
  record.oemSpec ?? ''
].join('|');

const productLabel = (record: TyreRecord, rules: PricingRules): string => {
  const optional = [
    rules.showCategory ? record.category : null,
    rules.showRating ? record.rating : null,
    rules.showOemSpec ? record.oemSpec : null
  ].filter(Boolean);
  return [record.brand, record.pattern, ...optional].filter(Boolean).join(' ');
};

const offerLine = (record: TyreRecord, rules: PricingRules, includeSupplier = true): string => {
  const availability = [
    rules.showStock && record.stock ? record.stock : null,
    rules.showLeadTime && record.leadTime ? `Lead Time: ${record.leadTime}` : null
  ].filter(Boolean);
  const supplier = includeSupplier && record.supplier ? `${record.supplier}: ` : '';
  return `* ${supplier}${productLabel(record, rules)} @ ${formatRand(record.calculatedPrice)}${availability.length ? ` (${availability.join(' | ')})` : ''}`;
};

export const formatStaggeredOutput = (
  records: TyreRecord[],
  rules: PricingRules,
  frontSize: string,
  rearSize: string
): string => {
  const frontKey = canonicalSizeKey(frontSize);
  const rearKey = canonicalSizeKey(rearSize);
  const prepared = deduplicateStaggeredRecords(records);
  const frontRecords = prepared
    .filter((record) => canonicalSizeKey(record.size) === frontKey)
    .sort((a, b) => (a.calculatedPrice ?? 0) - (b.calculatedPrice ?? 0));
  const rearRecords = prepared
    .filter((record) => canonicalSizeKey(record.size) === rearKey)
    .sort((a, b) => (a.calculatedPrice ?? 0) - (b.calculatedPrice ?? 0));

  const rearByPair = new Map<string, TyreRecord[]>();
  for (const record of rearRecords) {
    const list = rearByPair.get(pairKey(record)) ?? [];
    list.push(record);
    rearByPair.set(pairKey(record), list);
  }

  const pairs = Array.from(new Set(frontRecords.map(pairKey)))
    .filter((key) => rearByPair.has(key))
    .map((key) => ({
      key,
      front: frontRecords.filter((record) => pairKey(record) === key),
      rear: rearByPair.get(key) ?? []
    }))
    .sort((a, b) => {
      const aTotal = (a.front[0]?.calculatedPrice ?? Infinity) + (a.rear[0]?.calculatedPrice ?? Infinity);
      const bTotal = (b.front[0]?.calculatedPrice ?? Infinity) + (b.rear[0]?.calculatedPrice ?? Infinity);
      return aTotal - bTotal;
    });

  const activeRules = [
    rules.roundTo50 ? 'Round R50' : null,
    rules.percentageMarkup ? `${rules.percentageMarkup}% Markup` : null,
    rules.fixedMarkup ? `+R${rules.fixedMarkup}` : null
  ].filter(Boolean).join(', ') || 'Base pricing';

  const sections: string[] = [
    '## Data Processing Dashboard',
    `> **Staggered Setup:** ${frontSize} (Front) & ${rearSize} (Rear) | **Rules Applied:** ${activeRules}`,
    '',
    '---',
    '',
    '### Exact Matching Pairs (By Brand & Pattern)'
  ];

  if (pairs.length === 0) {
    sections.push('', '_No exact brand-and-pattern pairs were found across both requested sizes._');
  } else {
    pairs.forEach((pair, index) => {
      const sample = pair.front[0] ?? pair.rear[0];
      sections.push(
        '',
        `#### ${index + 1}. ${sample.brand} ${sample.pattern}`,
        `* **Front (${frontSize}):**`,
        ...pair.front.map((record) => `    ${offerLine(record, rules)}`),
        `* **Rear (${rearSize}):**`,
        ...pair.rear.map((record) => `    ${offerLine(record, rules)}`)
      );
    });
  }

  const summaryRecords = [...frontRecords, ...rearRecords];
  sections.push('', '---', '', '### Stock Summary by Location');

  if (summaryRecords.length === 0) {
    sections.push('', '_No stock was found for either requested size._');
  } else {
    const bySupplier = new Map<string, TyreRecord[]>();
    for (const record of summaryRecords) {
      const key = record.supplier ?? 'UNSPECIFIED LOCATION';
      const list = bySupplier.get(key) ?? [];
      list.push(record);
      bySupplier.set(key, list);
    }

    for (const [supplier, supplierRecords] of bySupplier.entries()) {
      const leadTime = supplierRecords.find((record) => record.leadTime)?.leadTime;
      sections.push('', `#### ${supplier}${leadTime ? ` (${leadTime})` : ''}`);
      supplierRecords
        .sort((a, b) => (a.size ?? '').localeCompare(b.size ?? '', undefined, { numeric: true }))
        .forEach((record) => {
          sections.push(`* ${record.size} ${productLabel(record, rules)} @ ${formatRand(record.calculatedPrice)}${rules.showStock && record.stock ? ` (${record.stock})` : ''}`);
        });
    }
  }

  return sections.join('\n');
};
