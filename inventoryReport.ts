import type { jsPDF } from 'jspdf';
import {
  BatteryProduct,
  CoiloverProduct,
  InventoryItem,
  ProductType,
  TyreProduct,
  WheelProduct
} from './types';
import { normalizeStockByLocation, parseStockLocationSummary, sortStockLocationEntries } from './stockLocation';

export type InventoryReportGroupMode = 'none' | 'location' | 'brand' | 'type';

export interface InventoryReportVisibility {
  visual: boolean;
  type: boolean;
  mainSpec: boolean;
  brandModel: boolean;
  specs: boolean;
  location: boolean;
  quantity: boolean;
  cost: boolean;
  sellingPrice: boolean;
}

export interface InventoryReportContext {
  catalogueLabel: string;
  searchQuery: string;
  generatedAt: string;
  resultCount: number;
  showSupplierName: boolean;
  visibility: InventoryReportVisibility;
  priceLabel?: string;
}

export interface InventoryReportRow {
  id: string;
  groupLabel?: string;
  imageUrl?: string;
  type: string;
  mainSpec: string;
  brandModel: string;
  details: string;
  location: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
}

export interface BuildInventoryReportRowsOptions {
  groupBy?: InventoryReportGroupMode;
  showSupplierName?: boolean;
  imageUrls?: Record<string, string>;
}

interface CreateInventoryReportOptions {
  rows: InventoryReportRow[];
  context: InventoryReportContext;
  logoUrl: string;
  onProgress?: (completed: number, total: number) => void;
}

type ReportColumnKey = 'visual' | 'type' | 'mainSpec' | 'brandModel' | 'details' | 'location' | 'quantity' | 'costPrice' | 'sellingPrice';

interface ReportColumn {
  key: ReportColumnKey;
  label: string;
  weight: number;
  align?: 'left' | 'right' | 'center';
}

interface LoadedImage {
  dataUrl: string;
  format: string;
}

const INVALID_DISPLAY_VALUE = /^(?:-|n\/?a|none|null|unknown|standard)$/i;

const cleanPart = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

