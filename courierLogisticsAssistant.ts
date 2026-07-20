export type CourierItemType = 'WHEEL_ONLY' | 'WHEEL_AND_TYRE' | 'TYRE_ONLY';

export interface WheelSize {
  diameterInches: number;
  widthInches: number;
}

export interface TyreSize {
  kind: 'METRIC' | 'IMPERIAL';
  overallDiameterCm: number;
  sectionWidthCm: number;
  display: string;
}

export interface CourierEstimateInput {
  itemType: CourierItemType;
  quantity: number;
  wheelSize?: WheelSize | null;
  tyreSize?: TyreSize | null;
  paddingCm?: number;
  volumetricDivisor?: number;
  actualWeightKgOverride?: number | null;
}

export interface CourierEstimate {
  dimensionsCm: { length: number; width: number; height: number };
  estimatedActualWeightKg: number;
  volumetricWeightKg: number;
  chargeableWeightKg: number;
  totalActualWeightKg: number;
  totalVolumetricWeightKg: number;
  totalChargeableWeightKg: number;
  description: string;
  calculationNote: string;
}

export interface ParsedCourierSpecs {
  wheelSize: WheelSize | null;
  tyreSize: TyreSize | null;
  hasTyres: boolean;
}

const CM_PER_INCH = 2.54;

const ceilPositive = (value: number) => Math.max(1, Math.ceil(value));
const cleanNumber = (value: number | undefined | null, fallback: number) => (
  Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback
);

/** Parses common wheel notation such as 19x9.5J or 18 x 8.5. */
export const parseWheelSize = (value: string): WheelSize | null => {
  const match = String(value || '').match(/(\d{2}(?:\.\d+)?)\s*(?:x|×)\s*(\d{1,2}(?:\.\d+)?)\s*j?/i);
  if (!match) return null;

  const diameterInches = Number(match[1]);
  const widthInches = Number(match[2]);
  if (!Number.isFinite(diameterInches) || !Number.isFinite(widthInches)) return null;
  return { diameterInches, widthInches };
};

/** Parses metric (225/40R18) and imperial (35/12.5R20) tyre sizes. */
export const parseTyreSize = (value: string): TyreSize | null => {
  const normalized = String(value || '').toUpperCase().replace(/\s+/g, '');
  const metric = normalized.match(/(\d{3})[\/-](\d{2,3})(?:R|[\/-])(\d{2})/);
  if (metric) {
    const sectionWidthMm = Number(metric[1]);
    const aspectRatio = Number(metric[2]);
    const rimDiameterInches = Number(metric[3]);
    const sidewallCm = (sectionWidthMm * (aspectRatio / 100)) / 10;
    return {
      kind: 'METRIC',
      overallDiameterCm: (rimDiameterInches * CM_PER_INCH) + (sidewallCm * 2),
      sectionWidthCm: sectionWidthMm / 10,
      display: `${sectionWidthMm}/${aspectRatio}R${rimDiameterInches}`
    };
  }

  const imperial = normalized.match(/(\d{2}(?:\.\d+)?)[\/-](\d{1,2}(?:\.\d+)?)(?:R|[\/-])(\d{2})/);
  if (!imperial) return null;

  const overallDiameterInches = Number(imperial[1]);
  const sectionWidthInches = Number(imperial[2]);
  const rimDiameterInches = Number(imperial[3]);
  if (overallDiameterInches <= rimDiameterInches) return null;
  return {
    kind: 'IMPERIAL',
    overallDiameterCm: overallDiameterInches * CM_PER_INCH,
    sectionWidthCm: sectionWidthInches * CM_PER_INCH,
    display: `${overallDiameterInches}/${sectionWidthInches}R${rimDiameterInches}`
  };
};

export const parseCourierSpecs = (value: string): ParsedCourierSpecs => {
  const tyreSize = parseTyreSize(value);
  return {
    wheelSize: parseWheelSize(value),
    tyreSize,
    hasTyres: Boolean(tyreSize || /\btyres?\b|\btires?\b/i.test(value))
  };
};

const estimateWheelWeightKg = (wheel: WheelSize) => Math.max(
  6.5,
  6.7 + ((wheel.diameterInches - 15) * 0.9) + ((wheel.widthInches - 6) * 0.55)
);

