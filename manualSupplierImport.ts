import {
  SUPPLIER_IMPORT_BY_CATALOG,
  type SupplierImportCatalog
} from './supplierCatalogMapping';
import { extractSupplierTyreSize, parseSupplierTyreFields } from './supplierTyreParsing';

export interface ManualSupplierRow {
  sourceKey: string;
  supplierSku: string;
  brand: string;
  productName: string;
  tyrePattern: string;
  tyreRating: string;
  tyreIndex: string;
  tyreSpecs: string;
  category: string;
  size: string;
  stockLocation: string;
  stockAvailability: string;
  stockUnits: number;
  costPrice: number;
  sellingPrice: number;
  sourceStockDetail: string;
}

export interface ManualSupplierParseResult {
  rows: ManualSupplierRow[];
  rejectedRows: number;
  warnings: string[];
  detectedColumns: string[];
}

type GridRow = unknown[];
type FieldName = 'sku' | 'description' | 'brand' | 'pattern' | 'rating' | 'index' | 'specs' | 'size' | 'quantity' | 'price' | 'costPrice' | 'sellingPrice' | 'location' | 'category';

const HEADER_ALIASES: Record<FieldName, string[]> = {
  sku: ['sku', 'code', 'itemcode', 'productcode', 'stockcode', 'sap', 'sapcode', 'material'],
  description: ['description', 'descrption', 'product', 'productname', 'item', 'itemdescription', 'tyredescription', 'brandandpattern', 'brandpattern', 'branddescription', 'patternanddescription'],
  brand: ['brand', 'tyrebrand', 'make'],
  pattern: ['pattern', 'tyrepattern', 'portalpattern', 'tread', 'model'],
  rating: ['rating', 'tyrerating', 'ply', 'plyrating', 'pr'],
  index: ['index', 'tyreindex', 'loadindex', 'speedindex', 'loadspeed', 'loadspeedindex', 'loadspeedrating'],
  specs: ['specs', 'tyrespecs', 'specifications', 'otherspecs', 'additionaldetails', 'sidewall', 'construction'],
  size: ['size', 'tyresize', 'dimensions'],
  quantity: ['quantity', 'qty', 'stock', 'stockqty', 'stockquantity', 'stockunits', 'unitsinstock', 'availableunits', 'availableqty', 'qtyavailable', 'available', 'availability', 'onhand', 'freeqty'],
  price: ['price', 'unitprice', 'pricevat', 'priceincvat', 'priceinclvat'],
  costPrice: ['cost', 'costprice', 'costvat', 'costincvat', 'costinclvat', 'costpriceincvat', 'costpriceinclvat', 'costpriceexvat', 'nett', 'nettprice', 'netprice', 'wholesale', 'buyprice', 'buyingprice', 'discountedprice', 'discountedpriceexvat', 'dealerprice', 'priceexvat'],
  sellingPrice: ['selling', 'sellingprice', 'sellingincvat', 'sellinginclvat', 'sellingpriceincvat', 'sellingpriceinclvat', 'sellingpriceexvat', 'roundedinclvatr25', 'retail', 'retailprice', 'retailpriceincvat', 'retailpriceinclvat', 'rrp', 'recommendedretail', 'recommendedretailprice'],
  location: ['location', 'branch', 'warehouse', 'stocklocation'],
  category: ['category', 'type', 'segment']
};

const normalizeHeader = (value: unknown) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, '');

const cleanCell = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

const parseNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = cleanCell(value)
    .replace(/\(([^)]+)\)/g, '-$1')
    .replace(/[^0-9.,-]+/g, '')
    .replace(/,(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return Number.NaN;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const parseStock = (value: unknown) => {
  const parsed = parseNumber(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : Number.NaN;
};

const WHEEL_SIZE = /\b(?:1[2-9]|2[0-6])\s*[Xx]\s*\d{1,2}(?:\.\d+)?\b/i;

const extractSize = (value: string) => {
  const tyreSize = extractSupplierTyreSize(value.replace(/\bHL(?=\d)/i, ''));
  if (tyreSize) return tyreSize;
  const wheelMatch = value.match(WHEEL_SIZE);
  return wheelMatch ? wheelMatch[0].replace(/\s+/g, '').toUpperCase() : '';
};

const toVatInclusivePrice = (value: number, alreadyIncludesVat: boolean) => (
  Number((Math.max(0, value) * (alreadyIncludesVat ? 1 : 1.15)).toFixed(2))
);

const stableIdentityHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
};

const sourceKeyFor = (catalog: SupplierImportCatalog, sku: string, size: string, productName: string, location: string) => {
  const rawIdentity = `${catalog}-${sku || `${size}-${productName}`}-${location}`.toLowerCase();
  const suffix = stableIdentityHash(rawIdentity);
  const base = rawIdentity
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const maxBaseLength = 180 - suffix.length - 1;
  return `${(base || `${catalog.toLowerCase()}-row`).slice(0, maxBaseLength)}-${suffix}`;
};

const fieldForHeader = (header: string): FieldName | null => {
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [FieldName, string[]][]) {
    if (aliases.includes(header)) return field;
  }
  return null;
};

const findHeader = (grid: GridRow[]) => {
  let best: { rowIndex: number; columns: Partial<Record<FieldName, number>>; score: number; headers: string[] } | null = null;

  grid.slice(0, 30).forEach((row, rowIndex) => {
    const columns: Partial<Record<FieldName, number>> = {};
    const headers = row.map(normalizeHeader);
    headers.forEach((header, columnIndex) => {
      const field = fieldForHeader(header);
      if (field && columns[field] === undefined) columns[field] = columnIndex;
    });
    const score = Object.keys(columns).length;
    const hasIdentity = columns.sku !== undefined || columns.description !== undefined || columns.size !== undefined;
    const hasStock = columns.quantity !== undefined;
    if (hasIdentity && hasStock && (!best || score > best.score)) {
      best = { rowIndex, columns, score, headers };
    }
  });

  return best;
};

export const normalizeManualSupplierGrid = (
  catalog: SupplierImportCatalog,
  grid: GridRow[]
): ManualSupplierParseResult => {
  const header = findHeader(grid);
  if (!header) {
    throw new Error('Could not identify a stock table. The document needs a Quantity/Stock column plus a Code, Description, or Size column.');
  }
  if (header.columns.price === undefined && header.columns.costPrice === undefined && header.columns.sellingPrice === undefined) {
    throw new Error('Could not identify a Price, Cost, Nett Price, or Selling Price column.');
  }

  const genericPriceHeader = header.columns.price === undefined ? '' : header.headers[header.columns.price] || '';
  const costPriceHeader = header.columns.costPrice === undefined ? '' : header.headers[header.columns.costPrice] || '';
  const sellingPriceHeader = header.columns.sellingPrice === undefined ? '' : header.headers[header.columns.sellingPrice] || '';
  const includesVat = (value: string) => /incvat|inclvat|includingvat|vatinclusive|pricevat/.test(value);
  const genericPriceIncludesVat = includesVat(genericPriceHeader);
  const costPriceIncludesVat = includesVat(costPriceHeader);
  const sellingPriceIncludesVat = includesVat(sellingPriceHeader);
  const supplierMeta = SUPPLIER_IMPORT_BY_CATALOG[catalog];
  const rows: ManualSupplierRow[] = [];
  const seen = new Set<string>();
  let rejectedRows = 0;

  const get = (row: GridRow, field: FieldName) => {
    const column = header.columns[field];
    return column === undefined ? '' : row[column];
  };

  grid.slice(header.rowIndex + 1).forEach((row) => {
    if (!row.some((cell) => cleanCell(cell))) return;
    const repeatedHeaderScore = row.map(normalizeHeader).filter((cell) => fieldForHeader(cell)).length;
    if (repeatedHeaderScore >= 3) return;

    const sku = cleanCell(get(row, 'sku'));
    const explicitBrand = cleanCell(get(row, 'brand'));
    const explicitPattern = cleanCell(get(row, 'pattern'));
    const explicitRating = cleanCell(get(row, 'rating'));
    const explicitIndex = cleanCell(get(row, 'index'));
    const explicitSpecs = cleanCell(get(row, 'specs'));
    const description = cleanCell(get(row, 'description'));
    const descriptionForParsing = description.replace(/\bHL(?=\d)/i, '');
    const explicitSize = cleanCell(get(row, 'size'));
    const joinedIdentity = [explicitSize, explicitBrand, explicitPattern, explicitRating, explicitIndex, explicitSpecs, description].filter(Boolean).join(' ');
    const parsedTyre = supplierMeta.productType === 'TYRE'
      ? parseSupplierTyreFields({
          description: descriptionForParsing,
          explicitSize,
          explicitBrand,
          explicitPattern,
          explicitRating,
          explicitIndex,
          explicitSpecs,
          inferBrandFromDescription: true
        })
      : null;
    const size = parsedTyre?.size
      || extractSize(explicitSize)
      || extractSize(description)
      || extractSize(joinedIdentity)
      || (/\d/.test(explicitSize) ? explicitSize.replace(/\s+/g, '').toUpperCase() : '');
    const stockUnits = parseStock(get(row, 'quantity'));
    const genericPrice = parseNumber(get(row, 'price'));
    const suppliedCost = parseNumber(get(row, 'costPrice'));
    const suppliedSelling = parseNumber(get(row, 'sellingPrice'));
    const hasGenericPrice = Number.isFinite(genericPrice);
    const hasCostPrice = Number.isFinite(suppliedCost);
    const hasSellingPrice = Number.isFinite(suppliedSelling);

    if ((!sku && !description && !size) || !size || !Number.isFinite(stockUnits) || (!hasGenericPrice && !hasCostPrice && !hasSellingPrice)) {
      rejectedRows += 1;
      return;
    }

    const descriptionWithoutSize = description.replace(WHEEL_SIZE, '').trim();
    const brand = parsedTyre
      ? parsedTyre.brand
      : explicitBrand || descriptionWithoutSize.split(/\s+/)[0] || supplierMeta.supplier;
    const tyrePattern = parsedTyre?.pattern || '';
    const tyreRating = parsedTyre?.rating || '';
    const tyreIndex = parsedTyre?.index || '';
    const tyreSpecs = parsedTyre?.specs || '';
    const productName = parsedTyre
      ? [brand, tyrePattern, tyreRating, tyreIndex, tyreSpecs].filter(Boolean).join(' ') || description || size
      : explicitPattern
        ? `${brand} ${explicitPattern}`.trim()
        : descriptionWithoutSize || `${brand} ${size}`;
    const stockLocation = cleanCell(get(row, 'location')) || supplierMeta.supplier;
    const costSource: [number, boolean] = hasCostPrice
      ? [suppliedCost, costPriceIncludesVat]
      : hasGenericPrice
        ? [genericPrice, genericPriceIncludesVat]
        : [suppliedSelling, sellingPriceIncludesVat];
    const sellingSource: [number, boolean] = hasSellingPrice
      ? [suppliedSelling, sellingPriceIncludesVat]
      : hasGenericPrice
        ? [genericPrice, genericPriceIncludesVat]
        : [suppliedCost, costPriceIncludesVat];
    const vatInclusiveCost = toVatInclusivePrice(...costSource);
    const vatInclusiveSelling = toVatInclusivePrice(...sellingSource);
    const sourceKey = sourceKeyFor(catalog, sku, size, productName, stockLocation);
    if (seen.has(sourceKey)) {
      rejectedRows += 1;
      return;
    }
    seen.add(sourceKey);

    rows.push({
      sourceKey,
      supplierSku: sku || sourceKey,
      brand,
      productName,
      tyrePattern,
      tyreRating,
      tyreIndex,
      tyreSpecs,
      category: cleanCell(get(row, 'category')) || (supplierMeta.productType === 'WHEEL' ? 'Wheels' : 'Tyres'),
      size,
      stockLocation,
      stockAvailability: stockUnits > 0 ? 'In stock' : 'Out of stock',
      stockUnits,
      costPrice: vatInclusiveCost,
      sellingPrice: vatInclusiveSelling,
      sourceStockDetail: cleanCell(get(row, 'quantity'))
    });
  });

  if (!rows.length) {
    throw new Error('No valid tyre stock rows were extracted. Check that size, quantity, and price are present in the document.');
  }

  const detectedColumns = Object.keys(header.columns);
  const warnings = rejectedRows > 0 ? [`${rejectedRows} row${rejectedRows === 1 ? '' : 's'} could not be safely imported.`] : [];
  if (
    (header.columns.costPrice !== undefined && !costPriceIncludesVat)
    || (header.columns.sellingPrice !== undefined && !sellingPriceIncludesVat)
    || (header.columns.price !== undefined && !genericPriceIncludesVat)
  ) warnings.push('15% VAT will be added to price columns that are not marked VAT-inclusive.');

  return { rows, rejectedRows, warnings, detectedColumns };
};

export const parseCsvGrid = (text: string): string[][] => {
  const sample = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 10);
  const countDelimiter = (line: string, candidate: string) => {
    let quoted = false;
    let count = 0;
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] === '"') quoted = !quoted;
      else if (!quoted && line[index] === candidate) count += 1;
    }
    return count;
  };
  const delimiter = [',', ';', '\t', '|']
    .map((candidate) => ({ candidate, score: sample.reduce((total, line) => total + countDelimiter(line, candidate), 0) }))
    .sort((left, right) => right.score - left.score)[0]?.candidate || ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted && char === '"' && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
};

