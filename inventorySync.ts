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

export const fetchGlobalInventory = async () => {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .order('type', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map(row => mapInventoryRowToItem(row as InventoryItemRow));
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
