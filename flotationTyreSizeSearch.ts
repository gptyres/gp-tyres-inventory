export interface FlotationTyreSizeComponents {
  diameter: number;
  widthHundredths: number;
  rim: number;
}

export interface FlotationTyreSizeQuery extends FlotationTyreSizeComponents {
  rawSize: string;
  displaySize: string;
  compactKeys: string[];
  remainingQuery: string;
}

const MIN_DIAMETER = 20;
const MAX_DIAMETER = 99;
const MIN_WIDTH_HUNDREDTHS = 500;
const MAX_WIDTH_HUNDREDTHS = 3000;
const MIN_RIM = 8;
const MAX_RIM = 30;
const MIN_COMPACT_DIAMETER = 29;
const MIN_COMPACT_WIDTH_HUNDREDTHS = 700;
const EXPLICIT_FLOTATION_PATTERN = /\b(\d{2})\s*(?:X|×|\*|\/|-|\s)\s*(\d{1,2}(?:\.\d{1,2})?)\s*(?:R|X|×|\*|\/|-|\s)\s*(\d{2})(?:LT)?\b/i;
const COMPACT_FLOTATION_PATTERN = /\b\d{5,8}\b/g;

const isValidComponents = ({ diameter, widthHundredths, rim }: FlotationTyreSizeComponents) => (
  Number.isInteger(diameter)
  && diameter >= MIN_DIAMETER
  && diameter <= MAX_DIAMETER
  && Number.isInteger(widthHundredths)
  && widthHundredths >= MIN_WIDTH_HUNDREDTHS
  && widthHundredths <= MAX_WIDTH_HUNDREDTHS
  && Number.isInteger(rim)
  && rim >= MIN_RIM
  && rim <= MAX_RIM
);

const formatWidth = (widthHundredths: number) => (widthHundredths / 100).toFixed(2);

const compactWidthKeys = (widthHundredths: number): string[] => {
  const fixedWidth = String(widthHundredths);
  const shortenedWidth = widthHundredths % 100 === 0
    ? String(widthHundredths / 100)
    : widthHundredths % 10 === 0
      ? String(widthHundredths / 10)
      : fixedWidth;
  return [...new Set([fixedWidth, shortenedWidth])];
};

export const buildFlotationCompactKeys = (components: FlotationTyreSizeComponents): string[] => (
  compactWidthKeys(components.widthHundredths)
    .map((width) => `${components.diameter}${width}${components.rim}`)
);

export const formatFlotationTyreSize = (components: FlotationTyreSizeComponents): string => (
  `${components.diameter}x${formatWidth(components.widthHundredths)}R${components.rim}`
);

const buildComponents = (diameterValue: string, widthValue: string, rimValue: string) => {
  const components = {
    diameter: Number.parseInt(diameterValue, 10),
    widthHundredths: Math.round(Number.parseFloat(widthValue) * 100),
    rim: Number.parseInt(rimValue, 10)
  };
  return isValidComponents(components) ? components : null;
};

const compactWidthCandidates = (digits: string): number[] => {
  const value = Number.parseInt(digits, 10);
  if (!Number.isFinite(value)) return [];

  return [...new Set([
    value * 100,
    value * 10,
    value
  ])].filter((widthHundredths) => (
    widthHundredths >= MIN_WIDTH_HUNDREDTHS
    && widthHundredths <= MAX_WIDTH_HUNDREDTHS
  ));
};

const parseCompactToken = (token: string): FlotationTyreSizeComponents | null => {
  if (!/^\d{5,8}$/.test(token)) return null;

  const diameter = Number.parseInt(token.slice(0, 2), 10);
  const rim = Number.parseInt(token.slice(-2), 10);
  const widthDigits = token.slice(2, -2);
  const matches = compactWidthCandidates(widthDigits)
    .map((widthHundredths) => ({ diameter, widthHundredths, rim }))
    .filter((components) => (
      isValidComponents(components)
      && components.diameter >= MIN_COMPACT_DIAMETER
      && components.widthHundredths >= MIN_COMPACT_WIDTH_HUNDREDTHS
    ));

  return matches.length === 1 ? matches[0] : null;
};

const removeMatchedSize = (query: string, index: number, length: number) => (
  `${query.slice(0, index)} ${query.slice(index + length)}`.replace(/\s+/g, ' ').trim()
);

const buildQuery = (
  query: string,
  rawSize: string,
  index: number,
  components: FlotationTyreSizeComponents
): FlotationTyreSizeQuery => ({
  ...components,
  rawSize,
  displaySize: formatFlotationTyreSize(components),
  compactKeys: buildFlotationCompactKeys(components),
  remainingQuery: removeMatchedSize(query, index, rawSize.length)
});

export const extractFlotationTyreSizeQuery = (query: string): FlotationTyreSizeQuery | null => {
  if (!query.trim()) return null;

  const explicitMatch = EXPLICIT_FLOTATION_PATTERN.exec(query);
  if (explicitMatch) {
    const components = buildComponents(explicitMatch[1], explicitMatch[2], explicitMatch[3]);
    if (components) return buildQuery(query, explicitMatch[0], explicitMatch.index, components);
  }

  for (const compactMatch of query.matchAll(COMPACT_FLOTATION_PATTERN)) {
    const components = parseCompactToken(compactMatch[0]);
    if (components) {
      return buildQuery(query, compactMatch[0], compactMatch.index ?? 0, components);
    }
  }

  return null;
};

export const parseFlotationTyreSize = (value: string): FlotationTyreSizeComponents | null => {
  const parsed = extractFlotationTyreSizeQuery(value);
  return parsed
    ? {
        diameter: parsed.diameter,
        widthHundredths: parsed.widthHundredths,
        rim: parsed.rim
      }
    : null;
};

export const flotationTyreSizesEqual = (
  left: FlotationTyreSizeComponents,
  right: FlotationTyreSizeComponents
) => (
  left.diameter === right.diameter
  && left.widthHundredths === right.widthHundredths
  && left.rim === right.rim
);

export const getNoExactFlotationStockMessage = (query: FlotationTyreSizeQuery): string => (
  `No exact stock match found for ${query.displaySize}.`
);
