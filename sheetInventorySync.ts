import { InventoryItem, ProductType, TyreProduct } from './types';

export const SHEET_INVENTORY_SPREADSHEET_ID = '1QJp8o-KzSNIn2xUCS_0o8gNqYzbBP7jYQ_rqtxYw0VY';
export const SHEET_INVENTORY_TAB_NAME = 'INVENTORY';
export const SHEET_INVENTORY_VISIBLE_RANGE = 'A:G';
export const SHEET_INVENTORY_HELPER_HEADERS = ['PORTAL_ID', 'LAST_SYNCED_AT', 'LAST_SYNC_STATUS'] as const;

export interface SheetInventoryRowInput {
  rowNumber: number;
  values: unknown[];
  portalId?: string;
}

export interface ParsedSheetInventoryRow {
  rowNumber: number;
  item: TyreProduct;
  portalId?: string;
  fingerprint: string;
  source: {
    location: string;
    productName: string;
    description: string;
    quantity: number;
    costPrice: number;
    sellingPrice: number;
  };
}

export interface SkippedSheetInventoryRow {
  rowNumber: number;
  reason: string;
  values: unknown[];
}

export interface ParseSheetInventoryRowsResult {
  parsed: ParsedSheetInventoryRow[];
  skipped: SkippedSheetInventoryRow[];
}

const normalizeCellText = (value: unknown) => {
  if (value === null || value === undefined) return '';
  return String(value).replace(/^"+|"+$/g, '').replace(/\s+/g, ' ').trim();
};

export const parseSheetCurrency = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const cleaned = normalizeCellText(value)
    .replace(/[Rr]/g, '')
    .replace(/\s/g, '')
    .replace(/[^0-9,.-]/g, '');

  if (!cleaned) return 0;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;

  if (hasComma && hasDot) {
    normalized = cleaned.replace(/,/g, '');
  } else if (hasComma) {
    const commaParts = cleaned.split(',');
    const lastPart = commaParts.at(-1) ?? '';
    normalized = lastPart.length === 2
      ? `${commaParts.slice(0, -1).join('')}.${lastPart}`
      : cleaned.replace(/,/g, '');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseQuantity = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  const parsed = Number(normalizeCellText(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const makeFingerprint = (location: string, productName: string, description: string) => [
  normalizeKey(location || 'unknown'),
  normalizeKey(productName || 'unknown'),
  normalizeKey(description || 'unknown')
].join('|');

const isHeaderOrSectionRow = (values: unknown[]) => {
  const joined = values.map(normalizeCellText).join(' ').toUpperCase();
  if (!joined) return true;
  if (joined.includes('PRODUCT NAME') && joined.includes('QUANTITY')) return true;

  const productName = normalizeCellText(values[2] ?? values[1]);
  const description = normalizeCellText(values[3]);
  const quantityCell = normalizeCellText(values[4]);
  const costCell = normalizeCellText(values[5]);
  const sellingCell = normalizeCellText(values[6]);

  return Boolean(productName && !description && !quantityCell && !costCell && !sellingCell);
};

export const parseSheetInventoryRow = (input: SheetInventoryRowInput): ParsedSheetInventoryRow | SkippedSheetInventoryRow => {
  const values = input.values ?? [];
  if (input.rowNumber <= 1 || isHeaderOrSectionRow(values)) {
    return { rowNumber: input.rowNumber, reason: 'Header, blank, or section row.', values };
  }

  const location = normalizeCellText(values[0]) || 'Unknown';
  const productName = normalizeCellText(values[2]) || normalizeCellText(values[1]);
  const description = normalizeCellText(values[3]) || 'Unknown';
  const quantity = parseQuantity(values[4]);
  const costPrice = parseSheetCurrency(values[5]);
  const sellingPrice = parseSheetCurrency(values[6]);

  if (!productName) {
    return { rowNumber: input.rowNumber, reason: 'Missing product name.', values };
  }

  const brandParts = productName.split(' ').filter(Boolean);
  const brand = brandParts[0] || 'Unknown';
  const pattern = brandParts.slice(1).join(' ') || 'Standard';
  const lastUpdated = new Date().toISOString().slice(0, 10);
  const id = input.portalId?.trim() || `sheet-row-${input.rowNumber}`;

  const item: TyreProduct = {
    id,
    type: ProductType.TYRE,
    location,
    brand,
    pattern,
    size: description,
    quantity,
    costPrice,
    sellingPrice,
    loadSpeedIndex: '',
    lastUpdated
  };

  return {
    rowNumber: input.rowNumber,
    item,
    portalId: input.portalId?.trim() || undefined,
    fingerprint: makeFingerprint(location, productName, description),
    source: {
      location,
      productName,
      description,
      quantity,
      costPrice,
      sellingPrice
    }
  };
};

export const parseSheetInventoryRows = (rows: SheetInventoryRowInput[]): ParseSheetInventoryRowsResult => {
  const parsed: ParsedSheetInventoryRow[] = [];
  const skipped: SkippedSheetInventoryRow[] = [];

  rows.forEach((row) => {
    const result = parseSheetInventoryRow(row);
    if ('item' in result) parsed.push(result);
    else skipped.push(result);
  });

  return { parsed, skipped };
};

const inventoryItemFingerprint = (item: InventoryItem) => {
  if (item.type !== ProductType.TYRE) return '';
  const productName = item.pattern && item.pattern !== 'Standard'
    ? `${item.brand} ${item.pattern}`
    : item.brand;
  return makeFingerprint(
    item.location,
    productName,
    item.size
  );
};

export const resolveSheetInventoryPortalIds = (
  parsedRows: ParsedSheetInventoryRow[],
  existingItems: InventoryItem[]
) => {
  const usedIds = new Set<string>();
  const matches = new Map<number, string>();

  parsedRows.forEach((parsedRow) => {
    if (parsedRow.portalId && existingItems.some((item) => item.id === parsedRow.portalId)) {
      usedIds.add(parsedRow.portalId);
      matches.set(parsedRow.rowNumber, parsedRow.portalId);
      return;
    }

    const exactMatch = existingItems.find((item) => (
      !usedIds.has(item.id)
      && inventoryItemFingerprint(item) === parsedRow.fingerprint
    ));

    if (exactMatch) {
      usedIds.add(exactMatch.id);
      matches.set(parsedRow.rowNumber, exactMatch.id);
    }
  });

  return matches;
};

export const buildInventoryRowForSheetItem = (item: InventoryItem) => ({
  id: item.id,
  type: item.type,
  item,
  quantity: item.quantity,
  selling_price: item.sellingPrice,
  cost_price: item.costPrice,
  last_updated: item.lastUpdated
});
