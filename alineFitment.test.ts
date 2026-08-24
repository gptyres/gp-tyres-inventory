import { describe, expect, it } from 'vitest';
import { expandWheelFitmentSearchText, getAlineVehicleFitments } from './alineFitment';

describe('A-Line vehicle fitments', () => {
  it('loads the supplier-confirmed vehicle applications saved for a wheel SKU', () => {
    expect(getAlineVehicleFitments('82410224')).toContain('Toy Corolla');
  });

  it('prefers fitment data embedded in a newer live supplier snapshot', () => {
    expect(getAlineVehicleFitments(
      '82410224',
      'Pricing basis: set of 4 | Vehicle fitment: VW Polo / Audi A1'
    )).toBe('VW Polo / Audi A1');
  });

  it('expands common catalogue abbreviations so full vehicle names are searchable', () => {
    expect(expandWheelFitmentSearchText('ToyCorolla / NisMicra / VwPolo')).toBe(
      'ToyotaCorolla / NissanMicra / VolkswagenPolo'
    );
  });
});