const estimateTyreWeightKg = (tyre: TyreSize) => Math.max(
  6.5,
  7.3 + ((tyre.sectionWidthCm * 10 - 185) * 0.012) + ((tyre.overallDiameterCm / CM_PER_INCH - 15) * 0.3)
);

export const createCourierEstimate = (input: CourierEstimateInput): CourierEstimate | null => {
  const quantity = Math.max(1, Math.round(cleanNumber(input.quantity, 1)));
  const paddingCm = cleanNumber(input.paddingCm, 6);
  const volumetricDivisor = cleanNumber(input.volumetricDivisor, 5000);
  const hasTyre = input.itemType !== 'WHEEL_ONLY';
  const hasWheel = input.itemType !== 'TYRE_ONLY';
  const wheel = input.wheelSize ?? null;
  const tyre = input.tyreSize ?? null;

  if ((hasWheel && !wheel) || (hasTyre && !tyre)) return null;

  const productDiameterCm = tyre?.overallDiameterCm ?? (wheel!.diameterInches * CM_PER_INCH);
  const productDepthCm = tyre?.sectionWidthCm ?? (wheel!.widthInches * CM_PER_INCH);
  const dimensionsCm = {
    length: ceilPositive(productDiameterCm + paddingCm),
    width: ceilPositive(productDiameterCm + paddingCm),
    height: ceilPositive(productDepthCm + paddingCm)
  };
  const calculatedWeight = (wheel ? estimateWheelWeightKg(wheel) : 0) + (tyre ? estimateTyreWeightKg(tyre) : 0);
  const estimatedActualWeightKg = cleanNumber(input.actualWeightKgOverride, calculatedWeight);
  const volumetricWeightKg = ceilPositive(
    (dimensionsCm.length * dimensionsCm.width * dimensionsCm.height) / volumetricDivisor
  );
  const chargeableWeightKg = Math.max(estimatedActualWeightKg, volumetricWeightKg);
  const itemDescription = input.itemType === 'WHEEL_ONLY'
    ? `${wheel!.diameterInches}-inch alloy wheel (${wheel!.widthInches}J), boxed`
    : input.itemType === 'TYRE_ONLY'
      ? `${tyre!.display} tyre, protected and boxed`
      : `${wheel!.diameterInches}-inch alloy wheel with ${tyre!.display} tyre, boxed`;

  return {
    dimensionsCm,
    estimatedActualWeightKg: Math.round(estimatedActualWeightKg * 10) / 10,
    volumetricWeightKg,
    chargeableWeightKg: Math.round(chargeableWeightKg * 10) / 10,
    totalActualWeightKg: Math.round(estimatedActualWeightKg * quantity * 10) / 10,
    totalVolumetricWeightKg: volumetricWeightKg * quantity,
    totalChargeableWeightKg: Math.round(chargeableWeightKg * quantity * 10) / 10,
    description: `${quantity} x ${itemDescription} - fragile automotive goods`,
    calculationNote: input.actualWeightKgOverride
      ? 'Actual weight entered manually. Dimensions remain a courier-ready estimate.'
      : 'Weight and dimensions are estimates from the supplied size. Measure and weigh the packed parcel for a guaranteed courier declaration.'
  };
};

export const formatCourierPortalText = (estimate: CourierEstimate, quantity: number, address: string): string => {
  const cleanAddress = String(address || '').trim().replace(/\n+/g, ', ').replace(/\s*,\s*/g, ', ');
  return [
    `Pieces: ${quantity}`,
    `Dimensions per parcel: ${estimate.dimensionsCm.length} x ${estimate.dimensionsCm.width} x ${estimate.dimensionsCm.height} cm`,
    `Actual weight: ${estimate.estimatedActualWeightKg} kg per parcel (${estimate.totalActualWeightKg} kg total)`,
    `Volumetric weight: ${estimate.volumetricWeightKg} kg per parcel (${estimate.totalVolumetricWeightKg} kg total)`,
    `Chargeable weight: ${estimate.chargeableWeightKg} kg per parcel (${estimate.totalChargeableWeightKg} kg total)`,
    `Description: ${estimate.description}`,
    cleanAddress ? `Delivery address: ${cleanAddress}` : ''
  ].filter(Boolean).join('\n');
};
