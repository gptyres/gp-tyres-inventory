import { normalizeTokenText } from './normalize';

export interface TyreSizeMatch {
  raw: string;
  normalized: string;
  index: number;
  endIndex: number;
}

const sizePatterns: RegExp[] = [
  /(?<!\d)(\d{3})\s*\/\s*(\d{2})\s*(?:ZR|R|-|\/)?\s*(\d{2}(?:\.5)?)(C)?/gi,
  /(?<!\d)(\d{2,3})\s*\/\s*(\d{2,3})\s*(?:ZR|R|-)\s*(\d{2})(C)?\b/gi,
  /(?<!\d)(\d{3})\s*R\s*(\d{2}(?:\.5)?)(C)?\b/gi,
  /(?<!\d)(\d{2})\s*[xX]\s*(\d{1,2}(?:\.\d{1,2})?)\s*R\s*(\d{2})\b/gi,
  /(?<!\d)([1-3]\d{2})([2-9]\d)(1[0-9]|2[0-9])\b/gi
];

export const normalizeTyreSize = (input: string): string | null => {
  const text = normalizeTokenText(input);

  const passenger = text.match(/\b(\d{3})\s*\/\s*(\d{2})\s*(?:ZR|R|-|\/)?\s*(\d{2}(?:\.5)?)(C)?/i);
  if (passenger) {
    return `${passenger[1]}/${passenger[2]}R${passenger[3]}${passenger[4] ? 'C' : ''}`;
  }

  const motorcycle = text.match(/\b(\d{2,3})\s*\/\s*(\d{2,3})\s*(?:ZR|R|-)\s*(\d{2})(C)?\b/i);
  if (motorcycle) {
    return `${motorcycle[1]}/${motorcycle[2]}R${motorcycle[3]}${motorcycle[4] ? 'C' : ''}`;
  }

  const commercial = text.match(/\b(\d{3})\s*R\s*(\d{2}(?:\.5)?)(C)?\b/i);
  if (commercial) {
    return `${commercial[1]}R${commercial[2]}${commercial[3] ? 'C' : ''}`;
  }

  const flotation = text.match(/\b(\d{2})\s*X\s*(\d{1,2}(?:\.\d{1,2})?)\s*R\s*(\d{2})\b/i);
  if (flotation) {
    return `${flotation[1]}X${flotation[2]}R${flotation[3]}`;
  }

  const compact = text.match(/\b([1-3]\d{2})([2-9]\d)(1[0-9]|2[0-9])\b/i);
  if (compact) {
    return `${compact[1]}/${compact[2]}R${compact[3]}`;
  }

  return null;
};

export const extractTyreSize = (input: string): string | null => {
  const matches = findTyreSizeMatches(input);
  return matches[0]?.normalized ?? null;
};

export const findTyreSizeMatches = (input: string): TyreSizeMatch[] => {
  const matches: TyreSizeMatch[] = [];

  for (const pattern of sizePatterns) {
    pattern.lastIndex = 0;
    for (const match of input.matchAll(pattern)) {
      if (match.index === undefined) continue;
      const raw = match[0];
      const normalized = normalizeTyreSize(raw);
      if (!normalized) continue;
      matches.push({
        raw,
        normalized,
        index: match.index,
        endIndex: match.index + raw.length
      });
    }
  }

  return matches
    .sort((a, b) => a.index - b.index || b.raw.length - a.raw.length)
    .filter((match, index, all) => !all.some((other, otherIndex) => (
      otherIndex < index &&
      match.index >= other.index &&
      match.endIndex <= other.endIndex
    )));
};

export const canonicalSizeKey = (size: string | null): string => (
  (size ?? '').toUpperCase().replace(/[^A-Z0-9.]/g, '')
);
