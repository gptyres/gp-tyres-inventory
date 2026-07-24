import { InventoryItem, ProductType, SupplierCatalog, TyreProduct, WheelProduct } from './types';
import { loadLiveSupplierCatalogItems } from './liveSupplierCatalog';
import { buildTyreIndexDisplay, parseSupplierTyreFields } from './supplierTyreParsing';
import {
  parseAlineData,
  parseApexData,
  parseArcData,
  parseAttData,
  parseBridgestoneData,
  parseExclusiveTyresData,
  parseExoticData,
  parseSafetyGripData,
  parseSailunData,
  parseStamfordData,
  parseSumitomoDunlopData,
  parseTreadZoneData,
  parseTreadsUnlimitedData,
  parseTubestoneData,
  parseTyreLifeData,
  parseTyreLifeWheelsData,
  parseTyreWarehouseData
} from './utils';

export type ConcreteSupplierCatalog = Exclude<SupplierCatalog, 'ALL_SUPPLIERS'>;

const supplierCatalogOrder: ConcreteSupplierCatalog[] = [
  'SAILUN',
  'EXCLUSIVE_TYRES',
  'TYREWAREHOUSE',
  'ATT',
  'BRIDGESTONE',
  'SAFETY_GRIP',
  'ALINE',
  'STAMFORD',
  'APEX',
  'TUBESTONE',
  'EXOTIC',
  'ARC',
  'TREAD_ZONE',
  'SUMITOMO_DUNLOP',
  'TREADS_UNLIMITED',
  'TYRE_LIFE',
  'TYRE_LIFE_WHEELS'
];

const supplierDisplayNames: Record<ConcreteSupplierCatalog, string> = {
  SAILUN: 'SAILUN',
  EXCLUSIVE_TYRES: 'EXCLUSIVE TYRES',
  TYREWAREHOUSE: 'TYREWAREHOUSE',
  ATT: 'ATT',
  BRIDGESTONE: 'BRIDGESTONE',
  SAFETY_GRIP: 'SAFETY GRIP',
  ALINE: 'ALINE',
  STAMFORD: 'STAMFORD',
  APEX: 'APEX',
  TUBESTONE: 'TUBESTONE',
  EXOTIC: 'EXOTIC',
  ARC: 'ARC',
  TREAD_ZONE: 'TREAD ZONE',
  SUMITOMO_DUNLOP: 'SUMITOMO/DUNLOP',
  TREADS_UNLIMITED: 'TREADS UNLIMITED',
  TYRE_LIFE: 'TYRE LIFE',
  TYRE_LIFE_WHEELS: 'TYRE LIFE WHEELS'
};

export const SUPPLIER_CATALOG_OPTIONS = supplierCatalogOrder.map((catalog) => ({
  catalog,
  label: supplierDisplayNames[catalog]
}));

const supplierPOSKeys: Record<ConcreteSupplierCatalog, string> = {
  SAILUN: 'sailun',
  EXCLUSIVE_TYRES: 'exclusive',
  TYREWAREHOUSE: 'tyrewarehouse',
  ATT: 'att',
  BRIDGESTONE: 'bridgestone',
  SAFETY_GRIP: 'safetygrip',
  ALINE: 'aline',
  STAMFORD: 'stamford',
  APEX: 'apex',
  TUBESTONE: 'tubestone',
  EXOTIC: 'exotic',
  ARC: 'arc',
  TREAD_ZONE: 'treadzone',
  SUMITOMO_DUNLOP: 'sumitomo-dunlop',
  TREADS_UNLIMITED: 'treads',
  TYRE_LIFE: 'tyrelife',
  TYRE_LIFE_WHEELS: 'tyrelifewheels'
};

const supplierItemCache = new Map<ConcreteSupplierCatalog, Promise<InventoryItem[]>>();
let allSupplierPOSItemsCache: Promise<InventoryItem[]> | null = null;

const cloneInventoryItems = (items: InventoryItem[]) => items.map((item) => ({ ...item } as InventoryItem));

