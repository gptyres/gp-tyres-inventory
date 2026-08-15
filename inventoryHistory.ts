import type {
  DailySalesReportRow,
  InventoryChangeEvent,
  InventoryChangeEventType,
  InventoryChangeSource,
  StockMovementSummary
} from './types';

const readJson = async (response: Response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Stock history is unavailable.');
  return data;
};

export interface ProductHistoryFilters {
  days: 'today' | 5 | 15 | 30 | 'all';
  eventType: InventoryChangeEventType | '';
  source: InventoryChangeSource | '';
}

export const fetchProductHistory = async (
  productId: string,
  filters: ProductHistoryFilters,
  cursor = ''
): Promise<{ events: InventoryChangeEvent[]; nextCursor: string | null }> => {
  const params = new URLSearchParams({
    productId,
    days: filters.days === 'today' ? '1' : String(filters.days),
    limit: '100'
  });
  if (filters.eventType) params.set('eventType', filters.eventType);
  if (filters.source) params.set('source', filters.source);
  if (cursor) params.set('cursor', cursor);
  params.set('resource', 'inventory-history');
  const data = await readJson(await fetch(`/api/staff-session?${params}`, { credentials: 'same-origin' }));
  return {
    events: Array.isArray(data.events) ? data.events : [],
    nextCursor: typeof data.nextCursor === 'string' && data.nextCursor ? data.nextCursor : null
  };
};

export const fetchStockMovementSummary = async (days = 15): Promise<StockMovementSummary> => {
  const data = await readJson(await fetch(`/api/staff-session?resource=stock-movement&days=${days}`, { credentials: 'same-origin' }));
  return data.summary;
};

export const fetchDailyStockMovementReport = async (date: string): Promise<DailySalesReportRow[]> => {
  const params = new URLSearchParams({ mode: 'report', date });
  params.set('resource', 'stock-movement');
  const data = await readJson(await fetch(`/api/staff-session?${params}`, { credentials: 'same-origin' }));
  return data.rows || [];
};

export const getHistoryActor = (event: InventoryChangeEvent) => (
  event.staffName || event.editorDisplayName || event.editorEmail || 'System'
);

export const getHistoryLocation = (event: InventoryChangeEvent) => {
  if (event.terminalId) return `Terminal ${event.terminalId}`;
  if (event.sheetRowNumber) return `Google Sheet row ${event.sheetRowNumber}`;
  return event.source.replaceAll('_', ' ');
};

export const getHistorySummary = (events: InventoryChangeEvent[] = []) => ({
  soldUnits: events
    .filter((event) => event.eventType === 'SALE')
    .reduce((total, event) => total + Math.abs(event.quantityDelta), 0),
  netMovement: events.reduce((total, event) => total + event.quantityDelta, 0),
  editCount: events.filter((event) => event.eventType === 'EDIT').length
});
