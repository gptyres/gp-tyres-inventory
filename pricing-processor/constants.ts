import { PricingRules } from './types';

export const VAT_RATE = 0.15;
export const DEFAULT_SUPPLIER_PRICES_INCLUDE_VAT = false;
export const PRICING_SESSION_STORAGE_KEY = 'gp-quote-module-pricing-session';

export const DEFAULT_PRICING_RULES: PricingRules = {
  roundTo50: true,
  percentageMarkup: 0,
  fixedMarkup: 0,
  showCategory: true,
  showRating: false,
  showOemSpec: false,
  showStock: false,
  showLeadTime: false
};

export const PERCENTAGE_MARKUPS = [15, 20, 25, 30] as const;

export const BRAND_ALIASES: Record<string, string> = {
  APTANY: 'APTANY',
  ANNAITE: 'ANNAITE',
  APOLLO: 'APOLLO',
  BFGOODRICH: 'BF GOODRICH',
  'BF GOODRICH': 'BF GOODRICH',
  BRIDGESTONE: 'BRIDGESTONE',
  BS: 'BRIDGESTONE',
  COMPASAL: 'COMPASAL',
  CONTI: 'CONTINENTAL',
  CONTINENTAL: 'CONTINENTAL',
  DUN: 'DUNLOP',
  DUNLOP: 'DUNLOP',
  DURUN: 'DURUN',
  FIRESTONE: 'FIRESTONE',
  FALKEN: 'FALKEN',
  FRONWAY: 'FRONWAY',
  GENERAL: 'GENERAL TIRE',
  'GENERAL TIRE': 'GENERAL TIRE',
  GDY: 'GOODYEAR',
  GOODYEAR: 'GOODYEAR',
  HANKOOK: 'HANKOOK',
  HIFLY: 'HIFLY',
  KUMHO: 'KUMHO',
  LANDSAIL: 'LANDSAIL',
  LANVIGATOR: 'LANVIGATOR',
  LINGLONG: 'LINGLONG',
  MICH: 'MICHELIN',
  MICHELIN: 'MICHELIN',
  'MICKEY THOMPSON': 'MICKEY THOMPSON',
  OVATION: 'OVATION',
  PATRIOT: 'PATRIOT',
  PIR: 'PIRELLI',
  PIRELLI: 'PIRELLI',
  RADAR: 'RADAR',
  ROADKING: 'ROADKING',
  ROVELO: 'ROVELO',
  'ROYAL BLACK': 'ROYAL BLACK',
  SAILUN: 'SAILUN',
  DEESTONE: 'DEESTONE',
  TERRAFIRMA: 'TERRAFIRMA',
  TOMKET: 'TOMKET',
  TOYO: 'TOYO',
  TRACMAX: 'TRACMAX',
  VITOUR: 'VITOUR',
  WINDFORCE: 'WINDFORCE',
  YOKOHAMA: 'YOKOHAMA'
};

