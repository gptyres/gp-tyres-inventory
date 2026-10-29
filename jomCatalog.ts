import data from './supplier_data/jomData.json';
import { ProductType, type CoiloverProduct } from './types';

export interface JomSupplierRow {
  supplierSku: string;
  description: string;
  stockUnits: number | null;
  priceIncludingVat: number | null;
  warehouse: string;
  sourcePage: number;
}

export const getJomProductLabel = (description: string): string => {
  if (/\bP(?:LA|AL)STIC DIP\b/i.test(description)) return 'Plastic dip';
  if (/\bHOODLIFT\b/i.test(description)) return 'Hood lift';
  if (/^LINKS\b/i.test(description)) return 'Suspension link';
  if (/\bSPACER\b/i.test(description)) return 'Wheel spacer';
  // The report lists vehicle applications without naming the kit type.
  return 'Vehicle application';
};

const vehicleBrand = (description: string): string => {
  const match = description.match(/\b(VW|GOLF|POLO|AUDI|BMW|OPEL|CORSA|MERC|FORD|HONDA|TOYOTA|NISSAN|MINI)\b/i);
  if (!match) return '';
  const token = match[1].toUpperCase();
  return ({ VW: 'Volkswagen', GOLF: 'Volkswagen', POLO: 'Volkswagen', CORSA: 'Opel', MERC: 'Mercedes-Benz' } as Record<string, string>)[token] || token;
};

export const parseJomCatalog = (rows: readonly JomSupplierRow[], importedAt: string): CoiloverProduct[] => {
  const codes = new Set<string>();
  return rows.map((row) => {
    if (!row.supplierSku || codes.has(row.supplierSku) || !row.description
      || (row.stockUnits !== null && (!Number.isInteger(row.stockUnits) || row.stockUnits < 0))
      || (row.priceIncludingVat !== null && (!Number.isFinite(row.priceIncludingVat) || row.priceIncludingVat <= 0))) {
      throw new Error(`Invalid JOM stock row: ${row.supplierSku}`);
    }
    codes.add(row.supplierSku);
    const label = getJomProductLabel(row.description);
    return {
      id: `jom-${row.supplierSku.toLowerCase().replace(/\s+/g, '-')}`,
      type: ProductType.COILOVER,
      productLabel: label,
      brand: 'JOM',
      series: label,
      vehicleCompatibility: row.description,
      vehicleBrand: vehicleBrand(row.description),
      details: `${row.description} | Stock code: ${row.supplierSku}${row.priceIncludingVat === null ? ' | Price on request' : ''}`,
      quantity: row.stockUnits ?? 0,
      stockQuantityUnknown: row.stockUnits === null || undefined,
      costPrice: row.priceIncludingVat ?? 0,
      sellingPrice: row.priceIncludingVat ?? 0,
      supplierName: 'JOM',
      supplierStockCode: row.supplierSku,
      location: row.stockUnits === null ? 'Stock not in latest report - confirm availability' : row.warehouse,
      stockByLocation: row.stockUnits === null ? undefined : { [row.warehouse]: row.stockUnits },
      lastUpdated: importedAt,
    };
  });
};

export const loadJomCatalog = (): CoiloverProduct[] => parseJomCatalog(data.rows, data.sourceReportedAt);