const readPdfGrid = async (file: File): Promise<GridRow[]> => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const rows: GridRow[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = new Map<number, { x: number; text: string }[]>();
    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      const text = cleanCell(item.str);
      if (!text || !item.transform) continue;
      const x = item.transform[4] || 0;
      const y = Math.round((item.transform[5] || 0) / 3) * 3;
      const line = lines.get(y) || [];
      line.push({ x, text });
      lines.set(y, line);
    }
    [...lines.entries()]
      .sort(([left], [right]) => right - left)
      .forEach(([, cells]) => rows.push(cells.sort((left, right) => left.x - right.x).map((cell) => cell.text)));
  }

  if (!rows.length) throw new Error('This PDF contains no selectable text. Upload the supplier CSV/Excel file or a text-based PDF.');
  return rows;
};

export const parseManualSupplierFile = async (
  catalog: SupplierImportCatalog,
  file: File
): Promise<ManualSupplierParseResult> => {
  if (file.size > 20 * 1024 * 1024) throw new Error('The supplier document must be 20 MB or smaller.');
  const lowerName = file.name.toLowerCase();
  let grid: GridRow[];

  if (lowerName.endsWith('.pdf')) {
    grid = await readPdfGrid(file);
  } else if (lowerName.endsWith('.csv')) {
    grid = parseCsvGrid(await file.text());
  } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    const XLSX = await import('@e965/xlsx');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const candidates = workbook.SheetNames.flatMap((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return [];
      const sheetGrid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as GridRow[];
      try {
        return [{ sheetName, result: normalizeManualSupplierGrid(catalog, sheetGrid) }];
      } catch {
        return [];
      }
    }).sort((left, right) => right.result.rows.length - left.result.rows.length);
    const best = candidates[0];
    if (!best) throw new Error('No worksheet contains a recognizable supplier stock table.');
    if (best.sheetName !== workbook.SheetNames[0]) {
      best.result.warnings.unshift(`Stock table detected on worksheet “${best.sheetName}”.`);
    }
    return best.result;
  } else {
    throw new Error('Upload a PDF, CSV, XLS, or XLSX supplier document.');
  }

  return normalizeManualSupplierGrid(catalog, grid);
};

const readJson = async (response: Response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || 'The server returned an invalid response.' };
  }
};

export const publishManualSupplierRows = async (
  catalog: SupplierImportCatalog,
  terminal: string,
  sourceFile: string,
  rows: ManualSupplierRow[]
) => {
  const response = await fetch('/api/manual-supplier-import', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ catalog, terminal, sourceFile, rows })
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(data.error || 'The supplier document could not be imported.');
  return data;
};
