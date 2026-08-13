import { type InventoryItem, type SupplierCatalog } from './types';

export type SupplierMarkupAdjustment =
  | { mode: 'BASE'; value: 0 }
  | { mode: 'PERCENT'; value: number }
  | { mode: 'FIXED'; value: number };

export const SUPPLIER_MARKUP_PERCENTAGES = [10, 15, 20, 25, 35] as const;
export const BASE_SUPPLIER_MARKUP: SupplierMarkupAdjustment = { mode: 'BASE', value: 0 };

const VAT_MULTIPLIER = 1.15;
const EX_VAT_COST_CATALOGS = new Set<SupplierCatalog>([
  'SAILUN',
  'MAXXIS',
  'TYREWAREHOUSE',
  'BRIDGESTONE',
  'SAFETY_GRIP',
  'ROYAL_TYRES',
  'REVOLUTION_TYRES',
  'APEX',
  'TUBESTONE',
  'EXOTIC',
  'TREAD_ZONE',
  'SUMITOMO_DUNLOP'
]);

const SUPPLIER_NAME_CATALOGS: Record<string, SupplierCatalog> = {
  SAILUN: 'SAILUN',
  MAXXIS: 'MAXXIS',
  EXCLUSIVETYRES: 'EXCLUSIVE_TYRES',
  TYREWAREHOUSE: 'TYREWAREHOUSE',
  ATT: 'ATT',
  BRIDGESTONE: 'BRIDGESTONE',
  SAFETYGRIP: 'SAFETY_GRIP',
  ROYALTYRES: 'ROYAL_TYRES',
  REVOLUTIONTYRES: 'REVOLUTION_TYRES',
  ALINE: 'ALINE',
  STAMFORD: 'STAMFORD',
  APEX: 'APEX',
  TUBESTONE: 'TUBESTONE',
  EXOTIC: 'EXOTIC',
  ARC: 'ARC',
  TREADZONE: 'TREAD_ZONE',
  SUMITOMODUNLOP: 'SUMITOMO_DUNLOP',
  TREADSUNLIMITED: 'TREADS_UNLIMITED',
  TYRELIFE: 'TYRE_LIFE',
  TYRELIFEWHEELS: 'TYRE_LIFE_WHEELS',
  NDT: 'NDT'
};

const normalizeSupplierName = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

const resolveItemCatalog = (
  item: InventoryItem,
  activeCatalog: SupplierCatalog
): SupplierCatalog | null => {
  if (activeCatalog !== 'ALL_SUPPLIERS') return activeCatalog;
  return SUPPLIER_NAME_CATALOGS[normalizeSupplierName(item.supplierName || '')] || null;
};

const sanitizeMarkupValue = (value: number) => (
  Number.isFinite(value) ? Math.max(0, value) : 0
);

export const getSupplierCostIncludingVat = (
  item: InventoryItem,
  activeCatalog: SupplierCatalog
): number => {
  const suppliedCost = item.costPrice > 0 ? item.costPrice : item.sellingPrice;
  const catalog = resolveItemCatalog(item, activeCatalog);
  return catalog && EX_VAT_COST_CATALOGS.has(catalog)
    ? suppliedCost * VAT_MULTIPLIER
    : suppliedCost;
};

export const calculateSupplierSellingPrice = (
  item: InventoryItem,
  adjustment: SupplierMarkupAdjustment,
  activeCatalog: SupplierCatalog
): number => {
  if (adjustment.mode === 'BASE') return item.sellingPrice;

  const costIncludingVat = getSupplierCostIncludingVat(item, activeCatalog);
  const value = sanitizeMarkupValue(adjustment.value);
  const adjustedPrice = adjustment.mode === 'PERCENT'
    ? costIncludingVat * (1 + value / 100)
    : costIncludingVat + value;

  return Math.round(adjustedPrice);
};

export const applySupplierMarkup = (
  items: InventoryItem[],
  adjustment: SupplierMarkupAdjustment,
  activeCatalog: SupplierCatalog
): InventoryItem[] => {
  if (adjustment.mode === 'BASE') return items;
  return items.map((item) => ({
    ...item,
    sellingPrice: calculateSupplierSellingPrice(item, adjustment, activeCatalog)
  } as InventoryItem));
};

export const getSupplierMarkupPriceLabel = (
  adjustment: SupplierMarkupAdjustment,
  fallback = 'Selling Price'
): string => {
  if (adjustment.mode === 'BASE') return fallback;
  return adjustment.mode === 'PERCENT'
    ? `Selling Price (+${adjustment.value}%)`
    : `Selling Price (+R${adjustment.value})`;
};
