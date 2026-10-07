import { ProductType, type InventoryItem } from './types';

export interface CommercialTyreSizeQuery {
  width: number;
  rim: number;
  remainingQuery: string;
}

export const extractCommercialTyreSizeQuery = (query: string): CommercialTyreSizeQuery | null => {
  const match = /(?<![\d./])\b(?:LT\s*)?(\d{1,3}(?:\.\d{1,2})?)\s*(?:R|-)\s*(\d{2}(?:\.\d)?)(?:\s*(?:LT|CP|C))?\b(?![\d./])/i.exec(query);
  if (!match) return null;
  const width = Number(match[1]);
  const rim = Number(match[2]);
  if (!(width > 0 && width <= 455 && rim >= 10 && rim <= 54)) return null;
  return { width, rim, remainingQuery: `${query.slice(0, match.index)} ${query.slice(match.index + match[0].length)}`.trim() };
};

export const matchesCommercialTyreSize = (item: InventoryItem, size: CommercialTyreSizeQuery): boolean => {
  if (item.type !== ProductType.TYRE) return false;
  const parsed = extractCommercialTyreSizeQuery(item.size);
  return Boolean(parsed && parsed.width === size.width && parsed.rim === size.rim);
};