const uniqueParts = (parts: unknown[]): string[] => {
  const seen = new Set<string>();
  return parts.map(cleanPart).filter((part) => {
    const key = part.toLowerCase();
    if (!key || INVALID_DISPLAY_VALUE.test(part) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const removeWholePart = (value: string, part: string): string => {
  if (!value || !part) return value;
  const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'gi'), ' ').replace(/\s+/g, ' ').trim();
};

const cleanTyrePattern = (tyre: TyreProduct): string => {
  let pattern = cleanPart(tyre.pattern);
  pattern = removeWholePart(pattern, cleanPart(tyre.size));
  pattern = removeWholePart(pattern, cleanPart(tyre.brand));
  return pattern.replace(/\s+\b(?:TYRE|TIRE)\b$/i, '').trim();
};

const wheelBrand = (wheel: WheelProduct): string => (
  cleanPart(wheel.brand) || cleanPart(wheel.colour).split('|')[0]?.trim() || ''
);

const wheelFinish = (wheel: WheelProduct): string => {
  if (cleanPart(wheel.finish)) return cleanPart(wheel.finish);
  const colourParts = cleanPart(wheel.colour).split('|').map((part) => part.trim()).filter(Boolean);
  return cleanPart(wheel.imageFinishKey || colourParts[1] || wheel.colour);
};

const wheelName = (wheel: WheelProduct): string => cleanPart(wheel.imageDesignKey || wheel.code || 'Wheel');

const formatOffset = (value: string): string => {
  const offset = cleanPart(value).replace(/^ET\s*/i, '').replace(/^--/, '-');
  return offset ? `ET ${offset}` : '';
};

const getRawLocation = (item: InventoryItem): string => {
  if (item.type === ProductType.TYRE) return cleanPart((item as TyreProduct).location);
  if (item.type === ProductType.WHEEL) return cleanPart((item as WheelProduct).location);
  return '';
};

export const getInventoryReportLocation = (item: InventoryItem): string => {
  const stockByLocation = normalizeStockByLocation(item.stockByLocation);
  const entries = Object.keys(stockByLocation).length
    ? sortStockLocationEntries(stockByLocation)
    : sortStockLocationEntries(parseStockLocationSummary(getRawLocation(item)));
  const availableEntries = entries.filter(([, quantity]) => quantity > 0);
  if (availableEntries.length) return availableEntries.map(([location, quantity]) => `${location}: ${quantity}`).join(' | ');
  return getRawLocation(item) || (entries.length ? 'No branch stock' : 'General stock');
};

const getGroupLabel = (item: InventoryItem, groupBy: InventoryReportGroupMode): string | undefined => {
  if (groupBy === 'none') return undefined;
  if (groupBy === 'type') return item.type;
  if (groupBy === 'location') return getInventoryReportLocation(item).toUpperCase();
  if (item.type === ProductType.TYRE) return cleanPart((item as TyreProduct).brand).toUpperCase() || 'UNKNOWN';
  if (item.type === ProductType.WHEEL) return wheelBrand(item as WheelProduct).toUpperCase() || 'UNKNOWN';
  if (item.type === ProductType.COILOVER) return cleanPart((item as CoiloverProduct).brand).toUpperCase() || 'UNKNOWN';
  return 'DIXON BATTERIES';
};

const supplierDetail = (item: InventoryItem, showSupplierName: boolean): string => (
  showSupplierName && cleanPart(item.supplierName) ? `Supplier: ${cleanPart(item.supplierName)}` : ''
);

export const mapInventoryItemToReportRow = (
  item: InventoryItem,
  options: BuildInventoryReportRowsOptions = {}
): InventoryReportRow => {
  const common = {
    id: item.id,
    groupLabel: getGroupLabel(item, options.groupBy ?? 'none'),
    imageUrl: options.imageUrls?.[item.id],
    quantity: Math.max(0, Math.round(Number(item.quantity) || 0)),
    costPrice: Number(item.costPrice) || 0,
    sellingPrice: Number(item.sellingPrice) || 0
  };
  const supplier = supplierDetail(item, Boolean(options.showSupplierName));

  if (item.type === ProductType.TYRE) {
    const tyre = item as TyreProduct;
    const pattern = cleanTyrePattern(tyre);
    return {
      ...common,
      type: 'Tyre',
      mainSpec: cleanPart(tyre.size) || '-',
      brandModel: uniqueParts([tyre.brand, pattern]).join(' / ') || '-',
      details: uniqueParts([
        tyre.tyreRating,
        tyre.tyreIndex,
        tyre.loadSpeedIndex,
        tyre.tyreSpecs,
        item.supplierLeadTime ? `Lead time: ${item.supplierLeadTime}` : '',
        supplier
      ]).join(' | ') || '-',
      location: getInventoryReportLocation(item)
    };
  }

  if (item.type === ProductType.WHEEL) {
    const wheel = item as WheelProduct;
    return {
      ...common,
      type: 'Wheel',
      mainSpec: cleanPart(wheel.size) || '-',
      brandModel: uniqueParts([wheelBrand(wheel), wheelName(wheel)]).join(' / ') || '-',
      details: uniqueParts([
        wheelFinish(wheel),
        wheel.pcd ? `PCD ${cleanPart(wheel.pcd)}` : '',
        formatOffset(wheel.offset),
        wheel.centerBore ? `CB ${cleanPart(wheel.centerBore)}` : '',
        supplier
      ]).join(' | ') || '-',
      location: getInventoryReportLocation(item)
    };
  }

  if (item.type === ProductType.COILOVER) {
    const coilover = item as CoiloverProduct;
    return {
      ...common,
      type: 'Coilover',
      mainSpec: cleanPart(coilover.vehicleCompatibility) || '-',
      brandModel: uniqueParts([coilover.brand, coilover.series]).join(' / ') || '-',
      details: uniqueParts([supplier]).join(' | ') || '-',
      location: 'General stock'
    };
  }

  const battery = item as BatteryProduct;
  return {
    ...common,
    type: 'Battery',
    mainSpec: cleanPart(battery.batteryType) || '-',
    brandModel: cleanPart(battery.batteryDescription) || '-',
    details: uniqueParts([supplier]).join(' | ') || '-',
    location: 'General stock'
  };
};

export const buildInventoryReportRows = (
  items: InventoryItem[],
  options: BuildInventoryReportRowsOptions = {}
): InventoryReportRow[] => items.map((item) => mapInventoryItemToReportRow(item, options));

export const sanitizeInventoryReportFileSegment = (value: string): string => cleanPart(value)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase()
  .slice(0, 48);

export const getInventoryReportFileName = (context: Pick<InventoryReportContext, 'catalogueLabel' | 'searchQuery' | 'generatedAt'>): string => {
  const catalogue = sanitizeInventoryReportFileSegment(context.catalogueLabel) || 'stock';
  const search = sanitizeInventoryReportFileSegment(context.searchQuery);
  const date = new Date(context.generatedAt);
  const dateKey = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
  return `gp-tyres-inventory-${catalogue}${search ? `-${search}` : ''}-${dateKey}.pdf`;
};

export const formatInventoryReportCurrency = (amount: number): string => (
  `R ${Math.round(Number(amount) || 0).toLocaleString('en-ZA')}`.replace(/\u00a0/g, ' ')
);

const getImageFormat = (mimeType: string, source: string): string => {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('png') || /\.png(?:$|\?)/i.test(source)) return 'PNG';
  if (normalized.includes('webp') || /\.webp(?:$|\?)/i.test(source)) return 'WEBP';
  return 'JPEG';
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

const loadImage = async (url: string): Promise<LoadedImage | null> => {
  if (!url) return null;
  try {
    if (url.startsWith('data:')) {
      const mimeType = url.slice(5, url.indexOf(';'));
      return { dataUrl: url, format: getImageFormat(mimeType, url) };
    }
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return {
      dataUrl: `data:${blob.type};base64,${bytesToBase64(bytes)}`,
      format: getImageFormat(blob.type, url)
    };
  } catch {
    return null;
  }
};

const loadUniqueImages = async (
  urls: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, LoadedImage | null>> => {
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));
  const images = new Map<string, LoadedImage | null>();
  let cursor = 0;
  let completed = 0;
  const worker = async () => {
    while (cursor < uniqueUrls.length) {
      const index = cursor;
      cursor += 1;
      const url = uniqueUrls[index];
      images.set(url, await loadImage(url));
      completed += 1;
      onProgress?.(completed, uniqueUrls.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, uniqueUrls.length) }, () => worker()));
  return images;
};

