import { parseSheetInventoryRows, type SheetInventoryRowInput } from './sheetInventorySync';
import type { InventoryItem } from './types';

export interface BackfillRevisionSnapshot {
  revisionId: string;
  modifiedTime: string;
  editorEmail?: string;
  editorDisplayName?: string;
  rows: SheetInventoryRowInput[];
}

export interface BackfillEventInsert {
  product_id: string;
  product_type: string;
  product_snapshot: Record<string, unknown>;
  event_type: 'SALE' | 'RESTOCK' | 'EDIT' | 'ADD' | 'DELETE';
  source: 'BACKFILL';
  quantity_before: number | null;
  quantity_after: number | null;
  quantity_delta: number;
  cost_price_at_change: number;
  selling_price_at_change: number;
  changed_fields: string[];
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  editor_email: string | null;
  editor_display_name: string | null;
  sheet_row_number: number | null;
  confidence: 'RECONSTRUCTED';
  dedupe_key: string;
  occurred_at: string;
  metadata: Record<string, unknown>;
}

export interface BackfillComparisonResult {
  events: BackfillEventInsert[];
  skipped: Array<{ identity: string; reason: string }>;
}

const fields = ['location', 'productName', 'description', 'quantity', 'costPrice', 'sellingPrice'] as const;

const currentIdentityMaps = (items: InventoryItem[]) => {
  const byId = new Map(items.map((item) => [item.id, item] as const));
  const byRow = new Map(items.flatMap((item) => item.sheetRowNumber ? [[item.sheetRowNumber, item] as const] : []));
  const byFingerprint = new Map(items.flatMap((item) => item.sheetFingerprint ? [[item.sheetFingerprint.toLowerCase(), item] as const] : []));
  return { byId, byRow, byFingerprint };
};

const parsedRows = (snapshot: BackfillRevisionSnapshot) => parseSheetInventoryRows(snapshot.rows).parsed;

const rowIdentity = (row: ReturnType<typeof parsedRows>[number]) => (
  row.portalId ? `id:${row.portalId}` : `row:${row.rowNumber}`
);

export const compareInventoryRevisionSnapshots = (
  previous: BackfillRevisionSnapshot,
  current: BackfillRevisionSnapshot,
  currentInventory: InventoryItem[]
): BackfillComparisonResult => {
  const previousRows = parsedRows(previous);
  const currentRows = parsedRows(current);
  const remainingPrevious = new Set(previousRows);
  const maps = currentIdentityMaps(currentInventory);
  const events: BackfillEventInsert[] = [];
  const skipped: Array<{ identity: string; reason: string }> = [];

  const resolveCurrentItem = (row: (typeof currentRows)[number]) => (
    (row.portalId ? maps.byId.get(row.portalId) : undefined)
    || maps.byFingerprint.get(row.fingerprint.toLowerCase())
    || maps.byRow.get(row.rowNumber)
  );

  const addChange = (
    before: (typeof previousRows)[number] | undefined,
    after: (typeof currentRows)[number] | undefined
  ) => {
    const representative = after || before;
    if (!representative) return;
    const currentItem = resolveCurrentItem(representative);
    if (!currentItem) {
      skipped.push({ identity: rowIdentity(representative), reason: 'No unambiguous current inventory match.' });
      return;
    }
    const oldSource = before?.source;
    const newSource = after?.source;
    const changedFields = fields.filter((field) => oldSource?.[field] !== newSource?.[field]);
    if (!changedFields.length) return;
    const quantityBefore = before ? before.source.quantity : null;
    const quantityAfter = after ? after.source.quantity : null;
    const quantityDelta = (quantityAfter ?? 0) - (quantityBefore ?? 0);
    const eventType = !before
      ? 'ADD'
      : !after
        ? 'DELETE'
        : quantityDelta < 0
          ? 'SALE'
          : quantityDelta > 0
            ? 'RESTOCK'
            : 'EDIT';
    const oldValues = Object.fromEntries(changedFields.map((field) => [field, oldSource?.[field] ?? null]));
    const newValues = Object.fromEntries(changedFields.map((field) => [field, newSource?.[field] ?? null]));
    const snapshot = {
      ...currentItem,
      ...(after?.item || before?.item || {}),
      id: currentItem.id,
      quantity: quantityAfter ?? quantityBefore ?? 0,
      costPrice: newSource?.costPrice ?? oldSource?.costPrice ?? currentItem.costPrice,
      sellingPrice: newSource?.sellingPrice ?? oldSource?.sellingPrice ?? currentItem.sellingPrice,
      sheetRowNumber: representative.rowNumber
    };
    events.push({
      product_id: currentItem.id,
      product_type: currentItem.type,
      product_snapshot: snapshot,
      event_type: eventType,
      source: 'BACKFILL',
      quantity_before: quantityBefore,
      quantity_after: quantityAfter,
      quantity_delta: quantityDelta,
      cost_price_at_change: Number(newSource?.costPrice ?? oldSource?.costPrice ?? currentItem.costPrice) || 0,
      selling_price_at_change: Number(newSource?.sellingPrice ?? oldSource?.sellingPrice ?? currentItem.sellingPrice) || 0,
      changed_fields: [...changedFields],
      old_values: oldValues,
      new_values: newValues,
      editor_email: current.editorEmail || null,
      editor_display_name: current.editorDisplayName || null,
      sheet_row_number: representative.rowNumber,
      confidence: 'RECONSTRUCTED',
      dedupe_key: `backfill:${previous.revisionId}:${current.revisionId}:${currentItem.id}`,
      occurred_at: current.modifiedTime,
      metadata: {
        previousRevisionId: previous.revisionId,
        revisionId: current.revisionId,
        originalIdentity: rowIdentity(representative)
      }
    });
  };

  currentRows.forEach((after) => {
    const findRemaining = (predicate: (candidate: (typeof previousRows)[number]) => boolean) => (
      previousRows.find((candidate) => remainingPrevious.has(candidate) && predicate(candidate))
    );
    const resolvedCurrentItem = resolveCurrentItem(after);
    const before = (after.portalId
      ? findRemaining((candidate) => candidate.portalId === after.portalId)
      : undefined)
      || findRemaining((candidate) => candidate.fingerprint === after.fingerprint)
      || (resolvedCurrentItem
        ? findRemaining((candidate) => candidate.rowNumber === after.rowNumber)
        : undefined);
    if (before) remainingPrevious.delete(before);
    addChange(before, after);
  });
  remainingPrevious.forEach((before) => addChange(before, undefined));

  const eventsByDedupeKey = new Map<string, BackfillEventInsert[]>();
  events.forEach((event) => {
    const candidates = eventsByDedupeKey.get(event.dedupe_key) || [];
    candidates.push(event);
    eventsByDedupeKey.set(event.dedupe_key, candidates);
  });

  const uniqueEvents: BackfillEventInsert[] = [];
  eventsByDedupeKey.forEach((candidates, dedupeKey) => {
    if (candidates.length === 1) {
      uniqueEvents.push(candidates[0]);
      return;
    }
    skipped.push({
      identity: dedupeKey,
      reason: 'Multiple historical rows resolved to the same product in one revision pair.'
    });
  });

  return { events: uniqueEvents, skipped };
};
