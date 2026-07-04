import { InventoryItem, ProductType, TyreProduct } from './types';

export type SheetPortalSyncOperation = 'upsert' | 'delete';

export interface SheetPortalItemPayload {
  portalId: string;
  operation: SheetPortalSyncOperation;
  type: ProductType;
  values: unknown[];
  productName: string;
  description: string;
}

const getTyreProductName = (item: TyreProduct) => {
  const pattern = item.pattern && item.pattern !== 'Standard' ? ` ${item.pattern}` : '';
  return `${item.brand}${pattern}`.trim();
};

export const buildSheetPortalItemPayload = (
  item: InventoryItem,
  operation: SheetPortalSyncOperation = 'upsert'
): SheetPortalItemPayload | null => {
  if (item.type !== ProductType.TYRE) return null;

  const tyre = item as TyreProduct;
  const productName = getTyreProductName(tyre) || tyre.brand || 'Unknown';
  const quantity = operation === 'delete' ? 0 : Math.max(0, Number(item.quantity) || 0);

  return {
    portalId: item.id,
    operation,
    type: item.type,
    productName,
    description: tyre.size,
    values: [
      tyre.location || 'Unknown',
      '',
      productName,
      tyre.size || 'Unknown',
      quantity,
      Number(item.costPrice) || 0,
      Number(item.sellingPrice) || 0
    ]
  };
};

export const buildSheetPortalItemPayloads = (
  items: InventoryItem[],
  operation: SheetPortalSyncOperation = 'upsert'
) => items
  .map(item => buildSheetPortalItemPayload(item, operation))
  .filter((item): item is SheetPortalItemPayload => Boolean(item));
