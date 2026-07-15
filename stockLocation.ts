const LOCATION_ALIASES: Record<string, string> = {
  jhb: 'JHB',
  johannesburg: 'Johannesburg',
  cpt: 'CPT',
  capetown: 'Cape Town',
  dbn: 'DBN',
  durban: 'Durban',
  glk: 'GLK',
  bfn: 'BFN',
  bloemfontein: 'Bloemfontein',
  nwh: 'NWH',
  jetpark: 'Jet Park',
  portelizabeth: 'Port Elizabeth',
  durbancdc: 'Durban CDC',
  eastport: 'Eastport',
  ladysmith: 'Ladysmith',
  regional: 'Regional',
  national: 'National',
  inboundtocapetown: 'Inbound to Cape Town'
};

const locationKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

export const normalizeStockLocationName = (value: string): string => {
  const cleaned = value
    .replace(/^tread\s*zone\s+/i, '')
    .replace(/^ewt\s*-\s*cape town\s*-\s*cape town$/i, 'Cape Town')
    .replace(/^exotic wheel and tyre\s*-\s*johannesburg$/i, 'Johannesburg')
    .replace(/\s+/g, ' ')
    .trim();
  return LOCATION_ALIASES[locationKey(cleaned)] || cleaned;
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
  'jhb', 'johannesburg', 'cpt', 'capetown', 'dbn', 'durban', 'glk',
  'bfn', 'bloemfontein', 'nwh', 'jetpark', 'portelizabeth', 'durbancdc',
  'eastport', 'ladysmith', 'inboundtocapetown', 'regional', 'national'
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
