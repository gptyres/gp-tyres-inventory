import { supabase } from './supabaseClient';
import { InventoryItem, ProductType, SupplierCatalog, TyreProduct, WheelProduct } from './types';
import { isLiveSupplierCatalog } from './supplierCatalogMapping';
import { buildTyreIndexDisplay, parseSupplierTyreFields } from './supplierTyreParsing';
import { parseSupplierWheelImageKeys } from './supplierStockImages';
import {
  normalizeStockByLocation,
  normalizeStockLocationName,
  parseStockLocationSummary,
  sortStockLocationEntries
} from './stockLocation';

export interface LiveSupplierCatalogRow {
  id: number;
  snapshot_id: string;
  catalog_key: string;
  source_key: string;
  product_type: 'TYRE' | 'WHEEL';
  supplier: string;
  supplier_sku?: string | null;
  brand: string;
  product_name: string;
  tyre_pattern?: string | null;
  tyre_rating?: string | null;
  tyre_index?: string | null;
  tyre_specs?: string | null;
  wheel_pcd?: string | null;
  wheel_offset?: string | null;
  wheel_center_bore?: string | null;
  stock_by_location?: Record<string, number> | null;
  category?: string | null;
  size?: string | null;
  stock_location?: string | null;
  stock_units_availability?: string | null;
  stock_units: number;
  cost_price: number | string;
  selling_price: number | string;
  source_file: string;
  imported_at: string;
}

const PAGE_SIZE = 1_000;

const stockEntries = (row: LiveSupplierCatalogRow): Array<[string, number]> => {
  const existing = normalizeStockByLocation(row.stock_by_location);
  if (Object.keys(existing).length > 0) return sortStockLocationEntries(existing);

  const summary = parseStockLocationSummary(row.stock_location);
  if (Object.keys(summary).length > 0) return sortStockLocationEntries(summary);

  const location = normalizeStockLocationName(row.stock_location || '');
  if (!location || /^no stock listed$/i.test(location)) return [];
  return [[location, Math.max(0, Math.trunc(Number(row.stock_units) || 0))]];
};

const formatStockByLocation = (locations: Record<string, number>) => (
  sortStockLocationEntries(locations).map(([location, quantity]) => `${location}: ${quantity}`).join(' | ')
);

const buildLocation = (row: LiveSupplierCatalogRow) => {
  if (row.stock_by_location && Object.keys(row.stock_by_location).length > 0) {
    return formatStockByLocation(row.stock_by_location);
  }
  return [row.stock_location, row.stock_units_availability]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' | ')
    || 'Supplier';
};

export const groupLiveSupplierCatalogRows = (
  rows: LiveSupplierCatalogRow[]
): LiveSupplierCatalogRow[] => {
  const grouped = new Map<string, LiveSupplierCatalogRow>();

  rows.forEach((row) => {
    const supplierIdentity = row.supplier_sku?.trim() || '';
    const key = [
      row.catalog_key,
      row.product_type,
      supplierIdentity,
      row.brand,
      row.product_name,
      row.tyre_pattern || '',
      row.tyre_rating || '',
      row.tyre_index || '',
      row.tyre_specs || '',
      row.wheel_pcd || '',
      row.wheel_offset || '',
      row.wheel_center_bore || '',
      row.category || '',
      row.size || '',
      String(row.cost_price),
      String(row.selling_price)
    ].map((value) => String(value).trim().toLowerCase()).join('\u001f');
    const existing = grouped.get(key);
    const locations = normalizeStockByLocation(existing?.stock_by_location);
    stockEntries(row).forEach(([location, quantity]) => {
      locations[location] = (locations[location] || 0) + quantity;
    });
    const totalQuantity = Object.values(locations).reduce((total, quantity) => total + quantity, 0);

    grouped.set(key, {
      ...(existing || row),
      imported_at: existing && existing.imported_at > row.imported_at ? existing.imported_at : row.imported_at,
      stock_by_location: Object.keys(locations).length > 0 ? locations : null,
      stock_location: Object.keys(locations).length > 0 ? formatStockByLocation(locations) : row.stock_location,
      stock_units_availability: totalQuantity > 0 ? 'In stock' : 'Out of stock',
      stock_units: totalQuantity
    });
  });

  return Array.from(grouped.values());
};

