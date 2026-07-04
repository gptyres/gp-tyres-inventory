import { InventoryItem, ProductType, SupplierCatalog, TyreProduct, WheelProduct } from './types';
import {
  parseAlineData,
  parseApexData,
  parseArcData,
  parseAttData,
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

type ConcreteSupplierCatalog = Exclude<SupplierCatalog, 'ALL_SUPPLIERS'>;

const supplierCatalogOrder: ConcreteSupplierCatalog[] = [
  'SAILUN',
  'EXCLUSIVE_TYRES',
  'TYREWAREHOUSE',
  'ATT',
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

const supplierPOSKeys: Record<ConcreteSupplierCatalog, string> = {
  SAILUN: 'sailun',
  EXCLUSIVE_TYRES: 'exclusive',
  TYREWAREHOUSE: 'tyrewarehouse',
  ATT: 'att',
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

const tagSupplierItems = (supplierName: string, supplierItems: InventoryItem[]): InventoryItem[] => {
  return supplierItems.map((item) => {
    if (item.type === ProductType.WHEEL) {
      const wheel = item as WheelProduct;
      return {
        ...wheel,
        id: `${supplierName}-${wheel.id}`,
        location: `${supplierName}: ${wheel.location || 'Supplier'}`
      };
    }

    if (item.type !== ProductType.TYRE) return { ...item, id: `${supplierName}-${item.id}` };

    const tyre = item as TyreProduct;
    return {
      ...tyre,
      id: `${supplierName}-${tyre.id}`,
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

const loadConcreteSupplierCatalog = async (catalog: ConcreteSupplierCatalog): Promise<InventoryItem[]> => {
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

export const loadAllSupplierPOSItems = async (): Promise<InventoryItem[]> => {
  if (!allSupplierPOSItemsCache) {
    allSupplierPOSItemsCache = Promise.all(supplierCatalogOrder.map(async (catalog) => (
      tagSupplierPOSItems(supplierPOSKeys[catalog], await loadSupplierCatalogItems(catalog))
    ))).then((catalogs) => catalogs.flat());
  }

  return cloneInventoryItems(await allSupplierPOSItemsCache);
};