export const getInventoryReportColumns = (
  context: InventoryReportContext,
  rows: InventoryReportRow[] = []
): ReportColumn[] => {
  const columns: ReportColumn[] = [];
  if (context.visibility.visual) columns.push({ key: 'visual', label: 'Visual', weight: 0.8, align: 'center' });
  if (context.visibility.type) columns.push({ key: 'type', label: 'Type', weight: 0.65 });
  if (context.visibility.mainSpec) columns.push({ key: 'mainSpec', label: 'Main Spec', weight: 1.15 });
  if (context.visibility.brandModel) columns.push({ key: 'brandModel', label: 'Brand / Model', weight: 2.05 });
  const hasMeaningfulDetails = rows.length === 0 || rows.some((row) => {
    const details = cleanPart(row.details);
    return Boolean(details && details !== '-');
  });
  if (context.visibility.specs && hasMeaningfulDetails) {
    columns.push({ key: 'details', label: 'Details', weight: 2.25 });
  }
  if (context.visibility.location) columns.push({ key: 'location', label: 'Location', weight: 1.65 });
  if (context.visibility.quantity) columns.push({ key: 'quantity', label: 'Qty', weight: 0.5, align: 'right' });
  if (context.visibility.cost) columns.push({ key: 'costPrice', label: 'Cost', weight: 0.95, align: 'right' });
  if (context.visibility.sellingPrice) columns.push({ key: 'sellingPrice', label: context.priceLabel || 'Selling Price', weight: 1.15, align: 'right' });
  return columns;
};

