import { BatteryProduct, InventoryItem, ProductType, SupplierCatalog, TyreProduct, WheelProduct } from './types';
import { loadLiveSupplierCatalogItems } from './liveSupplierCatalog';
import { buildTyreIndexDisplay, parseSupplierTyreFields } from './supplierTyreParsing';
import { roundSupplierSellingPrice } from './supplierPricing';
import {
  parseAlineData,
  parseApexData,
  parseArcData,
  parseAttData,
  parseBridgestoneData,
  parseExclusiveTyresData,
  parseExoticData,
  parseMaxxisData,
  parseRoyalTyresData,
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
  'MAXXIS',
  'EXCLUSIVE_TYRES',
  'EXCLUSIVE_TYRES_NEW',
  'TYREWAREHOUSE',
  'ATT',
  'BRIDGESTONE',
  'SAFETY_GRIP',
  'ROYAL_TYRES',
  'DIXON_BATTERIES',
  'REVOLUTION_TYRES',
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
  'TYRE_LIFE_WHEELS',
  'NDT',
  'WHEEL_TECH'
];

const supplierDisplayNames: Record<ConcreteSupplierCatalog, string> = {
  SAILUN: 'SAILUN',
  MAXXIS: 'MAXXIS',
  EXCLUSIVE_TYRES: 'EXCLUSIVE TYRES',
  EXCLUSIVE_TYRES_NEW: 'EXCLUSIVE TYRES NEW',
  TYREWAREHOUSE: 'TYREWAREHOUSE',
  ATT: 'ATT',
  BRIDGESTONE: 'BRIDGESTONE',
  SAFETY_GRIP: 'SAFETY GRIP',
  ROYAL_TYRES: 'ROYAL TYRES',
  DIXON_BATTERIES: 'DIXON BATTERIES',
  REVOLUTION_TYRES: 'REVOLUTION TYRES',
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
  TYRE_LIFE_WHEELS: 'TYRE LIFE WHEELS',
  NDT: 'NDT',
  WHEEL_TECH: 'WHEEL TECH'
};

export const SUPPLIER_CATALOG_OPTIONS = supplierCatalogOrder.map((catalog) => ({
  catalog,
  label: supplierDisplayNames[catalog]
}));

const supplierPOSKeys: Record<ConcreteSupplierCatalog, string> = {
  SAILUN: 'sailun',
  MAXXIS: 'maxxis',
  EXCLUSIVE_TYRES: 'exclusive',
  EXCLUSIVE_TYRES_NEW: 'exclusive-tyres-new',
  TYREWAREHOUSE: 'tyrewarehouse',
  ATT: 'att',
  BRIDGESTONE: 'bridgestone',
  SAFETY_GRIP: 'safetygrip',
  ROYAL_TYRES: 'royal-tyres',
  DIXON_BATTERIES: 'dixon-batteries',
  REVOLUTION_TYRES: 'revolution-tyres',
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
  TYRE_LIFE_WHEELS: 'tyrelifewheels',
  NDT: 'ndt',
  WHEEL_TECH: 'wheel-tech'
};

const supplierItemCache = new Map<ConcreteSupplierCatalog, Promise<InventoryItem[]>>();
let allSupplierPOSItemsCache: Promise<InventoryItem[]> | null = null;

const cloneInventoryItems = (items: InventoryItem[]) => items.map((item) => ({ ...item } as InventoryItem));

