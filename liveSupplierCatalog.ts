import { supabase } from './supabaseClient';
import { InventoryItem, ProductType, SupplierCatalog, TyreProduct, WheelProduct } from './types';
import { isLiveSupplierCatalog } from './supplierCatalogMapping';

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

const removeBrandPrefix = (productName: string, brand: string) => {
  const normalizedProduct = productName.trim();
  const normalizedBrand = brand.trim();
  if (!normalizedBrand) return normalizedProduct || 'Standard';
  if (normalizedProduct.toLowerCase().startsWith(normalizedBrand.toLowerCase())) {
    return normalizedProduct.slice(normalizedBrand.length).trim() || 'Standard';
  }
  return normalizedProduct || 'Standard';
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

  const tyre: TyreProduct = {
    ...common,
    type: ProductType.TYRE,
    brand: row.brand || 'Unknown',
    pattern: removeBrandPrefix(row.product_name, row.brand || ''),
    size: row.size || '',
    loadSpeedIndex: '',
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
        'id,snapshot_id,catalog_key,source_key,product_type,supplier,supplier_sku,brand,product_name,category,size,stock_location,stock_units_availability,stock_units,cost_price,selling_price,source_file,imported_at'
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