export const normalizeBundledSupplierTyres = (
  catalog: ConcreteSupplierCatalog,
  items: InventoryItem[]
): InventoryItem[] => items.map((item) => {
  if (item.type !== ProductType.TYRE) return item;
  const tyre = item as TyreProduct;
  const parsed = parseSupplierTyreFields({
    description: [tyre.brand, tyre.pattern, tyre.loadSpeedIndex].filter(Boolean).join(' '),
    explicitSize: tyre.size,
    explicitBrand: tyre.brand
  });
  return {
    ...tyre,
    supplierName: tyre.supplierName || supplierDisplayNames[catalog],
    size: parsed.size,
    brand: parsed.brand,
    pattern: parsed.pattern,
    tyreRating: parsed.rating,
    tyreIndex: parsed.index,
    tyreSpecs: parsed.specs,
    loadSpeedIndex: buildTyreIndexDisplay(parsed.rating, parsed.index)
  };
});

const tagSupplierItems = (supplierName: string, supplierItems: InventoryItem[]): InventoryItem[] => {
  return supplierItems.map((item) => {
    if (item.type === ProductType.WHEEL) {
      const wheel = item as WheelProduct;
      return {
        ...wheel,
        id: `${supplierName}-${wheel.id}`,
        supplierName,
        location: `${supplierName}: ${wheel.location || 'Supplier'}`
      };
    }

    if (item.type !== ProductType.TYRE) return { ...item, id: `${supplierName}-${item.id}`, supplierName };

    const tyre = item as TyreProduct;
    return {
      ...tyre,
      id: `${supplierName}-${tyre.id}`,
      supplierName,
      location: `${supplierName}: ${tyre.location || 'Supplier'}`
    };
  });
};

const tagSupplierPOSItems = (supplierKey: string, supplierItems: InventoryItem[]): InventoryItem[] => {
  return supplierItems.map((item) => ({
    ...item,
    id: `supplier-${supplierKey}-${item.id}`
  } as InventoryItem));
};

const loadBundledSupplierCatalog = async (catalog: ConcreteSupplierCatalog): Promise<InventoryItem[]> => {
  switch (catalog) {
    case 'SAILUN': {
      const { SAILUN_RAW_DATA } = await import('./supplier_data/sailunData');
      return parseSailunData(SAILUN_RAW_DATA);
    }
    case 'EXCLUSIVE_TYRES': {
      const { EXCLUSIVE_TYRES_RAW_DATA } = await import('./supplier_data/exclusiveTyresData');
      return parseExclusiveTyresData(EXCLUSIVE_TYRES_RAW_DATA);
    }
    case 'TYREWAREHOUSE': {
      const { TYRE_WAREHOUSE_RAW_DATA } = await import('./supplier_data/tyreWarehouseData');
      return parseTyreWarehouseData(TYRE_WAREHOUSE_RAW_DATA);
    }
    case 'ATT': {
      const { ATT_RAW_DATA } = await import('./supplier_data/attData');
      return parseAttData(ATT_RAW_DATA);
    }
    case 'BRIDGESTONE': {
      const { BRIDGESTONE_RAW_DATA } = await import('./supplier_data/bridgestoneData');
      return parseBridgestoneData(BRIDGESTONE_RAW_DATA);
    }
    case 'SAFETY_GRIP': {
      const { SAFETY_GRIP_RAW_DATA } = await import('./supplier_data/safetygripData');
      return parseSafetyGripData(SAFETY_GRIP_RAW_DATA);
    }
    case 'ALINE': {
      const { ALINE_RAW_DATA } = await import('./supplier_data/alineData');
      return parseAlineData(ALINE_RAW_DATA);
    }
    case 'STAMFORD': {
      const { STAMFORD_RAW_DATA, STAMFORD_PRICE_BY_SKU } = await import('./supplier_data/stamfordData');
      return parseStamfordData(STAMFORD_RAW_DATA, STAMFORD_PRICE_BY_SKU);
    }
    case 'APEX': {
      const { APEX_RAW_DATA } = await import('./supplier_data/apexData');
      return parseApexData(APEX_RAW_DATA);
    }
    case 'TUBESTONE': {
      const { TUBESTONE_RAW_DATA } = await import('./supplier_data/tubestoneData');
      return parseTubestoneData(TUBESTONE_RAW_DATA);
    }
    case 'EXOTIC': {
      const { EXOTIC_RAW_DATA } = await import('./supplier_data/exoticData');
      return parseExoticData(EXOTIC_RAW_DATA);
    }
    case 'ARC': {
      const { ARC_RAW_DATA } = await import('./supplier_data/arcData');
      return parseArcData(ARC_RAW_DATA);
    }
    case 'TREAD_ZONE': {
      const { TREAD_ZONE_RAW_DATA } = await import('./supplier_data/treadZoneData');
      return parseTreadZoneData(TREAD_ZONE_RAW_DATA);
    }
    case 'SUMITOMO_DUNLOP': {
      const { SUMITOMO_DUNLOP_RAW_DATA } = await import('./supplier_data/sumitomoDunlopData');
      return parseSumitomoDunlopData(SUMITOMO_DUNLOP_RAW_DATA);
    }
    case 'TREADS_UNLIMITED': {
      const { TREADS_RAW_DATA } = await import('./supplier_data/treadsUnlimitedData');
      return parseTreadsUnlimitedData(TREADS_RAW_DATA);
    }
    case 'TYRE_LIFE': {
      const { TYRE_LIFE_RAW_DATA } = await import('./supplier_data/tyreLifeData');
      return parseTyreLifeData(TYRE_LIFE_RAW_DATA);
    }
    case 'TYRE_LIFE_WHEELS': {
      const { TYRE_LIFE_WHEELS_RAW_DATA } = await import('./supplier_data/tyreLifeWheelsData');
      return parseTyreLifeWheelsData(TYRE_LIFE_WHEELS_RAW_DATA);
    }
  }
};

