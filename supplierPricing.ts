import type { SupplierCatalog } from './types';

export const SUPPLIER_VAT_RATE = 0.15;

export const roundSupplierSellingPrice = (value: number): number => (
  Math.round(Math.max(0, Number.isFinite(value) ? value : 0) + 1e-9)
);

export const calculateVatInclusiveSellingPrice = (costPriceExVat: number): number => (
  roundSupplierSellingPrice(
    Math.max(0, Number.isFinite(costPriceExVat) ? costPriceExVat : 0) * (1 + SUPPLIER_VAT_RATE)
  )
);

const VAT_INCLUSIVE_LIVE_PRICE_CATALOGS = new Set<SupplierCatalog>([
  'ALINE',
  'NDT',
  'WHEEL_TECH'
]);

export const calculateLiveSupplierSellingPrice = (
  catalog: SupplierCatalog,
  costPrice: number,
  suppliedSellingPrice: number
): number => (
  VAT_INCLUSIVE_LIVE_PRICE_CATALOGS.has(catalog) || costPrice <= 0
    ? roundSupplierSellingPrice(suppliedSellingPrice)
    : calculateVatInclusiveSellingPrice(costPrice)
);
