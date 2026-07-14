import type { SupplierCatalog } from './types.js';

export type RegistryBackedSupplierCatalog = Exclude<
  SupplierCatalog,
  'ALL_SUPPLIERS' | 'SAILUN' | 'SAFETY_GRIP' | 'ARC'
>;

export type ManualSupplierCatalog = Extract<SupplierCatalog, 'SAILUN' | 'SAFETY_GRIP'>;
export type LiveSupplierCatalog = RegistryBackedSupplierCatalog | ManualSupplierCatalog;
export type SupplierImportCatalog = LiveSupplierCatalog;

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

export const SUPPLIER_IMPORT_BY_CATALOG: Record<SupplierImportCatalog, {
  supplier: string;
  sheetName: string;
  productType: 'TYRE' | 'WHEEL';
}> = {
  SAILUN: { supplier: 'Sailun', sheetName: 'SUPPLIER_SAILUN', productType: 'TYRE' },
  SAFETY_GRIP: { supplier: 'Safety Grip', sheetName: 'SUPPLIER_SAFETY_GRIP', productType: 'TYRE' },
  EXCLUSIVE_TYRES: { supplier: 'Exclusive Tyres', sheetName: 'SUPPLIER_EXCLUSIVE_TYRES', productType: 'TYRE' },
  TYREWAREHOUSE: { supplier: 'Tyrewarehouse', sheetName: 'SUPPLIER_TYREWAREHOUSE', productType: 'TYRE' },
  ATT: { supplier: 'ATT', sheetName: 'SUPPLIER_ATT', productType: 'TYRE' },
  ALINE: { supplier: 'Aline', sheetName: 'SUPPLIER_ALINE', productType: 'WHEEL' },
  STAMFORD: { supplier: 'Stamford', sheetName: 'SUPPLIER_STAMFORD', productType: 'TYRE' },
  APEX: { supplier: 'Apex', sheetName: 'SUPPLIER_APEX', productType: 'TYRE' },
  TUBESTONE: { supplier: 'Tubestone', sheetName: 'SUPPLIER_TUBESTONE', productType: 'TYRE' },
  EXOTIC: { supplier: 'Exotic', sheetName: 'SUPPLIER_EXOTIC', productType: 'TYRE' },
  TREAD_ZONE: { supplier: 'Tread Zone', sheetName: 'SUPPLIER_TREAD_ZONE', productType: 'TYRE' },
  SUMITOMO_DUNLOP: { supplier: 'Sumitomo/Dunlop', sheetName: 'SUPPLIER_SUMITOMO_DUNLOP', productType: 'TYRE' },
  TREADS_UNLIMITED: { supplier: 'Threads Unlimited', sheetName: 'SUPPLIER_TREADS_UNLIMITED', productType: 'TYRE' },
  TYRE_LIFE: { supplier: 'Tyre Life', sheetName: 'SUPPLIER_TYRE_LIFE', productType: 'TYRE' },
  TYRE_LIFE_WHEELS: { supplier: 'Tyre Life', sheetName: 'SUPPLIER_TYRE_LIFE_WHEELS', productType: 'WHEEL' }
};

export const isSupplierImportCatalog = (
  catalog: SupplierCatalog
): catalog is SupplierImportCatalog => (
  Object.prototype.hasOwnProperty.call(SUPPLIER_IMPORT_BY_CATALOG, catalog)
);

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
