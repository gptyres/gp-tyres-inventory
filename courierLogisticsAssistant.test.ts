import { describe, expect, it } from 'vitest';
import { createCourierEstimate, parseCourierSpecs, parseTyreSize } from './courierLogisticsAssistant';

describe('CourierLogisticsAssistant', () => {
  it('calculates the real outer diameter from a metric tyre size', () => {
    const tyre = parseTyreSize('225/40R19');
    expect(tyre?.overallDiameterCm).toBeCloseTo(66.26, 2);
    expect(tyre?.sectionWidthCm).toBe(22.5);
  });

  it('reads a customer-friendly wheel and tyre message', () => {
    const parsed = parseCourierSpecs('19 x 9.5J mags with 225/40/19 tyres');
    expect(parsed.wheelSize).toEqual({ diameterInches: 19, widthInches: 9.5 });
    expect(parsed.tyreSize?.display).toBe('225/40R19');
    expect(parsed.hasTyres).toBe(true);
  });

  it('uses the greater of actual and volumetric weight for a set', () => {
    const estimate = createCourierEstimate({
      itemType: 'WHEEL_AND_TYRE',
      quantity: 4,
      wheelSize: { diameterInches: 19, widthInches: 9.5 },
      tyreSize: parseTyreSize('225/40R19')
    });
    expect(estimate?.dimensionsCm).toEqual({ length: 73, width: 73, height: 29 });
    expect(estimate?.chargeableWeightKg).toBe(estimate?.volumetricWeightKg);
    expect(estimate?.totalChargeableWeightKg).toBe(estimate!.chargeableWeightKg * 4);
  });
});
