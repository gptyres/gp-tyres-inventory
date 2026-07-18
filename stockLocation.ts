const LOCATION_ALIASES: Record<string, string> = {
  jhb: 'JHB',
  johannesburg: 'JHB',
  cpt: 'CPT',
  capetown: 'CPT',
  dbn: 'DUR',
  dur: 'DUR',
  durban: 'DUR',
  glk: 'GLK',
  bfn: 'BFN',
  bloemfontein: 'BFN',
  nwh: 'NWH',
  jetpark: 'JHB',
  plz: 'PLZ',
  portelizabeth: 'PLZ',
  durbancdc: 'DUR',
  eastport: 'JHB',
  ladysmith: 'DUR',
  regional: 'REG',
  national: 'NAT'
};

const locationKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
const NON_AVAILABLE_LOCATIONS = new Set(['inboundtocapetown', 'nostocklisted']);

export const normalizeStockLocationName = (value: string): string => {
  const cleaned = value
    .replace(/^tread\s*zone\s+/i, '')
    .replace(/^ewt\s*-\s*cape town\s*-\s*cape town$/i, 'Cape Town')
    .replace(/^exotic wheel and tyre\s*-\s*johannesburg$/i, 'Johannesburg')
    .replace(/\s+/g, ' ')
    .trim();
  const key = locationKey(cleaned);
  if (NON_AVAILABLE_LOCATIONS.has(key)) return '';
  return LOCATION_ALIASES[key] || cleaned;
};

export const normalizeStockByLocation = (
  stock: Record<string, number> | null | undefined
): Record<string, number> => Object.entries(stock || {}).reduce<Record<string, number>>(
  (normalized, [rawLocation, rawQuantity]) => {
    const location = normalizeStockLocationName(rawLocation);
    if (!location) return normalized;
    const quantity = Math.max(0, Math.trunc(Number(rawQuantity) || 0));
    normalized[location] = (normalized[location] || 0) + quantity;
    return normalized;
  },
  {}
);

export const parseStockLocationSummary = (value: string | null | undefined): Record<string, number> => {
  if (!value) return {};
  const parsed: Record<string, number> = {};
  value.split('|').forEach((segment) => {
    const match = segment.trim().match(/^(.+?)\s*:\s*(-?[\d,]+)\s*(?:units?)?$/i);
    if (!match) return;
    const location = normalizeStockLocationName(match[1]);
    const quantity = Math.max(0, Math.trunc(Number(match[2].replace(/,/g, '')) || 0));
    if (location) parsed[location] = (parsed[location] || 0) + quantity;
  });
  return parsed;
};

const LOCATION_ORDER = [
  'jhb', 'cpt', 'dur', 'plz', 'glk', 'bfn', 'nwh', 'reg', 'nat'
];

export const sortStockLocationEntries = (
  stock: Record<string, number>
): Array<[string, number]> => Object.entries(stock).sort(([left], [right]) => {
  const leftIndex = LOCATION_ORDER.indexOf(locationKey(left));
  const rightIndex = LOCATION_ORDER.indexOf(locationKey(right));
  if (leftIndex !== -1 || rightIndex !== -1) {
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  }
  return left.localeCompare(right);
});
