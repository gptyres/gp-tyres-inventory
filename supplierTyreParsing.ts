export interface SupplierTyreFieldInput {
  description?: string | null;
  explicitSize?: string | null;
  explicitBrand?: string | null;
  explicitPattern?: string | null;
  explicitRating?: string | null;
  explicitIndex?: string | null;
  explicitSpecs?: string | null;
  inferBrandFromDescription?: boolean;
}

export interface SupplierTyreFields {
  size: string;
  brand: string;
  pattern: string;
  rating: string;
  index: string;
  specs: string;
}

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const MISSING_VALUE = /^(?:-|n\/?a|none|null|unknown|standard)$/i;
const cleanOptional = (value: unknown) => {
  const normalized = clean(value);
  return MISSING_VALUE.test(normalized) ? '' : normalized;
};
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Covers passenger, 4x4, light-truck, and commercial sizes, including 10.00R20.
const TYRE_SIZE_PATTERN = /\b(?:\d{2,3}\/\d{2,3}(?:ZR|RF|R)\d{2}(?:\.\d)?(?:LT)?|\d{2,3}X\d{1,2}(?:\.\d+)?(?:R|-)\d{2}(?:\.\d)?(?:LT)?|\d{1,3}(?:\.\d{1,2})?R\d{2}(?:\.\d)?|\d{3}-\d{2}(?:\.\d)?)\b/i;
const TYRE_RATING_PATTERN = /\b\d{1,2}\s*(?:PR|PLY)\b/gi;
const TYRE_INDEX_PATTERN = /\b\d{2,3}(?:\s*\/\s*\d{2,3})?\s*(?:A[1-8]|[A-Z])\b/gi;
const TYRE_SPEC_PATTERN = /(?:^|\s)(M\+S|M\/S|R\/B|A\/T|M\/T|H\/T|R\/T|TLR|TL|TT|RFT|RUN\s*FLAT|RUNFLAT|XL|RF|OWL|RWL|BSW|WSW)(?=\s|$)/gi;

const normalizeSize = (value: string) => clean(value)
  .replace(/\s+/g, '')
  .replace(/\u00d7/g, 'X')
  .toUpperCase();

export const extractSupplierTyreSize = (value: string) => {
  const normalized = clean(value)
    .replace(/\u00d7/g, 'X')
    .replace(/(\d)\s*\/\s*(\d)/g, '$1/$2')
    .replace(/(\d)\s*(ZR|RF|R)\s*(\d)/gi, '$1$2$3')
    .replace(/(\d)\s*[Xx]\s*(\d)/g, '$1X$2')
    .toUpperCase();
  return normalized.match(TYRE_SIZE_PATTERN)?.[0]?.toUpperCase() || '';
};

const stripBrandPrefix = (value: string, brand: string) => {
  if (!brand) return value;
  return value.replace(new RegExp(`^${escapeRegExp(brand)}(?:\\s+|\\s*[-/|:]\\s*)`, 'i'), '').trim();
};

const removeFirstText = (value: string, target: string) => {
  if (!target) return value;
  return value.replace(new RegExp(escapeRegExp(target), 'i'), ' ');
};

const cleanRemainder = (value: string) => value
  .replace(/\s+/g, ' ')
  .replace(/^\s*[-/|,:;]+\s*|\s*[-/|,:;]+\s*$/g, '')
  .replace(/\s+([,;])/g, '$1')
  .trim();

