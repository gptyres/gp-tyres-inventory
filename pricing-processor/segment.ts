import { BRAND_ALIASES } from './constants';
import { extractPriceCandidates } from './extract-price';
import { findTyreSizeMatches } from './extract-size';
import { normalizeInput, normalizeTokenText } from './normalize';
import { PricingSegment } from './types';

const hasPrice = (input: string): boolean => /(?:R|ZAR)\s*\d/i.test(input);
const hasSize = (input: string): boolean => findTyreSizeMatches(input).length > 0;
const hasConcatenatedPriceRangeLine = (input: string): boolean => (
  input.split('\n').some((line) => (
    findTyreSizeMatches(line).length >= 1 &&
    (line.match(/(?:R|ZAR)\s*\d/gi) ?? []).length >= 2 &&
    !/(?:vat|tax)/i.test(line)
  ))
);

const knownBrandBoundaryPattern = (): RegExp => {
  const aliases = Object.keys(BRAND_ALIASES)
    .filter((alias) => alias.length >= 4)
    .sort((a, b) => b.length - a.length)
    .map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(${aliases.join('|')})`, 'gi');
};

const detectLayout = (text: string): PricingSegment['layout'] => {
  if (hasConcatenatedPriceRangeLine(text)) {
    return 'concatenated';
  }
  if (/\b(Brand|Category|Pricing|Notice)\s*:/i.test(text) || /\bunits?\s+in\s+stock\b/i.test(text)) {
    return 'card';
  }
  if (/\t|\||,/.test(text) || /\b\d+\s*(?:Hours?|Days?)\b/i.test(text)) {
    return 'table';
  }
  return 'mixed';
};

const splitConcatenated = (text: string): string[] => {
  const matches = findTyreSizeMatches(text);
  if (matches.length <= 1) return [text];

  const brandPattern = knownBrandBoundaryPattern();
  const starts = matches.map((match, index) => {
    if (index === 0) return 0;
    const previousPrice = extractPriceCandidates(text)
      .filter((candidate) => candidate.endIndex <= match.index)
      .at(-1);
    if (previousPrice) return previousPrice.endIndex;

    const previousEnd = matches[index - 1].endIndex;
    const slice = text.slice(previousEnd, match.index);
    const brandMatches = Array.from(slice.matchAll(brandPattern));
    const lastBrand = brandMatches.at(-1);
    return lastBrand?.index !== undefined ? previousEnd + lastBrand.index : match.index;
  });

  return starts.map((start, index) => text.slice(start, starts[index + 1] ?? text.length).trim()).filter(Boolean);
};

const splitBlocks = (text: string): string[] => (
  text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
);

const splitLineOriented = (text: string): string[] => {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const lineStartsRecord = hasSize(line) && current.length > 0 && hasPrice(current.join('\n'));
    const labelStartsRecord = /^Brand\s*:/i.test(line) && current.length > 0 && hasSize(current.join('\n')) && hasPrice(current.join('\n'));

    if (lineStartsRecord || labelStartsRecord) {
      blocks.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }

  if (current.length) blocks.push(current.join('\n'));

  return blocks.length ? blocks : [text];
};

export const segmentRecords = (input: string): PricingSegment[] => {
  const normalized = normalizeInput(input);
  if (!normalized) return [];

  const layout = detectLayout(normalized);
  let blocks: string[];

  if (layout === 'concatenated') {
    blocks = splitConcatenated(normalized);
  } else {
    const blankBlocks = splitBlocks(normalized);
    blocks = blankBlocks.length > 1 ? blankBlocks : splitLineOriented(normalized);
  }

  return blocks
    .flatMap((block) => {
      if (detectLayout(block) === 'concatenated') return splitConcatenated(block);
      return [block];
    })
    .map((block, index) => ({
      id: `record-${index + 1}`,
      text: block,
      layout: detectLayout(block)
    }))
    .filter((segment) => normalizeTokenText(segment.text).length > 0);
};
