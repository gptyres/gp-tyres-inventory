import { DEFAULT_SUPPLIER_PRICES_INCLUDE_VAT } from './constants';
import { PriceCandidate, PriceExtraction } from './types';

export const PRICE_PATTERN = /(?:R|ZAR)\s*[-+]?\d[\d\s,.]*/gi;

const LABELS = [
  'Discounted Price',
  'Your Price',
  'Net Price',
  'Special Price',
  'Dealer Price',
  'Cost Price',
  'Selling Price',
  'Price'
];

export const parsePrice = (input: string): number | null => {
  let value = input
    .replace(/\b(?:R|ZAR)\b/gi, '')
    .replace(/[^\d,.\-]/g, '');

  if (!/\d/.test(value) || /^-/.test(value)) return null;

  if (value.includes(',') && value.includes('.')) {
    value = value.replace(/,/g, '');
  } else if (value.includes(',')) {
    const decimalPart = value.slice(value.lastIndexOf(',') + 1);
    value = decimalPart.length === 2
      ? value.replace(/\./g, '').replace(',', '.')
      : value.replace(/,/g, '');
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
};

const isInsideVatParentheses = (text: string, index: number, endIndex: number): boolean => {
  const open = text.lastIndexOf('(', index);
  const close = text.indexOf(')', index);
  if (open === -1 || close === -1 || close < endIndex) return false;
  const context = text.slice(Math.max(0, open - 40), close + 1);
  return /(?:vat|tax)/i.test(context);
};

const detectLabel = (text: string, index: number): string | null => {
  const before = text.slice(Math.max(0, index - 60), index);
  for (const label of LABELS) {
    const labelPattern = new RegExp(`${label.replace(/\s+/g, '\\s+')}\\s*[:\\-]?\\s*$`, 'i');
    if (labelPattern.test(before)) return label;
  }
  return null;
};

export const extractPriceCandidates = (input: string): PriceCandidate[] => {
  const candidates: PriceCandidate[] = [];
  PRICE_PATTERN.lastIndex = 0;

  for (const match of input.matchAll(PRICE_PATTERN)) {
    if (match.index === undefined) continue;
    const value = parsePrice(match[0]);
    if (value === null) continue;
    const endIndex = match.index + match[0].length;
    candidates.push({
      raw: match[0],
      value,
      index: match.index,
      endIndex,
      label: detectLabel(input, match.index),
      isVatAmount: isInsideVatParentheses(input, match.index, endIndex)
    });
  }

  return candidates;
};

export const detectVatState = (input: string): boolean | null => {
  const lower = input.toLowerCase();
  const excluding = /\b(excl(?:uding)?\s*(?:15%\s*)?(?:vat|tax)|vat\s*exclusive|prices?\s+are\s+excluding\s+vat)\b/.test(lower);
  const including = /\b(incl(?:uding)?\s*(?:15%\s*)?(?:vat|tax)|vat\s*included|prices?\s+include\s+vat)\b/.test(lower);

  if (excluding && including) return null;
  if (excluding) return false;
  if (including) return true;
  return DEFAULT_SUPPLIER_PRICES_INCLUDE_VAT;
};

const selectLabelledCandidate = (candidates: PriceCandidate[]): PriceCandidate | null => {
  for (const label of LABELS) {
    const match = candidates.find((candidate) => candidate.label?.toLowerCase() === label.toLowerCase());
    if (match) return match;
  }
  return null;
};

const hasPriceRangeSignal = (input: string): boolean => (
  /\b(price\s*from|from\s*:|price\s*to|to\s*:)\b/i.test(input)
);

export const extractPriceData = (input: string, isConcatenated = false): PriceExtraction => {
  const candidates = extractPriceCandidates(input);
  const mainCandidates = candidates.filter((candidate) => !candidate.isVatAmount);
  const issues: string[] = [];
  const vatIncluded = detectVatState(input);

  if (candidates.some((candidate) => candidate.isVatAmount)) {
    issues.push('VAT amount in brackets was excluded from pricing.');
  }

  if (mainCandidates.length === 0) {
    return {
      basePrice: null,
      priceFrom: null,
      priceTo: null,
      selectedPrice: null,
      vatIncluded,
      priceIsFinalSellingPrice: false,
      candidates,
      issues
    };
  }

  const labelled = selectLabelledCandidate(mainCandidates);
  if (labelled) {
    return {
      basePrice: labelled.value,
      priceFrom: null,
      priceTo: null,
      selectedPrice: labelled.value,
      vatIncluded,
      priceIsFinalSellingPrice: false,
      candidates,
      issues
    };
  }

  const rangeCandidates = mainCandidates.filter((candidate) => candidate.value >= 100);
  if ((isConcatenated || hasPriceRangeSignal(input)) && rangeCandidates.length >= 2 && !/(?:vat|tax)/i.test(input)) {
    const priceFrom = rangeCandidates[0].value;
    const priceTo = rangeCandidates[1].value;
    return {
      basePrice: null,
      priceFrom,
      priceTo,
      selectedPrice: priceTo,
      vatIncluded: true,
      priceIsFinalSellingPrice: true,
      candidates,
      issues
    };
  }

  const selected = mainCandidates[mainCandidates.length - 1];
  if (mainCandidates.length > 1) {
    issues.push('Multiple Rand values were detected; selected the last main supplier price.');
  }

  return {
    basePrice: selected.value,
    priceFrom: null,
    priceTo: null,
    selectedPrice: selected.value,
    vatIncluded,
    priceIsFinalSellingPrice: false,
    candidates,
    issues
  };
};
