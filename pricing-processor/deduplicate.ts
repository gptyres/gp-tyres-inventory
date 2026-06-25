import { canonicalSizeKey } from './extract-size';
import { TyreRecord } from './types';

const completenessScore = (record: TyreRecord): number => (
  [record.category, record.rating, record.oemSpec, record.stock, record.leadTime, record.supplier]
    .filter(Boolean)
    .length
);

const standardKey = (record: TyreRecord): string => [
  canonicalSizeKey(record.size),
  record.brand ?? '',
  record.pattern ?? ''
].join('|');

export const deduplicateRecords = (records: TyreRecord[]): TyreRecord[] => {
  const byKey = new Map<string, TyreRecord>();

  for (const record of records) {
    const key = standardKey(record);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, record);
      continue;
    }

    const recordPrice = record.calculatedPrice ?? Number.POSITIVE_INFINITY;
    const existingPrice = existing.calculatedPrice ?? Number.POSITIVE_INFINITY;
    if (
      recordPrice < existingPrice ||
      (recordPrice === existingPrice && completenessScore(record) > completenessScore(existing))
    ) {
      byKey.set(key, {
        ...existing,
        ...record,
        category: record.category ?? existing.category,
        rating: record.rating ?? existing.rating,
        oemSpec: record.oemSpec ?? existing.oemSpec,
        stock: record.stock ?? existing.stock,
        leadTime: record.leadTime ?? existing.leadTime,
        supplier: record.supplier ?? existing.supplier
      });
    }
  }

  return Array.from(byKey.values());
};

export const deduplicateStaggeredRecords = (records: TyreRecord[]): TyreRecord[] => {
  const byKey = new Map<string, TyreRecord>();

  for (const record of records) {
    const key = [
      canonicalSizeKey(record.size),
      record.brand ?? '',
      record.pattern ?? '',
      record.oemSpec ?? '',
      record.supplier ?? ''
    ].join('|');
    const existing = byKey.get(key);
    if (!existing || (record.calculatedPrice ?? Infinity) < (existing.calculatedPrice ?? Infinity)) {
      byKey.set(key, record);
    }
  }

  return Array.from(byKey.values());
};
