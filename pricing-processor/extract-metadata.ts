import { CATEGORY_KEYWORDS, OEM_MARKERS, SUPPLIER_HINTS } from './constants';
import { normalizeTokenText } from './normalize';
import { findTyreSizeMatches } from './extract-size';
import { PRICE_PATTERN } from './extract-price';

const maskPricingAndSizes = (input: string): string => {
  let masked = input.replace(PRICE_PATTERN, ' ');
  for (const match of findTyreSizeMatches(input)) {
    masked = masked.replace(match.raw, ' ');
  }
  return masked;
};

export const extractCategory = (input: string): string | null => {
  for (const [pattern, category] of CATEGORY_KEYWORDS) {
    if (pattern.test(input)) return category;
  }
  return null;
};

export const extractStock = (input: string): string | null => {
  const masked = maskPricingAndSizes(input);
  const direct = masked.match(/\b(\d+\+?)\s*(?:units?\s+in\s+stock|in\s+stock)\b/i);
  if (direct) return direct[1];

  const labelled = masked.match(/\b(?:stock|qty|qoh|soh|available)\s*:?\s*(\d+\+?)\b/i);
  if (labelled) return labelled[1];

  const lines = masked
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const quantityLine = lines.find((line) => /^\d+\+?$/.test(line));
  if (quantityLine && /(?:supplier|tyres|price|hours?|days?|\bR\s*\d)/i.test(input)) {
    return quantityLine;
  }

  return null;
};

export const extractLeadTime = (input: string): string | null => {
  const match = input.match(/\b(same day|available tomorrow|\d+\s*(?:hours?|days?))\b/i);
  return match ? match[1].replace(/\s+/g, ' ').trim() : null;
};

export const extractRating = (input: string): string | null => {
  const masked = maskPricingAndSizes(input).toUpperCase();
  const match = masked.match(/\b(\d{2,3}(?:\/\d{2,3})?[A-Z])(?:\s+(XL|RF|RFT|ROF|OWL|RWL|WLT|MFS|FR))*\b/);
  if (!match) return null;

  const flags = masked.match(/\b(XL|RF|RFT|ROF|OWL|RWL|WLT|MFS|FR)\b/g) ?? [];
  return [match[1], ...Array.from(new Set(flags))].join(' ').trim();
};

export const extractOemSpec = (input: string): string | null => {
  const text = normalizeTokenText(input);
  const markers: string[] = [];

  for (const marker of OEM_MARKERS) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, 'i');
    if (pattern.test(text)) markers.push(marker);
  }

  if (/(^|[^A-Z0-9])\*([^A-Z0-9]|$)/.test(text)) markers.push('*');
  return markers.length ? Array.from(new Set(markers)).join(' ') : null;
};

export const extractSupplier = (input: string): string | null => {
  const labelled = input.match(/\b(?:supplier|location)\s*:?\s*([A-Z0-9 &/-]{2,40})/i);
  if (labelled) return labelled[1].trim().toUpperCase();

  const text = normalizeTokenText(input);
  for (const hint of SUPPLIER_HINTS) {
    if (text.includes(hint)) return hint;
  }
  return null;
};
