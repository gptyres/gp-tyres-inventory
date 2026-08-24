import { InventoryItem, ProductType, TyreProduct, WheelProduct } from './types';
import { searchInventory } from './utils';
import {
  extractFlotationTyreSizeQuery,
  flotationTyreSizesEqual,
  parseFlotationTyreSize,
  type FlotationTyreSizeComponents
} from './flotationTyreSizeSearch';

export interface SupplierSizeQuery {
  displaySize: string;
  numericKey: string;
  remainingQuery: string;
  kind: 'metric' | 'flotation';
  flotation?: FlotationTyreSizeComponents;
}

export interface SupplierWheelSizeQuery {
  diameter: string;
  width?: string;
  displaySize: string;
  remainingQuery: string;
}

const numericSizeKey = (value: string) => value.replace(/[^0-9]/g, '');

export const extractSupplierTyreSizeQuery = (query: string): SupplierSizeQuery | null => {
  const normalized = query.toUpperCase();
  const buildResult = (match: RegExpMatchArray, displaySize: string): SupplierSizeQuery => ({
    displaySize,
    numericKey: numericSizeKey(displaySize),
    remainingQuery: `${query.slice(0, match.index ?? 0)} ${query.slice((match.index ?? 0) + match[0].length)}`.trim(),
    kind: 'metric'
  });

  const flotation = extractFlotationTyreSizeQuery(query);
  if (flotation) {
    return {
      displaySize: flotation.displaySize,
      numericKey: flotation.compactKeys[0],
      remainingQuery: flotation.remainingQuery,
      kind: 'flotation',
      flotation: {
        diameter: flotation.diameter,
        widthHundredths: flotation.widthHundredths,
        rim: flotation.rim
      }
    };
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

export const extractSupplierWheelSizeQuery = (
  query: string,
  allowBareDiameter = false
): SupplierWheelSizeQuery | null => {
  const buildResult = (
    match: RegExpMatchArray,
    diameter: string,
    width?: string
  ): SupplierWheelSizeQuery => ({
    diameter: String(Number(diameter)),
    width: width ? String(Number(width)) : undefined,
    displaySize: width ? `${Number(diameter)}x${Number(width)}` : `${Number(diameter)} inch`,
    remainingQuery: `${query.slice(0, match.index ?? 0)} ${query.slice((match.index ?? 0) + match[0].length)}`.trim()
  });

  const fullSize = query.match(/\b(1[2-9]|2[0-6])\s*[xX×*]\s*(\d{1,2}(?:\.\d+)?)\s*(?:J\b|["”]?)/i);
  if (fullSize) return buildResult(fullSize, fullSize[1], fullSize[2]);

  const inchSize = query.match(/\b(1[2-9]|2[0-6])\s*(?:inch(?:es)?\b|["”])/i);
  if (inchSize) return buildResult(inchSize, inchSize[1]);

  const labelledSize = query.match(/\b(1[2-9]|2[0-6])\s+(?:wheel(?:s)?|rim(?:s)?)\b/i);
  if (labelledSize) return buildResult(labelledSize, labelledSize[1]);

  if (allowBareDiameter) {
    const bareSize = query.match(/^\s*(1[2-9]|2[0-6])\s*$/i);
    if (bareSize) return buildResult(bareSize, bareSize[1]);
  }

  return null;
};

const supplierName = (item: InventoryItem) => String(item.supplierName || '').trim();

const matchesSizeQuery = (item: InventoryItem, sizeQuery: SupplierSizeQuery): boolean => {
  if (item.type !== ProductType.TYRE) return false;
  if (sizeQuery.kind !== 'flotation' || !sizeQuery.flotation) {
    return numericSizeKey((item as TyreProduct).size) === sizeQuery.numericKey;
  }

  const itemSize = parseFlotationTyreSize((item as TyreProduct).size);
  return Boolean(itemSize && flotationTyreSizesEqual(sizeQuery.flotation, itemSize));
};

const wheelSizeParts = (value: string): { diameter: string; width?: string } | null => {
  const match = String(value || '').match(/\b(\d{2})\s*[xX×*]\s*(\d{1,2}(?:\.\d+)?)/);
  if (!match) return null;
  return { diameter: String(Number(match[1])), width: String(Number(match[2])) };
};

const matchesWheelSizeQuery = (item: InventoryItem, sizeQuery: SupplierWheelSizeQuery): boolean => {
  if (item.type !== ProductType.WHEEL) return false;
  const parts = wheelSizeParts((item as WheelProduct).size);
  if (!parts || parts.diameter !== sizeQuery.diameter) return false;
  return !sizeQuery.width || parts.width === sizeQuery.width;
};

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
  const hasWheels = items.some((item) => item.type === ProductType.WHEEL);
  const hasNonWheels = items.some((item) => item.type !== ProductType.WHEEL);
  const wheelSizeQuery = hasWheels
    ? extractSupplierWheelSizeQuery(query, !hasNonWheels)
    : null;
  if (wheelSizeQuery) {
    const matchingWheels = items.filter((item) => matchesWheelSizeQuery(item, wheelSizeQuery));
    return wheelSizeQuery.remainingQuery
      ? searchInventory(matchingWheels, wheelSizeQuery.remainingQuery)
      : matchingWheels;
  }

  const sizeQuery = extractSupplierTyreSizeQuery(query);
  if (!sizeQuery) return searchInventory(items, query);

  const matchingSizeItems = items.filter((item) => matchesSizeQuery(item, sizeQuery));
  if (!matchingSizeItems.length) {
    return sizeQuery.kind === 'flotation' ? [] : searchInventory(items, query);
  }

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