const uniqueParts = (parts: string[]) => {
  const seen = new Set<string>();
  return parts.map(cleanOptional).filter((part) => {
    const key = part.toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const collectAndRemove = (
  value: string,
  pattern: RegExp,
  normalize: (match: string) => string
) => {
  const matches: string[] = [];
  const remainder = value.replace(pattern, (match) => {
    matches.push(normalize(clean(match)));
    return ' ';
  });
  return { matches: uniqueParts(matches), remainder };
};

const repairSplitCommercialSize = (size: string, description: string) => {
  const incomplete = size.match(/^00R(\d{2}(?:\.\d)?)$/i);
  const leading = description.match(/^(\d{1,2})\.\s+/);
  if (!incomplete || !leading) return { size, description };
  return {
    size: `${leading[1]}.00R${incomplete[1]}`.toUpperCase(),
    description: description.slice(leading[0].length).trim()
  };
};

const classifyExplicitRatingAndIndex = (ratingValue: string, indexValue: string) => {
  const ratingParts: string[] = [];
  const indexParts: string[] = [];
  [ratingValue, indexValue].filter(Boolean).forEach((value) => {
    const ratingMatches = value.match(TYRE_RATING_PATTERN) || [];
    const indexMatches = value.match(TYRE_INDEX_PATTERN) || [];
    ratingParts.push(...ratingMatches.map((part) => part.replace(/\s+/g, '').replace(/PLY$/i, 'PR').toUpperCase()));
    indexParts.push(...indexMatches.map((part) => part.replace(/\s+/g, '').toUpperCase()));
  });
  return { ratings: uniqueParts(ratingParts), indexes: uniqueParts(indexParts) };
};

export const parseSupplierTyreFields = (input: SupplierTyreFieldInput): SupplierTyreFields => {
  const description = clean(input.description);
  const explicitBrand = cleanOptional(input.explicitBrand);
  let working = description;
  let size = normalizeSize(cleanOptional(input.explicitSize)) || extractSupplierTyreSize(working);
  const embeddedSize = extractSupplierTyreSize(working);
  if (!size && embeddedSize) size = embeddedSize;
  working = cleanRemainder(removeFirstText(working, embeddedSize || size));
  working = working.replace(/^(?:(?:unknown|standard|n\/?a|none|null)\s*)+/i, '').trim();

  const inferredBrand = working.match(/^([A-Z0-9][A-Z0-9&.'-]*)(?:\s+|$)/i)?.[1] || '';
  const brand = explicitBrand || (input.inferBrandFromDescription ? inferredBrand : '') || '';
  working = stripBrandPrefix(working, brand);

  const repaired = repairSplitCommercialSize(size, working);
  size = repaired.size;
  working = repaired.description;
  working = stripBrandPrefix(cleanRemainder(working), brand);

  const explicit = classifyExplicitRatingAndIndex(
    cleanOptional(input.explicitRating),
    cleanOptional(input.explicitIndex)
  );
  const parsedRating = collectAndRemove(
    working,
    TYRE_RATING_PATTERN,
    (part) => part.replace(/\s+/g, '').replace(/PLY$/i, 'PR').toUpperCase()
  );
  const parsedIndex = collectAndRemove(
    parsedRating.remainder,
    TYRE_INDEX_PATTERN,
    (part) => part.replace(/\s+/g, '').toUpperCase()
  );
  const parsedSpecs = collectAndRemove(
    parsedIndex.remainder,
    TYRE_SPEC_PATTERN,
    (part) => part.toUpperCase().replace(/RUN\s*FLAT/, 'RUNFLAT')
  );

  const explicitPattern = cleanOptional(input.explicitPattern);
  const withoutExplicitPattern = explicitPattern
    ? removeFirstText(parsedSpecs.remainder, explicitPattern)
    : parsedSpecs.remainder;
  const pattern = explicitPattern || cleanOptional(cleanRemainder(parsedSpecs.remainder));
  const looseSpecs = cleanRemainder(withoutExplicitPattern);
  const specs = uniqueParts([
    cleanOptional(input.explicitSpecs),
    ...parsedSpecs.matches,
    ...(explicitPattern && looseSpecs ? [looseSpecs] : [])
  ]).join(' / ');

  return {
    size,
    brand,
    pattern,
    rating: uniqueParts([...explicit.ratings, ...parsedRating.matches]).join(' / '),
    index: uniqueParts([...explicit.indexes, ...parsedIndex.matches]).join(' / '),
    specs
  };
};

export const buildTyreIndexDisplay = (rating: string, index: string) => (
  uniqueParts([rating, index]).join(' / ')
);
