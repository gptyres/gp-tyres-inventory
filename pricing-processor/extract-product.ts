import { BRAND_ALIASES, PATTERN_ALIASES, SUPPLIER_HINTS } from './constants';
import { findTyreSizeMatches } from './extract-size';
import { PRICE_PATTERN } from './extract-price';
import { normalizeTokenText } from './normalize';

const NOISE_WORDS = [
  'BRAND',
  'CATEGORY',
  'PRICING',
  'NOTICE',
  'ALL',
  'PRICES',
  'ARE',
  'EXCLUDING',
  'INCLUDING',
  'VAT',
  'TAX',
  'TYRES',
  'TYRE',
  'PASSENGER',
  'CAR',
  'RADIAL',
  'SUPPLIER',
  'LOCATION',
  'STOCK',
  'AVAILABLE',
  'UNITS',
  'HOURS',
  'DAYS'
];

export const extractProductDescription = (input: string, size: string | null): string => {
  let text = input.replace(PRICE_PATTERN, ' ');

  for (const match of findTyreSizeMatches(input)) {
    text = text.replace(match.raw, ' ');
  }

  if (size) {
    text = text.replace(size, ' ');
  }

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^(brand|category|pricing|notice|supplier|location)\s*:/i.test(line)) return true;
      if (/^\d+\+?$/.test(line)) return false;
      if (/\b(?:units?\s+in\s+stock|excl|incl|tax|vat|prices?\s+are)\b/i.test(line)) return false;
      return true;
    });

  return lines.join(' ').replace(/\s+/g, ' ').trim();
};

const removeWord = (input: string, word: string): string => {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return input.replace(new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, 'gi'), ' ');
};

export const cleanPatternText = (description: string, brand: string | null): string => {
  let text = normalizeTokenText(description)
    .replace(/\b(TLS|SKU|CODE|IMP)\d*\/?[A-Z0-9-]*/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/\b\d{1,2}\+?\b/g, ' ')
    .replace(/\b\d{1,2}\s*(?:HOURS?|DAYS?)\b/g, ' ')
    .replace(/\b\d{2,3}(?:\/\d{2,3})?[A-Z]\b/g, ' ');

  if (brand) {
    text = removeWord(text, brand);
    for (const [alias, canonical] of Object.entries(BRAND_ALIASES)) {
      if (canonical === brand) text = removeWord(text, alias);
    }
  }

  for (const supplier of SUPPLIER_HINTS) {
    text = removeWord(text, supplier);
  }

  for (const noise of NOISE_WORDS) {
    text = removeWord(text, noise);
  }

  return text.replace(/\s+/g, ' ').trim();
};

export const findKnownPattern = (description: string): { pattern: string; brand?: string; category?: string } | null => {
  const text = normalizeTokenText(description);
  const aliases = Object.entries(PATTERN_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, result] of aliases) {
    if (text.includes(alias)) return result;
  }
  return null;
};