const attStockMatchKey = (item: InventoryItem): string => {
  if (item.type !== ProductType.TYRE) return '';
  const tyre = item as TyreProduct;
  return [tyre.size, tyre.brand, tyre.pattern]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

export const restoreAttStockFromBundledCatalog = (
  liveItems: InventoryItem[],
  bundledItems: InventoryItem[]
): InventoryItem[] => {
  const liveHasStock = liveItems.some((item) => item.quantity > 0);
  if (liveHasStock) return liveItems;

  const bundledByKey = new Map<string, InventoryItem[]>();
  bundledItems.forEach((item) => {
    const key = attStockMatchKey(item);
    if (!key) return;
    bundledByKey.set(key, [...(bundledByKey.get(key) || []), item]);
  });

  const liveCounts = liveItems.reduce<Map<string, number>>((counts, item) => {
    const key = attStockMatchKey(item);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
  const matchedIndexes = new Map<string, number>();

  return liveItems.map((item) => {
    const key = attStockMatchKey(item);
    const bundledMatches = bundledByKey.get(key) || [];
    if (!key || bundledMatches.length === 0 || bundledMatches.length !== liveCounts.get(key)) return item;

    const matchIndex = matchedIndexes.get(key) || 0;
    matchedIndexes.set(key, matchIndex + 1);
    const fallback = bundledMatches[matchIndex];
    if (!fallback || fallback.quantity <= 0) return item;

    return {
      ...item,
      quantity: fallback.quantity,
      stockByLocation: fallback.stockByLocation || { 'Supplier network': fallback.quantity }
    } as InventoryItem;
  });
};

const supplierSkuKey = (item: InventoryItem): string => (
  String(item.supplierStockCode || '').trim().toUpperCase()
);

export const restoreSupplierWheelSpecsFromBundledCatalog = (
  liveItems: InventoryItem[],
  bundledItems: InventoryItem[]
): InventoryItem[] => {
  const bundledWheelsBySku = new Map<string, WheelProduct>();
  bundledItems.forEach((item) => {
    if (item.type !== ProductType.WHEEL) return;
    const key = supplierSkuKey(item);
    if (key && !bundledWheelsBySku.has(key)) bundledWheelsBySku.set(key, item as WheelProduct);
  });

  return liveItems.map((item) => {
    if (item.type !== ProductType.WHEEL) return item;
    const wheel = item as WheelProduct;
    const bundledWheel = bundledWheelsBySku.get(supplierSkuKey(wheel));
    if (!bundledWheel) return wheel;

    return {
      ...wheel,
      code: wheel.code?.trim() || bundledWheel.code,
      brand: wheel.brand?.trim() || bundledWheel.brand,
      finish: wheel.finish?.trim() || bundledWheel.finish,
      size: wheel.size?.trim() || bundledWheel.size,
      pcd: wheel.pcd?.trim() || bundledWheel.pcd,
      offset: wheel.offset?.trim() || bundledWheel.offset,
      centerBore: wheel.centerBore?.trim() || bundledWheel.centerBore,
      colour: wheel.colour?.trim() || bundledWheel.colour,
      setQuantity: wheel.setQuantity || bundledWheel.setQuantity,
      imageDesignKey: wheel.imageDesignKey?.trim() || bundledWheel.imageDesignKey,
      imageFinishKey: wheel.imageFinishKey?.trim() || bundledWheel.imageFinishKey
    };
  });
};

export const normalizeBundledSupplierTyres = (
  catalog: ConcreteSupplierCatalog,
  items: InventoryItem[]
): InventoryItem[] => items.map((item) => {
  if (item.type !== ProductType.TYRE) return item;
  const tyre = item as TyreProduct;
  const parsed = parseSupplierTyreFields({
    description: [tyre.brand, tyre.pattern, tyre.loadSpeedIndex].filter(Boolean).join(' '),
    explicitSize: tyre.size,
    explicitBrand: tyre.brand,
    explicitPattern: tyre.pattern,
    explicitRating: tyre.tyreRating,
    explicitIndex: tyre.tyreIndex || tyre.loadSpeedIndex,
    explicitSpecs: tyre.tyreSpecs
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
    case 'MAXXIS': {
      const { MAXXIS_RAW_DATA } = await import('./supplier_data/maxxisData');
      return parseMaxxisData(MAXXIS_RAW_DATA);
    }
    case 'EXCLUSIVE_TYRES': {
      const { EXCLUSIVE_TYRES_RAW_DATA } = await import('./supplier_data/exclusiveTyresData');
      return parseExclusiveTyresData(EXCLUSIVE_TYRES_RAW_DATA);
    }
    case 'EXCLUSIVE_TYRES_NEW':
      // The new authenticated Exclusive Tyres catalogue is served from its live Supabase snapshot.
      return [];
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
    case 'ROYAL_TYRES': {
      const { ROYAL_TYRES_RAW_DATA } = await import('./supplier_data/royalTyresData');
      return parseRoyalTyresData(ROYAL_TYRES_RAW_DATA);
    }
    case 'DIXON_BATTERIES': {
      const { DIXON_BATTERY_ROWS } = await import('./supplier_data/dixonBatteryData');
      return DIXON_BATTERY_ROWS.map(([batteryType, batteryDescription, nettPrice, grossPrice, costIncluding, sellingPrice], index): BatteryProduct => ({
        id: `dixon-battery-${index + 1}-${batteryType.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        type: ProductType.BATTERY,
        batteryType,
        batteryDescription,
        nettPrice,
        grossPrice,
        costIncluding,
        quantity: 0,
        costPrice: costIncluding,
        sellingPrice: roundSupplierSellingPrice(sellingPrice),
        lastUpdated: '2026-08-05',
        supplierName: 'DIXON BATTERIES',
        supplierStockCode: batteryType
      }));
    }
    case 'REVOLUTION_TYRES':
      // Revolution Tyres is served from its authenticated live catalogue snapshot.
      return [];
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
    case 'NDT':
      // NDT is published from the verified catalogue snapshot in Supabase.
      return [];
    case 'WHEEL_TECH':
      // WHEEL TECH is published from the verified Facebook Marketplace snapshot in Supabase.
      return [];
  }
};

const loadConcreteSupplierCatalog = async (catalog: ConcreteSupplierCatalog): Promise<InventoryItem[]> => {
  try {
    const liveItems = await loadLiveSupplierCatalogItems(catalog);
    if (liveItems) {
      if (catalog === 'ATT' && !liveItems.some((item) => item.quantity > 0)) {
        const bundledItems = normalizeBundledSupplierTyres(catalog, await loadBundledSupplierCatalog(catalog));
        return restoreAttStockFromBundledCatalog(liveItems, bundledItems);
      }
      if (catalog === 'TYRE_LIFE_WHEELS') {
        const bundledItems = await loadBundledSupplierCatalog(catalog);
        return restoreSupplierWheelSpecsFromBundledCatalog(liveItems, bundledItems);
      }
      return liveItems;
    }
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
