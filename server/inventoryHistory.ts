import type {
  DailySalesReportRow,
  InventoryChangeEvent,
  InventoryChangeEventType,
  InventoryChangeSource,
  StockMovementDay,
  StockMovementSummary
} from '../types.js';
import { GP_ORGANIZATION_ID } from './staffSession.js';
import { createSupabaseAdmin } from './supabaseAdmin.js';

export const STOCK_HISTORY_TIMEZONE = 'Africa/Johannesburg';
const JOHANNESBURG_OFFSET = '+02:00';
const HISTORY_PAGE_SIZE = 1000;
const TERMINAL_STAFF_NAMES: Record<string, string> = {
  GP1: 'Noor',
  GP2: 'Rafiek',
  GP4: 'Laeeq',
  GP5: 'Yaseen',
  GP6: 'Mac',
  GP7: 'Zahied',
  GP8: 'Niyaaz',
  PC8: 'Niyaaz'
};

export interface InventoryHistoryQuery {
  productId: string;
  days?: number | null;
  eventType?: InventoryChangeEventType | '';
  source?: InventoryChangeSource | '';
  cursor?: string;
  limit?: number;
}

const cleanText = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const numeric = (value: unknown) => Number(value) || 0;

export const getJohannesburgDateKey = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: STOCK_HISTORY_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(date);

