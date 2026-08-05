import { describe, expect, it } from 'vitest';
import {
  buildParcelPerfectQuoteParameters,
  buildParcelPerfectUrl,
  hashParcelPerfectPassword,
  normalizeContentsItem,
  normalizeLocation
} from './parcelPerfect';

describe('Parcel Perfect ecommerce helpers', () => {
  const origin = normalizeLocation({
    name: 'GP TYRES', contact: 'Dispatch', address1: '220 Klip Road', address2: 'Lotus River', address3: 'Cape Town',
    postalCode: '7945', place: 'LOTUS RIVER Streets(1,2,3,4,5)', town: 'CAPE TOWN'
  }, 'Collection');
  const destination = normalizeLocation({
    name: 'Thabang Molala', contact: 'Thabang Molala', address1: '26 Gregor Street', address2: 'Witpoortjie',
    address3: 'Roodepoort', postalCode: '1724', place: 'Roodepoort', town: 'Roodepoort'
  }, 'Delivery');

  it('builds a v28 JSON API URL without exposing secrets in code', () => {
    const url = new URL(buildParcelPerfectUrl('https://example.test/ecomService/v28/Json/', 'Quote', 'requestQuote', { hello: 'world' }, 'token'));
    expect(url.pathname).toBe('/ecomService/v28/Json/');
    expect(url.searchParams.get('class')).toBe('Quote');
    expect(url.searchParams.get('method')).toBe('requestQuote');
    expect(url.searchParams.get('token_id')).toBe('token');
  });

  it('maps inventory parcel measurements into a courier quote request', () => {
    const parcel = normalizeContentsItem({
      description: '225/60R18 tyre', pieces: 4, lengthCm: 79, widthCm: 79, heightCm: 29, actualWeightKg: 24.1
    });
    const request = buildParcelPerfectQuoteParameters(origin, destination, parcel, 'ORDER-1001');
    expect(request.details.destperadd1).toBe('26 Gregor Street');
    expect(request.contents).toEqual([{
      item: 1, desc: '225/60R18 tyre', pieces: 4, dim1: 79, dim2: 79, dim3: 29, actmass: 24.1
    }]);
  });

  it('uses the provider documented password and salt hash format', () => {
    expect(hashParcelPerfectPassword('password', 'salt')).toBe('b305cadbb3bce54f3aa59c64fec00dea');
  });
});