export const liveSupplierRowToInventoryItem = (
  row: LiveSupplierCatalogRow
): InventoryItem => {
  const common = {
    id: 'live-' + row.catalog_key.toLowerCase() + '-' + row.source_key,
    quantity: Math.max(0, Math.trunc(Number(row.stock_units) || 0)),
    sellingPrice: Math.max(0, Number(row.selling_price) || 0),
    costPrice: Math.max(0, Number(row.cost_price) || Number(row.selling_price) || 0),
    lastUpdated: row.imported_at.slice(0, 10),
    supplierName: row.catalog_key === 'TYRE_LIFE_WHEELS' ? 'TYRE LIFE WHEELS' : row.supplier,
    supplierStockCode: row.supplier_sku || undefined,
    stockByLocation: row.stock_by_location || undefined
  };

  if (row.product_type === 'WHEEL') {
    const brandPrefix = row.brand?.trim();
    const fallbackName = row.product_name
      .replace(brandPrefix ? new RegExp(`^${brandPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i') : /^$/, '')
      .split('|')[0]
      .trim();
    const wheelName = row.tyre_pattern?.trim() || fallbackName || row.supplier_sku || row.source_key;
    const finish = row.tyre_specs?.trim() || '';
    const imageKeys = parseSupplierWheelImageKeys(row.brand, wheelName, finish, row.supplier_sku || '');
    const wheel: WheelProduct = {
      ...common,
      type: ProductType.WHEEL,
      code: wheelName,
      brand: row.brand,
      finish,
      size: row.size || '',
      pcd: row.wheel_pcd?.trim() || '',
      offset: row.wheel_offset?.trim().replace(/^--/, '-') || '',
      centerBore: row.wheel_center_bore?.trim() || '',
      colour: [row.brand, finish, row.category, row.supplier_sku].filter(Boolean).join(' | '),
      setQuantity: 1,
      location: buildLocation(row),
      imageDesignKey: imageKeys.designKey,
      imageFinishKey: imageKeys.finishKey
    };
    return wheel;
  }

  const parsedTyre = parseSupplierTyreFields({
    description: row.product_name,
    explicitSize: row.size,
    explicitBrand: row.brand,
    explicitPattern: row.tyre_pattern,
    explicitRating: row.tyre_rating,
    explicitIndex: row.tyre_index,
    explicitSpecs: row.tyre_specs
  });
  const tyre: TyreProduct = {
    ...common,
    type: ProductType.TYRE,
    brand: parsedTyre.brand,
    pattern: parsedTyre.pattern,
    size: parsedTyre.size,
    loadSpeedIndex: buildTyreIndexDisplay(parsedTyre.rating, parsedTyre.index),
    tyreRating: parsedTyre.rating,
    tyreIndex: parsedTyre.index,
    tyreSpecs: parsedTyre.specs,
    location: buildLocation(row)
  };
  return tyre;
};

export const loadLiveSupplierCatalogItems = async (
  catalog: SupplierCatalog
): Promise<InventoryItem[] | null> => {
  if (!isLiveSupplierCatalog(catalog)) return null;

  const { data: source, error: sourceError } = await (supabase
    .from('supplier_catalog_sources') as any)
    .select('active_snapshot_id')
    .eq('catalog_key', catalog)
    .maybeSingle();

  if (sourceError) throw new Error(sourceError.message);
  if (!source?.active_snapshot_id) return null;

  const rows: LiveSupplierCatalogRow[] = [];
  let lastId = 0;

  while (true) {
    const { data, error } = await (supabase
      .from('supplier_catalog_items') as any)
      .select(
        'id,snapshot_id,catalog_key,source_key,product_type,supplier,supplier_sku,brand,product_name,tyre_pattern,tyre_rating,tyre_index,tyre_specs,wheel_pcd,wheel_offset,wheel_center_bore,stock_by_location,category,size,stock_location,stock_units_availability,stock_units,cost_price,selling_price,source_file,imported_at'
      )
      .eq('snapshot_id', source.active_snapshot_id)
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);

    if (error) throw new Error(error.message);
    const page = (data || []) as LiveSupplierCatalogRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    lastId = page[page.length - 1].id;
  }

  return rows.length > 0
    ? groupLiveSupplierCatalogRows(rows).map(liveSupplierRowToInventoryItem)
    : null;
};
