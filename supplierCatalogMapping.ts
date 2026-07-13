import type { SupplierCatalog } from './types.js';

export type RegistryBackedSupplierCatalog = Exclude<
  SupplierCatalog,
  'ALL_SUPPLIERS' | 'SAILUN' | 'SAFETY_GRIP' | 'ARC'
>;

export type ManualSupplierCatalog = Extract<SupplierCatalog, 'SAILUN' | 'SAFETY_GRIP'>;
export type LiveSupplierCatalog = RegistryBackedSupplierCatalog | ManualSupplierCatalog;

export const REGISTRY_SUPPLIER_BY_CATALOG: Record<RegistryBackedSupplierCatalog, string> = {
  EXCLUSIVE_TYRES: 'Exclusive Tyres',
  TYREWAREHOUSE: 'Tyrewarehouse',
  ATT: 'ATT',
  ALINE: 'Aline',
  STAMFORD: 'Stamford',
  APEX: 'Apex',
  TUBESTONE: 'Tubestone',
  EXOTIC: 'Exotic',
  TREAD_ZONE: 'Tread Zone',
  SUMITOMO_DUNLOP: 'Sumitomo/Dunlop',
  TREADS_UNLIMITED: 'Threads Unlimited',
  TYRE_LIFE: 'Tyre Life',
  TYRE_LIFE_WHEELS: 'Tyre Life'
};

export const isRegistryBackedSupplierCatalog = (
  catalog: SupplierCatalog
): catalog is RegistryBackedSupplierCatalog => (
  catalog !== 'ALL_SUPPLIERS'
  && Object.prototype.hasOwnProperty.call(REGISTRY_SUPPLIER_BY_CATALOG, catalog)
);

export const MANUAL_SUPPLIER_BY_CATALOG: Record<ManualSupplierCatalog, {
  supplier: string;
  sheetName: string;
}> = {
  SAILUN: { supplier: 'Sailun', sheetName: 'SUPPLIER_SAILUN' },
  SAFETY_GRIP: { supplier: 'Safety Grip', sheetName: 'SUPPLIER_SAFETY_GRIP' }
};

export const isManualSupplierCatalog = (
  catalog: SupplierCatalog
): catalog is ManualSupplierCatalog => (
  Object.prototype.hasOwnProperty.call(MANUAL_SUPPLIER_BY_CATALOG, catalog)
);

export const isLiveSupplierCatalog = (
  catalog: SupplierCatalog
): catalog is LiveSupplierCatalog => (
  isRegistryBackedSupplierCatalog(catalog) || isManualSupplierCatalog(catalog)
);