export const getJohannesburgDayBounds = (dateKey: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('Invalid report date.');
  const start = new Date(`${dateKey}T00:00:00${JOHANNESBURG_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
};

export const getJohannesburgRange = (days: number, now = new Date()) => {
  const safeDays = Math.min(30, Math.max(1, Math.trunc(days) || 15));
  const toDate = getJohannesburgDateKey(now);
  const todayStart = new Date(`${toDate}T00:00:00${JOHANNESBURG_OFFSET}`);
  const fromDate = new Date(todayStart.getTime() - (safeDays - 1) * 24 * 60 * 60 * 1000);
  return {
    days: safeDays,
    from: fromDate.toISOString(),
    to: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString()
  };
};

export const describeInventorySnapshot = (snapshot: Record<string, unknown>) => {
  const type = cleanText(snapshot.type).toUpperCase();
  if (type === 'TYRE') {
    return [snapshot.size, snapshot.brand, snapshot.pattern]
      .map(cleanText)
      .filter((part) => part && !/^(unknown|standard)$/i.test(part))
      .join(' ')
      .toUpperCase() || cleanText(snapshot.id).toUpperCase();
  }
  if (type === 'WHEEL') {
    return [snapshot.brand, snapshot.imageDesignKey || snapshot.code, snapshot.size]
      .map(cleanText).filter(Boolean).join(' ').toUpperCase();
  }
  if (type === 'COILOVER') {
    return [snapshot.brand, snapshot.series, snapshot.vehicleCompatibility]
      .map(cleanText).filter(Boolean).join(' ').toUpperCase();
  }
  if (type === 'BATTERY') {
    return [snapshot.batteryType, snapshot.batteryDescription]
      .map(cleanText).filter(Boolean).join(' ').toUpperCase();
  }
  return cleanText(snapshot.id || 'Inventory item').toUpperCase();
};

export const mapInventoryChangeRow = (row: Record<string, any>): InventoryChangeEvent => ({
  id: String(row.id),
  productId: String(row.product_id),
  productType: String(row.product_type),
  productSnapshot: row.product_snapshot || {},
  eventType: row.event_type,
  source: row.source,
  quantityBefore: row.quantity_before === null ? null : numeric(row.quantity_before),
  quantityAfter: row.quantity_after === null ? null : numeric(row.quantity_after),
  quantityDelta: numeric(row.quantity_delta),
  costPriceAtChange: numeric(row.cost_price_at_change),
  sellingPriceAtChange: numeric(row.selling_price_at_change),
  changedFields: Array.isArray(row.changed_fields) ? row.changed_fields.map(String) : [],
  oldValues: row.old_values || {},
  newValues: row.new_values || {},
  staffName: row.staff_name,
  terminalId: row.terminal_id,
  editorEmail: row.editor_email,
  editorDisplayName: row.editor_display_name,
  referenceId: row.reference_id,
  sheetRowNumber: row.sheet_row_number === null ? null : numeric(row.sheet_row_number),
  confidence: row.confidence,
  occurredAt: row.occurred_at,
  metadata: row.metadata || {}
});

const loadAllEvents = async (from: string, to: string) => {
  const supabase = createSupabaseAdmin();
  const rows: Record<string, any>[] = [];
  for (let offset = 0; ; offset += HISTORY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('inventory_change_events')
      .select('*')
      .eq('organization_id', GP_ORGANIZATION_ID)
      .gte('occurred_at', from)
      .lt('occurred_at', to)
      .order('occurred_at', { ascending: true })
      .range(offset, offset + HISTORY_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data || []) as Record<string, any>[];
    rows.push(...page);
    if (page.length < HISTORY_PAGE_SIZE) break;
  }
  return rows.map(mapInventoryChangeRow);
};

export const fetchInventoryHistory = async (query: InventoryHistoryQuery) => {
  const supabase = createSupabaseAdmin();
  const limit = Math.min(200, Math.max(1, Math.trunc(query.limit || 100)));
  let request = supabase
    .from('inventory_change_events')
    .select('*')
    .eq('organization_id', GP_ORGANIZATION_ID)
    .eq('product_id', query.productId)
    .order('occurred_at', { ascending: false })
    .limit(limit + 1);

  if (query.days) request = request.gte('occurred_at', getJohannesburgRange(query.days).from);
  if (query.eventType) request = request.eq('event_type', query.eventType);
  if (query.source) request = request.eq('source', query.source);
  if (query.cursor) request = request.lt('occurred_at', query.cursor);

  const { data, error } = await request;
  if (error) throw new Error(error.message);
  const rows = (data || []) as Record<string, any>[];
  const hasMore = rows.length > limit;
  const events = rows.slice(0, limit).map(mapInventoryChangeRow);
  return {
    events,
    nextCursor: hasMore ? events.at(-1)?.occurredAt || null : null
  };
};

const emptyDay = (date: string): StockMovementDay => ({
  date,
  soldUnits: 0,
  refundUnits: 0,
  reservedUnits: 0,
  restockedUnits: 0,
  editCount: 0,
  costValue: 0,
  retailValue: 0,
  reconstructedEvents: 0
});

export const summarizeStockMovements = (
  events: InventoryChangeEvent[],
  days: number,
  now = new Date()
): StockMovementSummary => {
  const range = getJohannesburgRange(days, now);
  const dailyMap = new Map<string, StockMovementDay>();
  for (let index = 0; index < range.days; index += 1) {
    const date = getJohannesburgDateKey(new Date(new Date(range.from).getTime() + index * 86400000));
    dailyMap.set(date, emptyDay(date));
  }
  const topItems = new Map<string, { description: string; units: number }>();

  events.forEach((event) => {
    const date = getJohannesburgDateKey(new Date(event.occurredAt));
    const day = dailyMap.get(date);
    if (!day) return;
    const units = Math.abs(event.quantityDelta);
    if (event.eventType === 'SALE') {
      day.soldUnits += units;
      day.costValue += units * event.costPriceAtChange;
      day.retailValue += units * event.sellingPriceAtChange;
      const current = topItems.get(event.productId) || {
        description: describeInventorySnapshot(event.productSnapshot),
        units: 0
      };
      current.units += units;
      topItems.set(event.productId, current);
    } else if (event.eventType === 'REFUND') day.refundUnits += units;
    else if (event.eventType === 'RESERVE') day.reservedUnits += units;
    else if (event.eventType === 'RESTOCK') day.restockedUnits += Math.max(0, event.quantityDelta);
    else if (event.eventType === 'EDIT') day.editCount += 1;
    if (event.confidence === 'RECONSTRUCTED') day.reconstructedEvents += 1;
  });

  const todayKey = getJohannesburgDateKey(now);
  const today = dailyMap.get(todayKey) || emptyDay(todayKey);
  const todaySales = events.filter((event) => (
    event.eventType === 'SALE' && getJohannesburgDateKey(new Date(event.occurredAt)) === todayKey
  ));

  return {
    timezone: STOCK_HISTORY_TIMEZONE,
    days: range.days,
    from: range.from,
    to: range.to,
    soldUnitsToday: today.soldUnits,
    refundUnitsToday: today.refundUnits,
    uniqueProductsToday: new Set(todaySales.map((event) => event.productId)).size,
    costValueToday: today.costValue,
    retailValueToday: today.retailValue,
    restockedUnitsToday: today.restockedUnits,
    editCountToday: today.editCount,
    daily: Array.from(dailyMap.values()),
    topItems: Array.from(topItems.entries())
      .map(([productId, item]) => ({ productId, ...item }))
      .sort((left, right) => right.units - left.units || left.description.localeCompare(right.description))
      .slice(0, 8)
  };
};

export const fetchStockMovementSummary = async (days: number) => {
  const range = getJohannesburgRange(days);
  return summarizeStockMovements(await loadAllEvents(range.from, range.to), range.days);
};

export const buildDailySalesReportRows = (
  events: InventoryChangeEvent[],
  currentPrices: Map<string, { costPrice: number; sellingPrice: number }>
): DailySalesReportRow[] => events.map((event) => {
  const current = currentPrices.get(event.productId);
  const actor = cleanText(event.staffName || event.editorDisplayName || event.editorEmail) || 'System';
  const terminalOrSheet = event.terminalId
    ? `${event.terminalId}${TERMINAL_STAFF_NAMES[event.terminalId] ? ` / ${TERMINAL_STAFF_NAMES[event.terminalId]}` : ''}`
    : event.sheetRowNumber
      ? `Sheet row ${event.sheetRowNumber}`
      : event.source;
  return {
    id: event.id,
    occurredAt: event.occurredAt,
    productId: event.productId,
    productDescription: describeInventorySnapshot(event.productSnapshot),
    eventType: event.eventType,
    source: event.source,
    units: Math.abs(event.quantityDelta),
    quantityBefore: event.quantityBefore,
    quantityAfter: event.quantityAfter,
    currentCostPrice: current?.costPrice ?? event.costPriceAtChange,
    currentSellingPrice: current?.sellingPrice ?? event.sellingPriceAtChange,
    staffOrEditor: actor,
    terminalOrSheet,
    confidence: event.confidence
  };
});

export const fetchDailySalesReport = async (dateKey: string) => {
  const bounds = getJohannesburgDayBounds(dateKey);
  const events = await loadAllEvents(bounds.start, bounds.end);
  const productIds = Array.from(new Set(events.map((event) => event.productId)));
  const currentPrices = new Map<string, { costPrice: number; sellingPrice: number }>();
  if (productIds.length) {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('inventory_items')
      .select('id,cost_price,selling_price')
      .in('id', productIds);
    if (error) throw new Error(error.message);
    (data || []).forEach((row: any) => currentPrices.set(row.id, {
      costPrice: numeric(row.cost_price),
      sellingPrice: numeric(row.selling_price)
    }));
  }
  return buildDailySalesReportRows(events, currentPrices);
};
