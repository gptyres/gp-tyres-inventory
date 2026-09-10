import { parseSupplierTyreFields } from './supplierTyreParsing.ts';

export const ROYAL_WAREHOUSES = ['RVTRK', 'RTCPHX', 'RTCJHB', 'RTC_CT'];

export function royalWorkbookItem(row) {
  const name = String(row['Product Name'] || '').trim().toUpperCase();
  const sku = String(row['Supplier SKU'] || '').trim();
  if (!sku || !name || row['Price Column'] !== 'Yellow') throw new Error('Invalid Royal workbook row');
  const cost = Number(row['Cost Price']);
  if (!Number.isFinite(cost) || cost < 0) throw new Error(`${sku}: invalid Yellow price`);
  const stock = Object.fromEntries(ROYAL_WAREHOUSES.map((warehouse) => {
    const units = Number(row[`${warehouse} Stock Units`]);
    if (!Number.isInteger(units)) throw new Error(`${sku}: invalid ${warehouse} units`);
    return [warehouse, Math.max(0, units)];
  }));
  const wheel = row['Product Type'] === 'WHEEL';
  const brand = wheel ? name.replace(/^RIMS?\s+/, '').split(' ')[0]
    : name.startsWith('BF GOODRICH ') ? 'BF GOODRICH'
    : name.startsWith('SECOND HAND ') ? 'SECOND HAND' : name.split(' ')[0];
  const fields = parseSupplierTyreFields({ description: name.replace(/\(([^)]+)\)/g, ' $1 '), explicitBrand: brand, explicitSize: String(row.TYRE_SIZE || '') });
  const specs = name.match(/\((\d[^)]+)\)/)?.[1]?.split('/').map((v) => v.trim()) || [];
  const wheelDiameter = name.match(/\b(\d{2})"/)?.[1];
  const wheelSize = name.match(/\b\d{2}(?:\.\d+)?\s*X\s*\d{1,2}(?:\.\d+)?\b/)?.[0]?.replace(/\s+/g, '')
    || (wheelDiameter && /^\d+(?:\.\d+)?$/.test(specs[4] || '') ? `${wheelDiameter}X${specs[4]}` : '');
  // Codes above the load-index range, e.g. Bridgestone 613V, are model names.
  const indexes = fields.index.split(' / ').filter(Boolean);
  const modelCodes = indexes.filter((value) => Number.parseInt(value, 10) > 279);
  fields.index = indexes.filter((value) => !modelCodes.includes(value)).join(' / ');
  fields.pattern = [fields.pattern, ...modelCodes].filter(Boolean).join(' ');
  const quantity = Object.values(stock).reduce((sum, value) => sum + value, 0);
  return {
    catalog_key: 'ROYAL_TYRES', supplier: 'ROYAL TYRES', supplier_sku: sku,
    source_key: `royal-${encodeURIComponent(sku)}`,
    product_type: wheel ? 'WHEEL' : 'TYRE', product_name: name, brand,
    size: wheel ? wheelSize : fields.size,
    tyre_pattern: wheel ? name.replace(/^RIMS?\s+/, '') : fields.pattern,
    tyre_rating: wheel ? '' : fields.rating, tyre_index: wheel ? '' : fields.index,
    tyre_specs: wheel ? (/DURA\s*BRIGHT/.test(name) ? 'DURA BRIGHT' : /SILVER/.test(name) ? 'SILVER' : '')
      : [row.Category, fields.specs].filter(Boolean).join(' / '),
    wheel_pcd: wheel && specs.length >= 2 ? `${specs[0]}/${specs[1]}` : null,
    wheel_center_bore: wheel ? specs[2] || null : null,
    wheel_offset: wheel ? specs[3] || null : null,
    category: wheel && !wheelSize ? 'Wheel Accessory' : row.Category,
    cost_price: cost, selling_price: Math.round(cost * 1.15 + 1e-9),
    stock_by_location: stock, stock_units: quantity,
    stock_location: Object.entries(stock).map(([key, value]) => `${key}: ${value}`).join(' | '),
    stock_units_availability: quantity > 0 ? 'In stock' : 'Out of stock',
    supplier_lead_time: cost === 0 ? 'Price to be confirmed - Yellow price not supplied' : null,
    source_stock_detail: `Available stock after reservations. Snapshot ${row['Snapshot Date']}. Yellow price. ${row['Source Sheet']} row ${row['Source Row']}.`,
    source_file: 'Reps-Stk_SoH_PriceList.xlsm.xlsx'
  };
}
