import type { ManualSupplierCatalog } from './supplierCatalogMapping';

export interface ManualSupplierRow {
  sourceKey: string;
  supplierSku: string;
  brand: string;
  productName: string;
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
type FieldName = 'sku' | 'description' | 'brand' | 'pattern' | 'size' | 'quantity' | 'price' | 'location' | 'category';

const HEADER_ALIASES: Record<FieldName, string[]> = {
  sku: ['sku', 'code', 'itemcode', 'productcode', 'stockcode', 'sap', 'sapcode', 'material'],
  description: ['description', 'descrption', 'product', 'productname', 'item', 'itemdescription', 'tyredescription'],
  brand: ['brand', 'make'],
  pattern: ['pattern', 'tread', 'model'],
  size: ['size', 'tyresize', 'dimensions'],
  quantity: ['quantity', 'qty', 'stock', 'stockqty', 'stockquantity', 'available', 'availability', 'onhand', 'freeqty'],
  price: ['price', 'cost', 'costvat', 'nett', 'nettprice', 'netprice', 'wholesale', 'sellingprice', 'unitprice'],
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
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const parseStock = (value: unknown) => {
  const parsed = parseNumber(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : Number.NaN;
};

const TYRE_SIZE = /\b(?:\d{2,3}\s*\/\s*\d{2,3}\s*(?:ZR|RF|R)\s*\d{2}(?:\.\d)?|\d{2,3}\s*[Xx]\s*\d{1,2}(?:\.\d+)?\s*R\s*\d{2}(?:\.\d)?|\d{3}\s*R\s*\d{2}(?:\.\d)?|\d{3}\s*-\s*\d{2}(?:\.\d)?)\w*\b/i;

const extractSize = (value: string) => {
  const match = value.match(TYRE_SIZE);
  return match ? match[0].replace(/\s+/g, '').toUpperCase() : '';
};

const sourceKeyFor = (catalog: ManualSupplierCatalog, sku: string, size: string, productName: string) => {
  const value = `${catalog}-${sku || `${size}-${productName}`}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  return value || `${catalog.toLowerCase()}-row`;
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
  catalog: ManualSupplierCatalog,
  grid: GridRow[]
): ManualSupplierParseResult => {
  const header = findHeader(grid);
  if (!header) {
    throw new Error('Could not identify a stock table. The document needs a Quantity/Stock column plus a Code, Description, or Size column.');
  }
  if (header.columns.price === undefined) {
    throw new Error('Could not identify a Price, Cost, or Nett Price column.');
  }

  const priceHeader = header.headers[header.columns.price] || '';
  const priceIncludesVat = /incvat|includingvat|vatinclusive|pricevat/.test(priceHeader);
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
    const description = cleanCell(get(row, 'description'));
    const explicitSize = cleanCell(get(row, 'size'));
    const joinedIdentity = [explicitSize, explicitBrand, explicitPattern, description].filter(Boolean).join(' ');
    const size = extractSize(explicitSize) || extractSize(description) || extractSize(joinedIdentity);
    const stockUnits = parseStock(get(row, 'quantity'));
    const suppliedPrice = parseNumber(get(row, 'price'));

    if ((!sku && !description && !size) || !size || !Number.isFinite(stockUnits) || !Number.isFinite(suppliedPrice)) {
      rejectedRows += 1;
      return;
    }

    const descriptionWithoutSize = description.replace(TYRE_SIZE, '').trim();
    const brand = explicitBrand || (catalog === 'SAILUN'
      ? 'Sailun'
      : descriptionWithoutSize.split(/\s+/)[0] || 'Safety Grip');
    const productName = explicitPattern
      ? `${brand} ${explicitPattern}`.trim()
      : descriptionWithoutSize || `${brand} ${size}`;
    const vatInclusivePrice = Number((Math.max(0, suppliedPrice) * (priceIncludesVat ? 1 : 1.15)).toFixed(2));
    const sourceKey = sourceKeyFor(catalog, sku, size, productName);
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
      category: cleanCell(get(row, 'category')) || catalog.replace('_', ' '),
      size,
      stockLocation: cleanCell(get(row, 'location')) || catalog.replace('_', ' '),
      stockAvailability: stockUnits > 0 ? 'In stock' : 'Out of stock',
      stockUnits,
      costPrice: vatInclusivePrice,
      sellingPrice: vatInclusivePrice,
      sourceStockDetail: cleanCell(get(row, 'quantity'))
    });
  });

  if (!rows.length) {
    throw new Error('No valid tyre stock rows were extracted. Check that size, quantity, and price are present in the document.');
  }

  const detectedColumns = Object.keys(header.columns);
  const warnings = rejectedRows > 0 ? [`${rejectedRows} row${rejectedRows === 1 ? '' : 's'} could not be safely imported.`] : [];
  if (!priceIncludesVat) warnings.push('15% VAT will be added to the supplied price column.');

  return { rows, rejectedRows, warnings, detectedColumns };
};

export const parseCsvGrid = (text: string): string[][] => {
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
    } else if (!quoted && char === ',') {
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
  catalog: ManualSupplierCatalog,
  file: File
): Promise<ManualSupplierParseResult> => {
  const lowerName = file.name.toLowerCase();
  let grid: GridRow[];

  if (lowerName.endsWith('.pdf')) {
    grid = await readPdfGrid(file);
  } else if (lowerName.endsWith('.csv')) {
    grid = parseCsvGrid(await file.text());
  } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    const XLSX = await import('@e965/xlsx');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) throw new Error('The workbook does not contain a worksheet.');
    grid = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false, defval: '' }) as GridRow[];
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
  catalog: ManualSupplierCatalog,
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
