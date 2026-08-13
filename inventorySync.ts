import { CoiloverProduct, InventoryItem, ProductType, TyreProduct, WheelProduct } from './types';
import { InventoryItemRow, SalesLogInsert, supabase } from './supabaseClient';

export interface StockAdjustment {
  item_id: string;
  delta: number;
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown inventory sync error';
  }
};

export const mapInventoryRowToItem = (row: InventoryItemRow): InventoryItem => {
  const base = {
    ...(row.item as Record<string, unknown>),
    id: row.id,
    quantity: Number(row.quantity) || 0,
    sellingPrice: Number(row.selling_price) || 0,
    costPrice: Number(row.cost_price) || 0,
    lastUpdated: row.last_updated
  };

  if (row.type === ProductType.WHEEL) return { ...base, type: ProductType.WHEEL } as WheelProduct;
  if (row.type === ProductType.COILOVER) return { ...base, type: ProductType.COILOVER } as CoiloverProduct;
  return { ...base, type: ProductType.TYRE } as TyreProduct;
};

export const mergeInventoryItems = (existingItems: InventoryItem[], incomingItems: InventoryItem[]) => {
  const byId = new Map(existingItems.map(item => [item.id, item] as const));
  incomingItems.forEach(item => byId.set(item.id, item));
  return Array.from(byId.values());
};

const normalizeInventoryIdentityPart = (value: unknown) => String(value ?? '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const getSheetInventoryIdentity = (item: InventoryItem) => {
  if (item.type !== ProductType.TYRE || !item.sheetSyncedAt) return '';

  if (item.sheetFingerprint?.trim()) return item.sheetFingerprint.trim().toLowerCase();

  const tyre = item as TyreProduct;
  return [
    normalizeInventoryIdentityPart(tyre.location || 'unknown'),
    normalizeInventoryIdentityPart(`${tyre.brand || ''}${tyre.pattern === 'Standard' ? '' : tyre.pattern || ''}`),
    normalizeInventoryIdentityPart(tyre.size || 'unknown')
  ].join('|');
};

const getSheetSyncTime = (item: InventoryItem) => {
  const parsed = Date.parse(item.sheetSyncedAt || '');
  return Number.isFinite(parsed) ? parsed : 0;
};

const isNewerSheetRecord = (candidate: InventoryItem, current: InventoryItem) => {
  const timeDifference = getSheetSyncTime(candidate) - getSheetSyncTime(current);
  if (timeDifference !== 0) return timeDifference > 0;

  const candidateRow = Number(candidate.sheetRowNumber) || 0;
  const currentRow = Number(current.sheetRowNumber) || 0;
  if (candidateRow !== currentRow) return candidateRow > currentRow;

  return candidate.id.localeCompare(current.id) > 0;
};

/**
 * Sheet rows can acquire new portal IDs when rows move. Keep only the newest
 * record for an exact location/product/size identity so stale stock is never
 * rendered or counted alongside the current sheet row.
 */
export const dedupeSheetSyncedInventoryItems = (items: InventoryItem[]) => {
  const latestByIdentity = new Map<string, InventoryItem>();

  items.forEach((item) => {
    const identity = getSheetInventoryIdentity(item);
    if (!identity) return;

    const current = latestByIdentity.get(identity);
    if (!current || isNewerSheetRecord(item, current)) {
      latestByIdentity.set(identity, item);
    }
  });

  return items.filter((item) => {
    const identity = getSheetInventoryIdentity(item);
    return !identity || latestByIdentity.get(identity)?.id === item.id;
  });
};

const INVENTORY_PAGE_SIZE = 1000;

const getNumericId = (id: string) => {
  const numericPart = id.replace(/^[a-z]+-/, '');
  const numericValue = Number(numericPart);
  return Number.isFinite(numericValue) ? numericValue : Number.MAX_SAFE_INTEGER;
};

export const fetchGlobalInventory = async () => {
  const rows: InventoryItemRow[] = [];

  for (let from = 0; ; from += INVENTORY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .order('type', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + INVENTORY_PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    rows.push(...((data || []) as InventoryItemRow[]));

    if (!data || data.length < INVENTORY_PAGE_SIZE) break;
  }

  return rows
    .sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return getNumericId(a.id) - getNumericId(b.id);
    })
    .map(row => mapInventoryRowToItem(row));
};

export const seedGlobalInventoryIfEmpty = async (items: InventoryItem[]) => {
  const { data, error } = await (supabase.rpc as any)('seed_inventory_items', {
    p_items: items
  });

  if (error) throw new Error(error.message);
  return Number(data) || 0;
};

export const upsertGlobalInventoryItem = async (item: InventoryItem) => {
  const { data, error } = await (supabase.rpc as any)('upsert_inventory_item', {
    p_item: item
  });

  if (error) throw new Error(error.message);
  return mapInventoryRowToItem(data as InventoryItemRow);
};

export const deleteGlobalInventoryItem = async (itemId: string) => {
  const { error } = await (supabase.rpc as any)('delete_inventory_item', {
    p_item_id: itemId
  });

  if (error) throw new Error(error.message);
};

export const processInventoryTransaction = async (
  stockAdjustments: StockAdjustment[],
  salesLogEntries: SalesLogInsert[]
) => {
  const { data, error } = await (supabase.rpc as any)('process_inventory_transaction', {
    p_stock_adjustments: stockAdjustments,
    p_sales_log_entries: salesLogEntries
  });

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  return (data || []).map((row: InventoryItemRow) => mapInventoryRowToItem(row));
};
