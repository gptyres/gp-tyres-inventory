import { type InventoryItem, type SupplierCatalog } from './types';

export type SupplierMarkupAdjustment =
  | { mode: 'BASE'; value: 0 }
  | { mode: 'PERCENT'; value: number }
  | { mode: 'FIXED'; value: number };

export const SUPPLIER_MARKUP_PERCENTAGES = [10, 15, 20, 25, 35] as const;
export const BASE_SUPPLIER_MARKUP: SupplierMarkupAdjustment = { mode: 'BASE', value: 0 };

const VAT_MULTIPLIER = 1.15;
export type SupplierCostTaxBasis = 'EXCLUDES_VAT' | 'INCLUDES_VAT' | 'NO_VAT';

const BUNDLED_EX_VAT_COST_CATALOGS = new Set<SupplierCatalog>([
  'SAILUN',
  'MAXXIS',
  'EXCLUSIVE_TYRES_NEW',
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

const LIVE_VAT_INCLUDED_COST_CATALOGS = new Set<SupplierCatalog>([
  'ALINE',
  'NDT',
  'WHEEL_TECH'
]);

const NO_VAT_COST_CATALOGS = new Set<SupplierCatalog>([
  'EIBACH'
]);

const SUPPLIER_NAME_CATALOGS: Record<string, SupplierCatalog> = {
  SAILUN: 'SAILUN',
  MAXXIS: 'MAXXIS',
  EXCLUSIVETYRES: 'EXCLUSIVE_TYRES',
  EXCLUSIVETYRESNEW: 'EXCLUSIVE_TYRES_NEW',
  TYREWAREHOUSE: 'TYREWAREHOUSE',
  ATT: 'ATT',
  BRIDGESTONE: 'BRIDGESTONE',
  SAFETYGRIP: 'SAFETY_GRIP',
  ROYALTYRES: 'ROYAL_TYRES',
  REVOLUTIONTYRES: 'REVOLUTION_TYRES',
  DIXONBATTERIES: 'DIXON_BATTERIES',
  ALINE: 'ALINE',
  STAMFORD: 'STAMFORD',
  APEX: 'APEX',
  TUBESTONE: 'TUBESTONE',
  EXOTIC: 'EXOTIC',
  ARC: 'ARC',
  EIBACH: 'EIBACH',
  HOOSIERTYRES: 'HOOSIER_TYRES',
  TREADZONE: 'TREAD_ZONE',
  SUMITOMODUNLOP: 'SUMITOMO_DUNLOP',
  TREADSUNLIMITED: 'TREADS_UNLIMITED',
  TYRELIFE: 'TYRE_LIFE',
  TYRELIFEWHEELS: 'TYRE_LIFE_WHEELS',
  NDT: 'NDT',
  WHEELTECH: 'WHEEL_TECH'
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

const getSuppliedCost = (item: InventoryItem) => (
  item.costPrice > 0 ? item.costPrice : item.sellingPrice
);

export const getSupplierCostTaxBasis = (
  item: InventoryItem,
  activeCatalog: SupplierCatalog
): SupplierCostTaxBasis => {
  const catalog = resolveItemCatalog(item, activeCatalog);
  if (!catalog) return 'INCLUDES_VAT';
  if (NO_VAT_COST_CATALOGS.has(catalog)) return 'NO_VAT';

  // Live snapshots normalize supplier costs to ex-VAT, except catalogues whose
  // source prices are explicitly retained as VAT-inclusive/listed amounts.
  if (item.id.toLowerCase().startsWith('live-')) {
    return LIVE_VAT_INCLUDED_COST_CATALOGS.has(catalog)
      ? 'INCLUDES_VAT'
      : 'EXCLUDES_VAT';
  }

  return BUNDLED_EX_VAT_COST_CATALOGS.has(catalog)
    ? 'EXCLUDES_VAT'
    : 'INCLUDES_VAT';
};

export const getSupplierCostExcludingVat = (
  item: InventoryItem,
  activeCatalog: SupplierCatalog
): number => {
  const suppliedCost = getSuppliedCost(item);
  return getSupplierCostTaxBasis(item, activeCatalog) === 'INCLUDES_VAT'
    ? suppliedCost / VAT_MULTIPLIER
    : suppliedCost;
};

export const getSupplierCostIncludingVat = (
  item: InventoryItem,
  activeCatalog: SupplierCatalog
): number => {
  const suppliedCost = getSuppliedCost(item);
  return getSupplierCostTaxBasis(item, activeCatalog) === 'EXCLUDES_VAT'
    ? suppliedCost * VAT_MULTIPLIER
    : suppliedCost;
};

export const calculateSupplierSellingPrice = (
  item: InventoryItem,
  adjustment: SupplierMarkupAdjustment,
  activeCatalog: SupplierCatalog
): number => {
  if (adjustment.mode === 'BASE') return item.sellingPrice;

  const taxBasis = getSupplierCostTaxBasis(item, activeCatalog);
  const costExcludingVat = getSupplierCostExcludingVat(item, activeCatalog);
  const value = sanitizeMarkupValue(adjustment.value);
  const markedUpSubtotal = adjustment.mode === 'PERCENT'
    ? costExcludingVat * (1 + value / 100)
    : costExcludingVat + value;
  const adjustedPrice = taxBasis === 'NO_VAT'
    ? markedUpSubtotal
    : markedUpSubtotal * VAT_MULTIPLIER;

  return Math.round(adjustedPrice + 1e-9);
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
  fallback = 'VAT Inclusive Price'
): string => {
  if (adjustment.mode === 'BASE') return fallback;
  return adjustment.mode === 'PERCENT'
    ? `VAT Inclusive Price (+${adjustment.value}%)`
    : `VAT Inclusive Price (+R${adjustment.value})`;
};