const loadConcreteSupplierCatalog = async (catalog: ConcreteSupplierCatalog): Promise<InventoryItem[]> => {
  try {
    const liveItems = await loadLiveSupplierCatalogItems(catalog);
    if (liveItems) return liveItems;
  } catch (error) {
    console.warn('Live supplier catalogue unavailable; using bundled fallback.', error);
  }

  return normalizeBundledSupplierTyres(catalog, await loadBundledSupplierCatalog(catalog));
};

export const loadSupplierCatalogItems = async (catalog: SupplierCatalog): Promise<InventoryItem[]> => {
  if (catalog === 'ALL_SUPPLIERS') {
    const catalogs = await Promise.all(supplierCatalogOrder.map(async (supplierCatalog) => ({
      supplierCatalog,
      items: await loadSupplierCatalogItems(supplierCatalog)
    })));

    return catalogs.flatMap(({ supplierCatalog, items }) => (
      tagSupplierItems(supplierDisplayNames[supplierCatalog], items)
    ));
  }

  if (!supplierItemCache.has(catalog)) {
    supplierItemCache.set(catalog, loadConcreteSupplierCatalog(catalog));
  }

  return cloneInventoryItems(await supplierItemCache.get(catalog)!);
};

export const loadSelectedSupplierCatalogItems = async (
  catalogs: ConcreteSupplierCatalog[]
): Promise<InventoryItem[]> => {
  const selected = new Set(catalogs);
  const orderedCatalogs = supplierCatalogOrder.filter((catalog) => selected.has(catalog));
  const loadedCatalogs = await Promise.all(orderedCatalogs.map(async (catalog) => ({
    catalog,
    items: await loadSupplierCatalogItems(catalog)
  })));

  return loadedCatalogs.flatMap(({ catalog, items }) => (
    tagSupplierItems(supplierDisplayNames[catalog], items)
  ));
};

export const loadAllSupplierPOSItems = async (): Promise<InventoryItem[]> => {
  if (!allSupplierPOSItemsCache) {
    allSupplierPOSItemsCache = Promise.all(supplierCatalogOrder.map(async (catalog) => (
      tagSupplierPOSItems(supplierPOSKeys[catalog], await loadSupplierCatalogItems(catalog))
    ))).then((catalogs) => catalogs.flat());
  }

  return cloneInventoryItems(await allSupplierPOSItemsCache);
};

export const invalidateSupplierCatalogCache = (catalog?: SupplierCatalog) => {
  if (!catalog || catalog === 'ALL_SUPPLIERS') {
    supplierItemCache.clear();
  } else {
    supplierItemCache.delete(catalog);
  }
  allSupplierPOSItemsCache = null;
};