export const PATTERN_ALIASES: Record<string, { pattern: string; brand?: string; category?: string }> = {
  AT3G: { pattern: 'GRANDTREK AT3G', brand: 'DUNLOP', category: 'AT' },
  'GRANDTREK AT3G': { pattern: 'GRANDTREK AT3G', brand: 'DUNLOP', category: 'AT' },
  CSC3: { pattern: 'CONTISPORTCONTACT 3', brand: 'CONTINENTAL' },
  'CONTISPORTCONTACT 3': { pattern: 'CONTISPORTCONTACT 3', brand: 'CONTINENTAL' },
  CONTISPORTCONTACT: { pattern: 'CONTISPORTCONTACT 3', brand: 'CONTINENTAL' },
  'EFFIGRIP PERF': { pattern: 'EFFICIENTGRIP PERFORMANCE', brand: 'GOODYEAR' },
  'EFFICIENTGRIP PERFORMANCE': { pattern: 'EFFICIENTGRIP PERFORMANCE', brand: 'GOODYEAR' },
  'PS 5': { pattern: 'PILOT SPORT 5', brand: 'MICHELIN' },
  'PILOT SPORT 5': { pattern: 'PILOT SPORT 5', brand: 'MICHELIN' },
  P7CINT: { pattern: 'CINTURATO P7', brand: 'PIRELLI' },
  'CINTURATO P7': { pattern: 'CINTURATO P7', brand: 'PIRELLI' },
  'DMAX SPRINT': { pattern: 'DMAX SPRINT' },
  RPX800: { pattern: 'RPX 800' },
  'RPX 800': { pattern: 'RPX 800' },
  LS388: { pattern: 'LS388', brand: 'LANDSAIL', category: 'PASSENGER' },
  RU149Y: { pattern: 'RU149Y R/T', brand: 'APTANY', category: 'RT' },
  'RU149Y R/T': { pattern: 'RU149Y R/T', brand: 'APTANY', category: 'RT' },
  'DUELLER D693': { pattern: 'DUELLER D693', brand: 'BRIDGESTONE', category: 'AT' },
  D693: { pattern: 'DUELLER D693', brand: 'BRIDGESTONE', category: 'AT' },
  'RENEGADE RT': { pattern: 'RENEGADE RT+', brand: 'RADAR', category: 'RT' },
  'RENEGADE RT+': { pattern: 'RENEGADE RT+', brand: 'RADAR', category: 'RT' },
  'PRIMACY SUV': { pattern: 'PRIMACY SUV+', brand: 'MICHELIN', category: 'SUV / 4X4' },
  'PRIMACY SUV+': { pattern: 'PRIMACY SUV+', brand: 'MICHELIN', category: 'SUV / 4X4' },
  SCORPION: { pattern: 'SCORPION', brand: 'PIRELLI', category: 'SUV / 4X4' }
};

export const CATEGORY_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(ALL TERRAIN|A\/T|AT\b|GRANDTREK|DUELLER)\b/i, 'AT'],
  [/\b(MUD TERRAIN|M\/T|MT\b)\b/i, 'MT'],
  [/\b(RUGGED TERRAIN|R\/T|RT\b)\b/i, 'RT'],
  [/\b(EXTREME TERRAIN|X\/T|XT\b)\b/i, 'XT'],
  [/\b(HIGHWAY TERRAIN|H\/T|HT\b)\b/i, 'HT'],
  [/\b(PASSENGER CAR RADIAL|PASSENGER)\b/i, 'PASSENGER'],
  [/\b(COMMERCIAL|VAN|CARGO)\b/i, 'COMMERCIAL'],
  [/\b(SUV|4X4|4WD)\b/i, 'SUV / 4X4'],
  [/\b(TRUCK|BUS|TBR)\b/i, 'TRUCK / BUS'],
  [/\b(MOTORCYCLE|MOTO)\b/i, 'MOTORCYCLE'],
  [/\b(RFT|ROF|RUN FLAT|RUN-FLAT)\b/i, 'RUN-FLAT'],
  [/\b(WINTER|SNOW)\b/i, 'WINTER']
];

export const OEM_MARKERS = ['MO1', 'MO', 'AO1', 'AO', 'RO1', 'RO2', 'N0', 'N1', 'N2', 'N3', 'N4', 'JLR', 'LR', 'J', 'MGT', 'VOL', 'T0', 'T1'];

export const SUPPLIER_HINTS = [
  'APEX TYRES',
  'ARC',
  'EXOTIC',
  'EXCLUSIVE TYRES',
  'SAILUN',
  'TYREWAREHOUSE',
  'TYRE WAREHOUSE',
  'ATT',
  'TREADS UNLIMITED',
  'TYRE LIFE',
  'CAPE TOWN',
  'JOHANNESBURG',
  'DURBAN',
  'WC',
  'JHB'
];
