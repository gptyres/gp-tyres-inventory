import { InventoryItem, ProductType, TyreProduct } from './types';
import { searchInventory } from './utils';

export interface SupplierSizeQuery {
  displaySize: string;
  numericKey: string;
  remainingQuery: string;
}

const numericSizeKey = (value: string) => value.replace(/[^0-9]/g, '');

export const extractSupplierTyreSizeQuery = (query: string): SupplierSizeQuery | null => {
  const normalized = query.toUpperCase();
  const buildResult = (match: RegExpMatchArray, displaySize: string): SupplierSizeQuery => ({
    displaySize,
    numericKey: numericSizeKey(displaySize),
    remainingQuery: `${query.slice(0, match.index ?? 0)} ${query.slice((match.index ?? 0) + match[0].length)}`.trim()
  });

  const flotation = normalized.match(/\b(\d{2,3})\s*[X*]\s*(\d{1,2}(?:\.\d{1,2})?)\s*R\s*(\d{2}(?:\.\d)?)(?:LT)?\b/);
  if (flotation) {
    const displaySize = `${flotation[1]}X${flotation[2]}R${flotation[3]}`;
    return buildResult(flotation, displaySize);
  }

  const passenger = normalized.match(/\b(\d{3})\s*[\/\-\s]+\s*(\d{2,3})\s*(?:ZR|R|[\/\-\s]+)\s*(\d{2}(?:\.\d)?)(?:LT|C)?\b/);
  if (passenger) {
    const displaySize = `${passenger[1]}/${passenger[2]}R${passenger[3]}`;
    return buildResult(passenger, displaySize);
  }

  const commercial = normalized.match(/\b(\d{1,2}(?:\.\d{1,2})?)\s*R\s*(\d{2}(?:\.\d)?)(?:C)?\b/);
  if (commercial) {
    const displaySize = `${commercial[1]}R${commercial[2]}`;
    return buildResult(commercial, displaySize);
  }

  const compactPassenger = normalized.match(/\b(\d{3})(\d{2})(\d{2})\b/);
  if (compactPassenger) {
    const displaySize = `${compactPassenger[1]}/${compactPassenger[2]}R${compactPassenger[3]}`;
    return buildResult(compactPassenger, displaySize);
  }

  return null;
};

const supplierName = (item: InventoryItem) => String(item.supplierName || '').trim();

const compareSupplierResults = (preferredIds: Set<string>) => (left: InventoryItem, right: InventoryItem) => {
  const preferredDifference = Number(preferredIds.has(right.id)) - Number(preferredIds.has(left.id));
  if (preferredDifference) return preferredDifference;

  const leftBrand = left.type === ProductType.TYRE ? (left as TyreProduct).brand : '';
  const rightBrand = right.type === ProductType.TYRE ? (right as TyreProduct).brand : '';
  const brandDifference = leftBrand.localeCompare(rightBrand, undefined, { sensitivity: 'base' });
  if (brandDifference) return brandDifference;

  const supplierDifference = supplierName(left).localeCompare(supplierName(right), undefined, { sensitivity: 'base' });
  if (supplierDifference) return supplierDifference;

  return left.sellingPrice - right.sellingPrice;
};

export const searchSupplierInventory = (items: InventoryItem[], query: string): InventoryItem[] => {
  const sizeQuery = extractSupplierTyreSizeQuery(query);
  if (!sizeQuery) return searchInventory(items, query);

  const matchingSizeItems = items.filter((item) => (
    item.type === ProductType.TYRE
    && numericSizeKey((item as TyreProduct).size) === sizeQuery.numericKey
  ));
  if (!matchingSizeItems.length) return searchInventory(items, query);

  const preferredIds = new Set(
    (sizeQuery.remainingQuery ? searchInventory(matchingSizeItems, sizeQuery.remainingQuery) : matchingSizeItems)
      .map((item) => item.id)
  );
  return [...matchingSizeItems].sort(compareSupplierResults(preferredIds));
};

export const getSupplierSizeSearchSummary = (items: InventoryItem[], query: string) => {
  const sizeQuery = extractSupplierTyreSizeQuery(query);
  if (!sizeQuery || !items.length) return null;

  const tyres = items.filter((item): item is TyreProduct => item.type === ProductType.TYRE);
  if (!tyres.length) return null;

  return {
    size: tyres[0].size || sizeQuery.displaySize,
    brands: new Set(tyres.map((item) => item.brand.trim().toUpperCase()).filter(Boolean)).size,
    suppliers: new Set(tyres.map((item) => supplierName(item).toUpperCase()).filter(Boolean)).size,
    options: tyres.length
  };
};
