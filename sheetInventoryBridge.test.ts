import { describe, expect, it } from 'vitest';
import { ProductType, TyreProduct, WheelProduct } from './types';
import { buildSheetPortalItemPayload, buildSheetPortalItemPayloads } from './sheetInventoryBridge';

describe('sheet inventory portal bridge', () => {
  const tyre: TyreProduct = {
    id: 't-100',
    type: ProductType.TYRE,
    brand: 'DUNLOP',
    pattern: 'AT3G',
    size: '265/65/17',
    loadSpeedIndex: '',
    location: 'DECK',
    quantity: 4,
    costPrice: 1500,
    sellingPrice: 2900,
    lastUpdated: '2026-07-04'
  };

  it('maps portal tyre rows to INVENTORY A:G values', () => {
    expect(buildSheetPortalItemPayload(tyre)).toMatchObject({
      portalId: 't-100',
      operation: 'upsert',
      values: ['DECK', '', 'DUNLOP AT3G', '265/65/17', 4, 1500, 2900]
    });
  });

  it('uses zero quantity for delete syncs without dropping the row', () => {
    expect(buildSheetPortalItemPayload(tyre, 'delete')?.values[4]).toBe(0);
  });

  it('does not send wheel stock to the Google Sheet available tyre sync', () => {
    const wheel: WheelProduct = {
      id: 'w-1',
      type: ProductType.WHEEL,
      code: 'DAZZLE',
      size: '15x6.5',
      pcd: '4/100',
      offset: '',
      centerBore: '',
      colour: 'Black',
      setQuantity: 4,
      quantity: 4,
      costPrice: 1000,
      sellingPrice: 1800,
      lastUpdated: '2026-07-04'
    };

    expect(buildSheetPortalItemPayload(wheel)).toBeNull();
    expect(buildSheetPortalItemPayloads([tyre, wheel])).toHaveLength(1);
  });
});
