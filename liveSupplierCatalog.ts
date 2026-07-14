import { supabase } from './supabaseClient';
import { InventoryItem, ProductType, SupplierCatalog, TyreProduct, WheelProduct } from './types';
import { isLiveSupplierCatalog } from './supplierCatalogMapping';
import { buildTyreIndexDisplay, parseSupplierTyreFields } from './supplierTyreParsing';

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

const buildLocation = (row: LiveSupplierCatalogRow) => (
  [row.stock_location, row.stock_units_availability]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' | ')
  || 'Supplier'
);

export const liveSupplierRowToInventoryItem = (
  row: LiveSupplierCatalogRow
): InventoryItem => {
  const common = {
    id: 'live-' + row.catalog_key.toLowerCase() + '-' + row.source_key,
    quantity: Math.max(0, Math.trunc(Number(row.stock_units) || 0)),
    sellingPrice: Math.max(0, Number(row.selling_price) || 0),
    costPrice: Math.max(0, Number(row.cost_price) || Number(row.selling_price) || 0),
    lastUpdated: row.imported_at.slice(0, 10),
    supplierName: row.supplier,
    supplierStockCode: row.supplier_sku || undefined
  };

  if (row.product_type === 'WHEEL') {
    const wheel: WheelProduct = {
      ...common,
      type: ProductType.WHEEL,
      code: row.supplier_sku || row.source_key,
      size: row.size || '',
      pcd: '',
      offset: '',
      centerBore: '',
      colour: row.category || '',
      setQuantity: 1,
      location: buildLocation(row)
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
        'id,snapshot_id,catalog_key,source_key,product_type,supplier,supplier_sku,brand,product_name,tyre_pattern,tyre_rating,tyre_index,tyre_specs,category,size,stock_location,stock_units_availability,stock_units,cost_price,selling_price,source_file,imported_at'
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

  return rows.length > 0 ? rows.map(liveSupplierRowToInventoryItem) : null;
};