const getRowValue = (row: InventoryReportRow, key: ReportColumnKey): string => {
  if (key === 'quantity') return String(row.quantity);
  if (key === 'costPrice') return formatInventoryReportCurrency(row.costPrice);
  if (key === 'sellingPrice') return formatInventoryReportCurrency(row.sellingPrice);
  if (key === 'visual') return '';
  return cleanPart(row[key]) || '-';
};

const fitImage = (doc: jsPDF, image: LoadedImage, maxWidth: number, maxHeight: number): { width: number; height: number } => {
  try {
    const properties = doc.getImageProperties(image.dataUrl);
    const scale = Math.min(maxWidth / properties.width, maxHeight / properties.height);
    return { width: properties.width * scale, height: properties.height * scale };
  } catch {
    return { width: maxWidth, height: maxHeight };
  }
};

export const createInventoryReport = async ({ rows, context, logoUrl, onProgress }: CreateInventoryReportOptions) => {
  const [{ jsPDF }, logo, images] = await Promise.all([
    import('jspdf'),
    loadImage(logoUrl),
    context.visibility.visual
      ? loadUniqueImages(rows.map((row) => row.imageUrl || ''), onProgress)
      : Promise.resolve(new Map<string, LoadedImage | null>())
  ]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 24;
  const footerHeight = 27;
  const tableWidth = pageWidth - margin * 2;
  const columns = getInventoryReportColumns(context, rows);
  const weightTotal = columns.reduce((total, column) => total + column.weight, 0);
  const widths = columns.map((column) => tableWidth * (column.weight / weightTotal));
  let y = 0;
  let activeGroup = '';

  const drawPageHeader = () => {
    doc.setFillColor(17, 17, 17);
    doc.rect(0, 0, pageWidth, 68, 'F');
    if (logo) {
      try { doc.addImage(logo.dataUrl, logo.format, margin, 11, 100, 44); } catch { /* Keep the report usable without the logo. */ }
    }
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text('INVENTORY STOCK SHEET', pageWidth - margin, 27, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(215, 215, 215);
    doc.text(context.catalogueLabel.toUpperCase(), pageWidth - margin, 43, { align: 'right' });
    doc.text(`${context.resultCount} result${context.resultCount === 1 ? '' : 's'}`, pageWidth - margin, 55, { align: 'right' });

    const generated = new Intl.DateTimeFormat('en-ZA', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(context.generatedAt));
    doc.setFillColor(248, 248, 248);
    doc.rect(0, 68, pageWidth, 35, 'F');
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('SEARCH', margin, 82);
    doc.setFont('helvetica', 'normal');
    doc.text(context.searchQuery.trim() || 'All matching stock', margin + 42, 82);
    doc.setFont('helvetica', 'bold');
    doc.text('GENERATED', margin, 95);
    doc.setFont('helvetica', 'normal');
    doc.text(generated, margin + 52, 95);
    y = 111;
  };

  const drawTableHeader = () => {
    let x = margin;
    doc.setFillColor(37, 37, 37);
    doc.rect(margin, y, tableWidth, 20, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    columns.forEach((column, index) => {
      const align = column.align || 'left';
      const textX = align === 'right' ? x + widths[index] - 4 : align === 'center' ? x + widths[index] / 2 : x + 4;
      doc.text(column.label.toUpperCase(), textX, y + 13, { align });
      x += widths[index];
    });
    y += 20;
  };

  const startPage = (continuedGroup?: string) => {
    drawPageHeader();
    drawTableHeader();
    if (continuedGroup) {
      doc.setFillColor(238, 26, 32);
      doc.rect(margin, y, tableWidth, 15, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text(`${continuedGroup} (CONTINUED)`, margin + 5, y + 10);
      y += 15;
    }
  };

  const nextPage = (continuedGroup?: string) => {
    doc.addPage();
    startPage(continuedGroup);
  };

  const drawGroup = (label: string) => {
    if (y + 17 > pageHeight - footerHeight) nextPage();
    doc.setFillColor(238, 26, 32);
    doc.rect(margin, y, tableWidth, 16, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(label.toUpperCase(), margin + 5, y + 11);
    y += 16;
  };

  startPage();
  rows.forEach((row, rowIndex) => {
    if (row.groupLabel && row.groupLabel !== activeGroup) {
      activeGroup = row.groupLabel;
      drawGroup(activeGroup);
    }
    const wrapped = columns.map((column, index) => {
      if (column.key === 'visual') return [] as string[];
      return doc.splitTextToSize(getRowValue(row, column.key), Math.max(12, widths[index] - 8)) as string[];
    });
    const textHeight = Math.max(0, ...wrapped.map((lines) => lines.length * 7 + 8));
    const rowHeight = Math.max(context.visibility.visual ? 43 : 21, textHeight);
    if (y + rowHeight > pageHeight - footerHeight) nextPage(activeGroup || undefined);

    let x = margin;
    doc.setFillColor(rowIndex % 2 === 0 ? 247 : 239, rowIndex % 2 === 0 ? 247 : 239, rowIndex % 2 === 0 ? 247 : 239);
    doc.rect(margin, y, tableWidth, rowHeight, 'F');
    doc.setDrawColor(218, 218, 218);
    doc.setLineWidth(0.4);
    columns.forEach((column, index) => {
      doc.rect(x, y, widths[index], rowHeight);
      if (column.key === 'visual') {
        const loadedImage = row.imageUrl ? images.get(row.imageUrl) : null;
        if (loadedImage) {
          const fitted = fitImage(doc, loadedImage, Math.max(10, widths[index] - 8), rowHeight - 8);
          try {
            doc.addImage(
              loadedImage.dataUrl,
              loadedImage.format,
              x + (widths[index] - fitted.width) / 2,
              y + (rowHeight - fitted.height) / 2,
              fitted.width,
              fitted.height
            );
          } catch { /* The placeholder below is preferable to failing the report. */ }
        }
        if (!loadedImage) {
          doc.setFillColor(226, 226, 226);
          doc.roundedRect(x + 5, y + 5, Math.max(8, widths[index] - 10), rowHeight - 10, 2, 2, 'F');
          doc.setTextColor(125, 125, 125);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(5.5);
          doc.text('NO VISUAL', x + widths[index] / 2, y + rowHeight / 2 + 2, { align: 'center' });
        }
      } else {
        const align = column.align || 'left';
        const textX = align === 'right' ? x + widths[index] - 4 : align === 'center' ? x + widths[index] / 2 : x + 4;
        doc.setFont('helvetica', column.key === 'mainSpec' || column.key === 'sellingPrice' ? 'bold' : 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(35, 35, 35);
        doc.text(wrapped[index], textX, y + 10, { align, lineHeightFactor: 1.08 });
      }
      x += widths[index];
    });
    y += rowHeight;
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(210, 210, 210);
    doc.line(margin, pageHeight - 21, pageWidth - margin, pageHeight - 21);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(95, 95, 95);
    doc.text('GP Tyres & Mags - Inventory Tracker', margin, pageHeight - 10);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
  }

  return {
    doc,
    fileName: getInventoryReportFileName(context),
    pageCount,
    rowCount: rows.length,
    headerCount: pageCount
  };
};
