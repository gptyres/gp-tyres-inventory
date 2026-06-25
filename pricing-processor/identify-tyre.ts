import { BRAND_ALIASES } from './constants';
import { extractCategory } from './extract-metadata';
import { cleanPatternText, findKnownPattern } from './extract-product';
import { normalizeTokenText } from './normalize';
import { IdentificationInput, IdentificationResult } from './types';

const wordOrSubstringMatch = (text: string, alias: string): boolean => {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (alias.length <= 4) {
    return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, 'i').test(text) || text.includes(alias);
  }
  return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, 'i').test(text) || text.includes(alias);
};

export const identifyTyre = (input: IdentificationInput): IdentificationResult => {
  const text = normalizeTokenText(`${input.description} ${input.rawText}`);
  const knownPattern = findKnownPattern(text);
  let brand: string | null = knownPattern?.brand ?? null;

  if (!brand) {
    const aliases = Object.entries(BRAND_ALIASES).sort((a, b) => b[0].length - a[0].length);
    const brandMatch = aliases.find(([alias]) => wordOrSubstringMatch(text, alias));
    brand = brandMatch?.[1] ?? null;
  }

  const pattern = knownPattern?.pattern ?? cleanPatternText(input.description || input.rawText, brand);
  const category = knownPattern?.category ?? extractCategory(text);
  const hasPattern = pattern.trim().length >= 2;
  const confidence = brand && hasPattern
    ? knownPattern ? 0.96 : 0.82
    : brand ? 0.55 : 0.2;

  return {
    brand,
    pattern: hasPattern ? pattern : null,
    category,
    confidence,
    source: knownPattern ? 'catalogue' : brand ? 'deterministic' : 'unresolved'
  };
};
