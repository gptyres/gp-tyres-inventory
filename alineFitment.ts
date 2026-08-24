import { ALINE_VEHICLE_FITMENTS } from './supplier_data/alineFitmentData';

const SOURCE_DETAIL_FITMENT = /(?:^|\|)\s*Vehicle fitment:\s*([^|]+)/i;

const FITMENT_BRAND_ALIASES: Array<[RegExp, string]> = [
  [/\bToy(?=\s|[A-Z0-9]|$)/g, 'Toyota'],
  [/\bNis(?=\s|[A-Z0-9]|$)/g, 'Nissan'],
  [/\bVw(?=\s|[A-Z0-9]|$)/g, 'Volkswagen'],
  [/\bHyun?(?=\s|[A-Z0-9]|$)/g, 'Hyundai'],
  [/\bHon(?=\s|[A-Z0-9]|$)/g, 'Honda'],
  [/\bChev(?=\s|[A-Z0-9]|$)/g, 'Chevrolet'],
  [/\bMaz(?=\s|[A-Z0-9]|$)/g, 'Mazda'],
  [/\bMit(?=\s|[A-Z0-9]|$)/g, 'Mitsubishi'],
  [/\bRen(?=\s|[A-Z0-9]|$)/g, 'Renault'],
  [/\bSuz(?=\s|[A-Z0-9]|$)/g, 'Suzuki'],
  [/\bSub(?=\s|[A-Z0-9]|$)/g, 'Subaru'],
  [/\b(?:Peu|Peo)(?=\s|[A-Z0-9]|$)/g, 'Peugeot']
];

const cleanFitment = (value: string | undefined | null): string => (
  String(value || '')
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
);

export const getAlineVehicleFitments = (
  supplierSku: string,
  sourceStockDetail?: string | null
): string | undefined => {
  const embedded = cleanFitment(sourceStockDetail?.match(SOURCE_DETAIL_FITMENT)?.[1]);
  if (embedded) return embedded;
  return cleanFitment(ALINE_VEHICLE_FITMENTS[String(supplierSku || '').trim()]) || undefined;
};

export const expandWheelFitmentSearchText = (value: string): string => (
  FITMENT_BRAND_ALIASES.reduce(
    (expanded, [pattern, replacement]) => expanded.replace(pattern, replacement),
    cleanFitment(value)
  )
);
