import { AppView, Backorder, InventoryItem, ProductType, ViewMode } from './types';

export type StockFilter = 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
export interface WorkspaceNavigation {
  query?: string;
  stockFilter?: StockFilter;
}
export type WorkspaceNavigate = (view: AppView, type?: ProductType | 'ALL', options?: WorkspaceNavigation) => void;

export const STOCK_FILTERS: { value: StockFilter; label: string }[] = [
  { value: 'ALL', label: 'All' }, { value: 'IN_STOCK', label: 'In stock' },
  { value: 'LOW_STOCK', label: 'Low stock' }, { value: 'OUT_OF_STOCK', label: 'Out of stock' }
];

export function matchesStockFilter(item: InventoryItem, filter: StockFilter): boolean {
  if (filter === 'ALL') return true;
  if (!Number.isFinite(item.quantity)) return false;
  if (filter === 'IN_STOCK') return item.quantity > 0;
  if (filter === 'LOW_STOCK') return item.quantity > 0 && item.quantity < 4;
  return item.quantity <= 0;
}

export function stockCounts(items: InventoryItem[]): Record<StockFilter, number> {
  const counts = { ALL: items.length, IN_STOCK: 0, LOW_STOCK: 0, OUT_OF_STOCK: 0 };
  for (const item of items) {
    if (!Number.isFinite(item.quantity)) continue;
    if (item.quantity <= 0) counts.OUT_OF_STOCK++;
    else {
      counts.IN_STOCK++;
      if (item.quantity < 4) counts.LOW_STOCK++;
    }
  }
  return counts;
}

export function johannesburgDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

export function overdueBackorders(backorders: Backorder[], now = new Date()): Backorder[] {
  const today = johannesburgDay(now);
  return backorders.filter(order => {
    const date = order.expectedDate;
    return order.status === 'PENDING' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date && date < today;
  }).sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
}

export interface InventoryPreferences {
  version: 2;
  viewMode: ViewMode;
  sort: { key: 'brand' | 'size' | 'quantity' | 'price' | 'location'; direction: 'asc' | 'desc' };
  groupBy: 'none' | 'location' | 'brand' | 'type';
  columns: { specs: boolean; location: boolean; price: boolean; cost: boolean };
}

export const preferenceKey = (user: string, catalogue: string) =>
  `gp-inventory-view:v1:${encodeURIComponent(user)}:${encodeURIComponent(catalogue)}`;

export function parseInventoryPreferences(raw: string | null): InventoryPreferences {
  const defaults: InventoryPreferences = {
    version: 2, viewMode: ViewMode.GRID,
    sort: { key: 'price', direction: 'asc' }, groupBy: 'none',
    columns: { specs: true, location: true, price: true, cost: false }
  };
  try {
    const saved = JSON.parse(raw || 'null');
    if (saved?.version !== 1 && saved?.version !== 2) return defaults;
    // Keep the storage key stable so existing column preferences survive migration.
    // Older layouts adopt Card / lowest price once; subsequent choices remain saved.
    if (saved.version === 2) {
      if (Object.values(ViewMode).includes(saved.viewMode)) defaults.viewMode = saved.viewMode;
      if (['brand', 'size', 'quantity', 'price', 'location'].includes(saved.sort?.key)
        && ['asc', 'desc'].includes(saved.sort?.direction)) defaults.sort = saved.sort;
      if (['none', 'location', 'brand', 'type'].includes(saved.groupBy)) defaults.groupBy = saved.groupBy;
    }
    for (const key of Object.keys(defaults.columns) as (keyof InventoryPreferences['columns'])[]) {
      if (typeof saved.columns?.[key] === 'boolean') defaults.columns[key] = saved.columns[key];
    }
  } catch { /* Preferences are optional; unavailable or corrupt storage uses defaults. */ }
  return defaults;
}

export function readInventoryPreferences(key: string): InventoryPreferences {
  try { return parseInventoryPreferences(localStorage.getItem(key)); }
  catch { return parseInventoryPreferences(null); }
}
