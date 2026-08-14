
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { BatteryProduct, InventoryItem, ProductType, TyreProduct, WheelProduct, CoiloverProduct, ViewMode } from '../types';
import { formatCurrency, getStatusColor } from '../utils';
import {
  buildStaffSupplierWheelImageUploadPayload,
  buildStaffSupplierTyreImageUploadPayload,
  buildSupplierImageMap,
  clearSupplierStockImageCache,
  fetchSupplierStockImages,
  inventoryItemToSupplierImageLookup,
  supplierTyreMatchesUploadKeys,
  supplierWheelMatchesUploadKeys
} from '../supplierStockImages';
import { supabase } from '../supabaseClient';
import {
  normalizeStockByLocation,
  parseStockLocationSummary,
  sortStockLocationEntries
} from '../stockLocation';
import { type SupplierMarkupAdjustment } from '../supplierMarkup';
import { type InventoryReportGroupMode } from '../inventoryReport';
import { TERMINAL_STAFF_NAMES } from '../trainingProgress';
import { InventoryReportModal } from './InventoryReportModal';
import { SupplierMarkupAdjuster } from './SupplierMarkupAdjuster';

interface InventoryViewProps {
  items: InventoryItem[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  isAdmin: boolean;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  onSell: (item: InventoryItem) => void;
  onReserve: (item: InventoryItem) => void;
  onBulkDelete: (ids: string[]) => void;
  isReadOnly?: boolean; // New Prop for Supplier Views
  showSupplierName?: boolean;
  currentUser?: string | null;
  priceLabel?: string;
  emptyStateTitle?: string;
  emptyStateDetail?: string;
  reportCatalogueLabel?: string;
  reportSearchQuery?: string;
  currentUser?: string | null;
  markupAdjustment?: SupplierMarkupAdjustment;
  onMarkupAdjustmentChange?: (adjustment: SupplierMarkupAdjustment) => void;
}

// --- CONFIG TYPES ---
type SortKey = 'brand' | 'size' | 'quantity' | 'price' | 'location';
type SortDirection = 'asc' | 'desc';
type GroupMode = 'none' | 'location' | 'brand' | 'type';
type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '9:16' | '16:9' | '21:9';
const RENDER_CHUNK_SIZE = 120;

interface VisibleColumns {
  specs: boolean;
  location: boolean;
  price: boolean;
  cost: boolean;
}

// --- HELPER FUNCTIONS ---
const getSortValue = (item: InventoryItem, key: SortKey): string | number => {
  if (key === 'quantity') return item.quantity;
  if (key === 'price') return item.sellingPrice;
  
  if (key === 'brand') {
    if (item.type === ProductType.TYRE) return (item as TyreProduct).brand;
    if (item.type === ProductType.WHEEL) return (item as WheelProduct).code; 
    if (item.type === ProductType.COILOVER) return (item as CoiloverProduct).brand;
    if (item.type === ProductType.BATTERY) return (item as BatteryProduct).batteryDescription;
  }
  
  if (key === 'location') {
    if (item.type === ProductType.TYRE) return (item as TyreProduct).location || 'Unknown';
    if (item.type === ProductType.WHEEL) return (item as WheelProduct).location || 'Unknown';
    return 'General';
  }
  
  if (key === 'size') {
     if (item.type === ProductType.TYRE) return (item as TyreProduct).size;
     if (item.type === ProductType.WHEEL) return (item as WheelProduct).size;
     if (item.type === ProductType.COILOVER) return (item as CoiloverProduct).vehicleCompatibility;
     if (item.type === ProductType.BATTERY) return (item as BatteryProduct).batteryType;
  }
  
  return '';
};

const getWheelDisplayName = (wheel: WheelProduct): string => (
  wheel.imageDesignKey || wheel.code || wheel.size || 'Wheel'
);

const isSupplierTyre = (item: InventoryItem): item is TyreProduct => (
  item.type === ProductType.TYRE && Boolean((item as TyreProduct).supplierName)
);

const isSupplierWheel = (item: InventoryItem): item is WheelProduct => (
  item.type === ProductType.WHEEL && Boolean((item as WheelProduct).supplierName)
);

export const getItemSupplierName = (item: InventoryItem): string => (
  String(item.supplierName || '').trim().toUpperCase()
);

export const isSpecialItem = (item: InventoryItem): boolean => (
  item.type === ProductType.TYRE && /\bSPECIAL\b/i.test((item as TyreProduct).tyreSpecs || '')
);

const uniqueDisplayParts = (parts: Array<string | undefined>) => {
  const seen = new Set<string>();
  return parts.map((part) => String(part || '').trim()).filter((part) => {
    const key = part.toLowerCase();
    if (!key || /^(?:-|n\/?a|none|null|unknown|standard)$/.test(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getItemDisplayName = (item: InventoryItem): string => {
  if (item.type === ProductType.TYRE) {
    const tyre = item as TyreProduct;
    if (isSupplierTyre(item)) {
      return uniqueDisplayParts([tyre.size, tyre.brand, tyre.pattern]).join(' ');
    }
    return tyre.size;
  }
  if (item.type === ProductType.WHEEL) return getWheelDisplayName(item as WheelProduct);
  return (item as CoiloverProduct).vehicleCompatibility;
};

const getWheelBrand = (wheel: WheelProduct): string => {
  if (wheel.brand?.trim()) return wheel.brand.trim();
  return String(wheel.colour || '').split('|')[0]?.trim() || '';
};

export const getItemSecondaryLine = (item: InventoryItem): string => {
  if (item.type === ProductType.TYRE) {
    const tyre = item as TyreProduct;
    if (isSupplierTyre(item)) {
      return uniqueDisplayParts([
        tyre.tyreRating,
        tyre.tyreIndex,
        tyre.tyreSpecs,
        (!tyre.tyreRating && !tyre.tyreIndex && !tyre.tyreSpecs) ? tyre.loadSpeedIndex : undefined
      ]).join(' / ');
    }
    return `${tyre.brand} ${tyre.pattern}`.trim();
  }
  if (item.type === ProductType.WHEEL) {
    const wheel = item as WheelProduct;
    return uniqueDisplayParts([
      getWheelBrand(wheel),
      getWheelFinish(wheel),
      wheel.size,
      formatWheelPcd(wheel.pcd),
      formatWheelOffset(wheel.offset),
      wheel.centerBore ? `CB ${wheel.centerBore}` : ''
    ]).join(' / ');
  }
  const coilover = item as CoiloverProduct;
  return `${coilover.brand} ${coilover.series}`.trim();
};

const getDragFileName = (item: InventoryItem): string => (
  `${getItemDisplayName(item).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'gp-wheel'}.jpg`
);

const cleanCustomerCopyPart = (value: string | undefined): string => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const removeCopyPart = (value: string, part: string): string => {
  if (!value || !part) return value;
  const escapedPart = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value
    .replace(new RegExp(`(^|\\s)${escapedPart}(?=\\s|$)`, 'gi'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const getCleanTyreClipboardParts = (tyre: TyreProduct) => {
  const size = cleanCustomerCopyPart(tyre.size);
  const brand = cleanCustomerCopyPart(tyre.brand).replace(/^(?:UNKNOWN|STANDARD|N\/?A|-)+$/, '');
  let pattern = cleanCustomerCopyPart(tyre.pattern);
  pattern = removeCopyPart(pattern, size);
  pattern = removeCopyPart(pattern, brand)
    .replace(/\s+\b(?:TYRE|TIRE)\b$/i, '')
    .replace(/^(?:UNKNOWN|STANDARD|N\/?A|-)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { size, brand, pattern };
};

const getTyreClipboardText = (item: InventoryItem): string => {
  if (item.type !== ProductType.TYRE) return '';
  const tyre = item as TyreProduct;
  const { size, brand, pattern } = getCleanTyreClipboardParts(tyre);
  return [size, brand, pattern, `@ R${Math.round(item.sellingPrice)}`]
    .filter(Boolean)
    .join(' ');
};

const formatWheelPcd = (value: string | undefined): string => (
  String(value || '').trim().replace(/\//g, 'X').replace(/\s+/g, '').toUpperCase()
);

const formatWheelOffset = (value: string | undefined): string => {
  const offset = String(value || '').trim().replace(/^ET\s*/i, '').replace(/^--/, '-');
  return offset ? `ET${offset}` : '';
};

const splitWheelSize = (value: string | undefined): { diameter: string; width: string } => {
  const match = String(value || '').trim().match(/(\d{2}(?:\.\d+)?)\s*(?:x|X)\s*(\d+(?:\.\d+)?)/);
  return {
    diameter: match?.[1] ?? '',
    width: match?.[2] ?? ''
  };
};

const getWheelFinish = (wheel: WheelProduct): string => {
  if (wheel.finish?.trim()) return wheel.finish.trim().toUpperCase();
  const colourParts = String(wheel.colour || '').split('|').map((part) => part.trim()).filter(Boolean);
  if (wheel.supplierName === 'TYRE LIFE WHEELS' && colourParts[1]) return colourParts[1].toUpperCase();
  return (wheel.imageFinishKey || colourParts[1] || wheel.colour || '').trim().toUpperCase();
};

const getStockEntries = (item: InventoryItem): Array<[string, number]> => {
  const mappedStock = normalizeStockByLocation(item.stockByLocation);
  if (Object.keys(mappedStock).length > 0) return sortStockLocationEntries(mappedStock);
  const location = item.type === ProductType.TYRE
    ? (item as TyreProduct).location
    : item.type === ProductType.WHEEL
      ? (item as WheelProduct).location
      : '';
  return sortStockLocationEntries(parseStockLocationSummary(location));
};

const getItemLocation = (item: InventoryItem): string => (
  item.type === ProductType.TYRE
    ? (item as TyreProduct).location
    : item.type === ProductType.WHEEL
      ? (item as WheelProduct).location || ''
      : ''
);

export const getWarehouseStockSummary = (items: InventoryItem[]): Array<[string, number]> => {
  const totals = items.reduce<Record<string, number>>((summary, item) => {
    getStockEntries(item).forEach(([location, quantity]) => {
      if (quantity > 0) summary[location] = (summary[location] || 0) + quantity;
    });
    return summary;
  }, {});

  return sortStockLocationEntries(totals);
};

const formatItemStockSummary = (item: InventoryItem): string => {
  const availableEntries = getStockEntries(item).filter(([, quantity]) => quantity > 0);
  if (availableEntries.length === 0) return getItemLocation(item);
  const total = availableEntries.reduce((sum, [, quantity]) => sum + quantity, 0);
  return `${availableEntries.map(([location, quantity]) => `${location} ${quantity}`).join(' • ')} • TOTAL ${total}`;
};

const StockLocationPanel: React.FC<{ item: InventoryItem }> = ({ item }) => {
  const structuredEntries = getStockEntries(item);
  const availableEntries = structuredEntries.filter(([, quantity]) => quantity > 0);
  const fallbackLocation = getItemLocation(item);
  const totalStock = availableEntries.reduce((total, [, quantity]) => total + quantity, 0);

  return (
    <div className="col-span-full mt-2 border-t border-gp-border/70 pt-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="block text-[9px] leading-none text-gp-text-muted uppercase font-bold tracking-wider">
          Available locations
        </span>
        <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-gp-text-muted">
          Total stock <span className="ml-1 font-mono text-xs tabular-nums text-green-500">{totalStock}</span>
        </span>
      </div>
      {availableEntries.length > 0 ? (
        <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(4rem,1fr))] gap-2">
          {availableEntries.map(([location, quantity]) => (
            <div
              key={location}
              className="flex min-h-10 min-w-0 items-center justify-between gap-2 rounded border border-gp-border bg-gp-black/70 px-2.5 py-2"
              title={location}
            >
              <span className="truncate text-[10px] font-bold leading-none text-gp-text-muted">{location}</span>
              <span className="shrink-0 font-mono text-xs font-black leading-none tabular-nums text-green-500">{quantity}</span>
            </div>
          ))}
        </div>
      ) : (
        <span className="mt-2 block truncate text-[10px] font-mono font-bold text-gp-text-main">
          {structuredEntries.length > 0 ? 'No branch stock' : fallbackLocation}
        </span>
      )}
      {item.supplierLeadTime ? (
        <div className="mt-2 flex min-h-8 items-center justify-between gap-3 rounded border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-sky-300">Supplier lead time</span>
          <span className="shrink-0 font-mono text-[11px] font-black text-sky-200">{item.supplierLeadTime}</span>
        </div>
      ) : null}
    </div>
  );
};

const getWheelClipboardText = (item: InventoryItem): string => {
  if (item.type !== ProductType.WHEEL) return '';
  const wheel = item as WheelProduct;
  const { diameter, width } = splitWheelSize(wheel.size);
  const wheelName = getWheelDisplayName(wheel).toUpperCase();
  const finish = getWheelFinish(wheel);
  const diameterText = diameter ? `${diameter} INCH` : wheel.size.toUpperCase();
  const pcd = formatWheelPcd(wheel.pcd);
  const widthText = width ? `${width}J` : '';
  const offset = formatWheelOffset(wheel.offset);
  const detailLine = [widthText, offset, wheel.centerBore].filter(Boolean).join(' | ');

  return [
    [wheelName, finish].filter(Boolean).join(' '),
    [diameterText, pcd].filter(Boolean).join(' '),
    detailLine,
    `@ R${Math.round(item.sellingPrice)}`
  ].join('\n');
};

const getItemClipboardText = (item: InventoryItem): string => (
  item.type === ProductType.WHEEL ? getWheelClipboardText(item) : getTyreClipboardText(item)
);

const isCustomerCopyItem = (item: InventoryItem): boolean => (
  (item.type === ProductType.TYRE || item.type === ProductType.WHEEL) && item.quantity > 0
);

const getCustomerCopyIdentity = (item: InventoryItem): string => {
  if (item.type === ProductType.TYRE) {
    const { size, brand, pattern } = getCleanTyreClipboardParts(item as TyreProduct);
    return [size, brand, pattern].join('|');
  }
  return getWheelClipboardText(item)
    .replace(/\n@ R\d+(?:\.\d+)?$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

const customerPriceRank = (item: InventoryItem): number => (
  Number.isFinite(item.sellingPrice) && item.sellingPrice > 0 ? item.sellingPrice : Number.POSITIVE_INFINITY
);

export const formatBulkClipboardText = (items: InventoryItem[]): string => {
  const uniqueItems = new Map<string, InventoryItem>();
  items.filter(isCustomerCopyItem).forEach((item) => {
    const identity = getCustomerCopyIdentity(item);
    if (!identity) return;
    const existing = uniqueItems.get(identity);
    if (!existing || customerPriceRank(item) < customerPriceRank(existing)) {
      uniqueItems.set(identity, item);
    }
  });

  return Array.from(uniqueItems.values())
    .map((item) => getItemClipboardText(item).split('\n').filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n')
    .toUpperCase();
};

const copyTextToClipboard = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

const CopyItemButton = ({ item, onCopyItem, className = '' }: { item: InventoryItem; onCopyItem: (item: InventoryItem) => void; className?: string }) => {
  if (item.type !== ProductType.TYRE && item.type !== ProductType.WHEEL) return null;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onCopyItem(item);
      }}
      className={`inline-flex items-center justify-center gap-2 rounded border border-gp-red/50 bg-gp-red text-white px-3 py-2 text-[10px] font-black uppercase tracking-wider shadow-[0_0_14px_rgba(255,0,0,0.18)] transition-all hover:bg-red-700 hover:border-red-500 active:scale-95 ${className}`}
      title={item.type === ProductType.WHEEL ? 'Copy wheel details' : 'Copy tyre size, brand and pattern'}
      aria-label={item.type === ProductType.WHEEL ? 'Copy wheel details' : 'Copy tyre size, brand and pattern'}
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 8h10v12H8z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 16H5a2 2 0 01-2-2V5a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
      Copy
    </button>
  );
};

const ToolbarToggle = ({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) => (
  <label className={`inline-flex h-8 cursor-pointer select-none items-center gap-2 rounded-md border px-2.5 text-[10px] font-bold transition-colors ${checked ? 'border-gp-red/35 bg-gp-red/10 text-gp-text-main' : 'border-gp-border bg-gp-black/30 text-gp-text-muted hover:text-gp-text-main'}`}>
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="sr-only"
    />
    <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${checked ? 'border-gp-red bg-gp-red text-white' : 'border-gp-text-muted/60 bg-gp-input'}`} aria-hidden="true">
      {checked && (
        <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
          <path d="M2.25 6.25 4.75 8.5 9.75 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
    <span className="whitespace-nowrap">{label}</span>
  </label>
);

const formatBatteryCurrency = (amount: number) => new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(amount);

const BatteryPrice = ({ label, value, emphasis = false }: { label: string; value: number; emphasis?: boolean }) => (
  <div className={`min-w-0 rounded-lg border p-3 ${emphasis ? 'border-gp-red/50 bg-gp-red/10' : 'border-gp-border bg-gp-black/55'}`}>
    <span className={`block text-[9px] font-black uppercase tracking-wider ${emphasis ? 'text-gp-red' : 'text-gp-text-muted'}`}>{label}</span>
    <span className="mt-1 block whitespace-nowrap font-mono text-sm font-black text-gp-text-main sm:text-base">
      {formatBatteryCurrency(value)}
    </span>
  </div>
);

const BatteryCatalogueView: React.FC<{
  items: BatteryProduct[];
  viewMode: ViewMode;
  showSupplierName?: boolean;
}> = ({ items, viewMode, showSupplierName }) => {
  if (viewMode === ViewMode.TABLE) {
    return (
      <div className="mb-6 overflow-x-auto rounded-lg border border-gp-border bg-gp-black shadow-xl">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-gp-dark text-[10px] font-black uppercase tracking-wider text-gp-text-muted">
              {showSupplierName && <th className="border-b border-r border-gp-border p-3">Supplier</th>}
              <th className="border-b border-r border-gp-border p-3">Battery Type</th>
              <th className="border-b border-r border-gp-border p-3">Battery Description</th>
              <th className="border-b border-r border-gp-border p-3 text-right">Nett Price<br /><span className="font-medium">Cost Excl. — Without Scrap</span></th>
              <th className="border-b border-r border-gp-border p-3 text-right">Gross Price<br /><span className="font-medium">Cost Excl. — With Scrap</span></th>
              <th className="border-b border-r border-gp-border p-3 text-right">Cost Including</th>
              <th className="border-b border-gp-border p-3 text-right text-gp-red">Selling Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gp-border">
            {items.map((battery, index) => (
              <tr key={battery.id} className={`${index % 2 === 0 ? 'bg-gp-black' : 'bg-gp-input'} hover:bg-gp-panel`}>
                {showSupplierName && <td className="border-r border-gp-border p-3"><SupplierBadge item={battery} /></td>}
                <td className="border-r border-gp-border p-3 font-display text-base font-black text-gp-text-main">{battery.batteryType}</td>
                <td className="border-r border-gp-border p-3 text-xs font-semibold text-gp-silver">{battery.batteryDescription}</td>
                <td className="border-r border-gp-border p-3 text-right font-mono font-bold text-gp-text-main">{formatBatteryCurrency(battery.nettPrice)}</td>
                <td className="border-r border-gp-border p-3 text-right font-mono font-bold text-gp-text-main">{formatBatteryCurrency(battery.grossPrice)}</td>
                <td className="border-r border-gp-border p-3 text-right font-mono font-bold text-green-500">{formatBatteryCurrency(battery.costIncluding)}</td>
                <td className="p-3 text-right font-mono font-black text-gp-red">{formatBatteryCurrency(battery.sellingPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (viewMode === ViewMode.LIST) {
    return (
      <div className="mb-6 flex flex-col gap-3">
        {items.map((battery) => (
          <article key={battery.id} className="rounded-lg border border-gp-border bg-gp-panel p-4 shadow-md">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0 xl:max-w-[34%]">
                {showSupplierName && <SupplierBadge item={battery} className="mb-2" />}
                <p className="font-display text-xl font-black text-gp-text-main">{battery.batteryType}</p>
                <p className="mt-1 text-xs font-semibold text-gp-silver">{battery.batteryDescription}</p>
              </div>
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-cols-4">
                <BatteryPrice label="Nett · Excl. Without Scrap" value={battery.nettPrice} />
                <BatteryPrice label="Gross · Excl. With Scrap" value={battery.grossPrice} />
                <BatteryPrice label="Cost Including" value={battery.costIncluding} />
                <BatteryPrice label="Selling Price" value={battery.sellingPrice} emphasis />
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 pb-6 md:grid-cols-2 xl:grid-cols-3">
      {items.map((battery) => (
        <article key={battery.id} className="overflow-hidden rounded-lg border border-gp-border bg-gp-panel shadow-md transition hover:border-gp-red/40">
          <header className="border-b border-gp-border bg-gp-overlay p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded border border-gp-border bg-gp-black px-2 py-1 text-[9px] font-black uppercase tracking-wider text-gp-text-muted">Battery Type</span>
              {showSupplierName && <SupplierBadge item={battery} />}
            </div>
            <h3 className="mt-3 font-display text-2xl font-black text-gp-text-main">{battery.batteryType}</h3>
            <p className="mt-2 min-h-10 text-xs font-semibold leading-relaxed text-gp-silver">{battery.batteryDescription}</p>
          </header>
          <div className="grid grid-cols-2 gap-2 p-3">
            <BatteryPrice label="Nett · Excl. Without Scrap" value={battery.nettPrice} />
            <BatteryPrice label="Gross · Excl. With Scrap" value={battery.grossPrice} />
            <BatteryPrice label="Cost Including" value={battery.costIncluding} />
            <BatteryPrice label="Selling Price" value={battery.sellingPrice} emphasis />
          </div>
        </article>
      ))}
    </div>
  );
};

const SUPPLIER_IMAGE_IMPORT_FUNCTION = 'import-supplier-stock-image';
const MAX_STAFF_UPLOAD_IMAGE_SIZE = 10 * 1024 * 1024;
const STAFF_UPLOAD_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const STAFF_UPLOAD_MIME_BY_EXTENSION: Record<string, string> = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
};

export const getSupportedStaffImageMimeType = (file: Pick<File, 'name' | 'type'>): string => {
  const declaredType = String(file.type || '').toLowerCase();
  if (STAFF_UPLOAD_IMAGE_TYPES.has(declaredType)) return declaredType;
  const extension = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? '';
  return STAFF_UPLOAD_MIME_BY_EXTENSION[extension] ?? '';
};

const normalizeStaffImageFile = (file: File): File => {
  const mimeType = getSupportedStaffImageMimeType(file);
  if (!mimeType || file.type === mimeType) return file;
  return new File([file], file.name, { type: mimeType, lastModified: file.lastModified });
};

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result ?? '');
    resolve(result.includes(',') ? result.split(',')[1] : result);
  };
  reader.onerror = () => reject(reader.error ?? new Error('Could not read image file.'));
  reader.readAsDataURL(file);
});

const hashFile = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

// --- SUB-COMPONENTS ---

const SpecBadge = ({ label, value }: { label: string; value: string | number }) => (
  <div className="flex flex-col bg-gp-overlay p-1.5 rounded border border-gp-border min-w-[60px]">
    <span className="text-[9px] text-gp-text-muted uppercase font-bold tracking-wider truncate">{label}</span>
    <span className="text-xs text-gp-text-main font-mono font-bold truncate">{value}</span>
  </div>
);

const SupplierBadge = ({ item, className = '' }: { item: InventoryItem; className?: string }) => {
  const supplierName = getItemSupplierName(item);
  if (!supplierName) return null;

  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded border border-gp-red/40 bg-gp-red/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-gp-red ${className}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gp-red" aria-hidden="true" />
      <span className="truncate">Supplier: {supplierName}</span>
    </span>
  );
};

// --- IMAGE COMPONENT ---
interface ProductImageProps {
  item: InventoryItem;
  imageUrl?: string;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onGenerate: () => void;
  canUploadImage?: boolean;
  onUploadImage?: (file?: File) => void;
  aspectRatio: AspectRatio;
}

const ProductImage: React.FC<ProductImageProps> = ({ item, imageUrl, isLoading, isError, errorMessage, onGenerate, canUploadImage, onUploadImage, aspectRatio }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const imageKind = item.type === ProductType.WHEEL ? 'wheel' : 'tyre';
  // Calculate height based on aspect ratio for placeholder
  let aspectClass = 'aspect-square';
  if (aspectRatio === '16:9') aspectClass = 'aspect-video';
  if (aspectRatio === '4:3') aspectClass = 'aspect-[4/3]';
  if (aspectRatio === '3:4') aspectClass = 'aspect-[3/4]';

  const handleDragStart = (event: React.DragEvent<HTMLImageElement>) => {
    if (!imageUrl) return;
    const label = getItemDisplayName(item);
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/uri-list', imageUrl);
    event.dataTransfer.setData('text/plain', imageUrl);
    event.dataTransfer.setData('text/html', `<img src="${imageUrl}" alt="${label.replace(/"/g, '&quot;')}" />`);
    event.dataTransfer.setData('DownloadURL', `image/jpeg:${getDragFileName(item)}:${imageUrl}`);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!canUploadImage) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!canUploadImage || event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDragOver(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!canUploadImage) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
    const droppedFile = Array.from(event.dataTransfer.files as ArrayLike<File>)
      .find((candidate) => Boolean(getSupportedStaffImageMimeType(candidate)));
    if (droppedFile) onUploadImage?.(normalizeStaffImageFile(droppedFile));
  };
  
  return (
    <div
      className={`w-full ${aspectClass} bg-gp-black border-b border-gp-border relative overflow-hidden group ${isDragOver ? 'ring-2 ring-gp-red ring-inset' : ''}`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {imageUrl ? (
        <img 
          src={imageUrl} 
          alt={getItemDisplayName(item)}
          className="w-full h-full object-contain bg-white p-1 transition-transform duration-500 group-hover:scale-105 cursor-grab active:cursor-grabbing"
          draggable={true}
          loading="lazy"
          decoding="async"
          onDragStart={handleDragStart}
          title="Drag this image into another app or message"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
          {isLoading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-7 h-7 border-2 border-gp-red border-t-transparent rounded-full animate-spin"></div>
              <span className="text-[10px] text-gp-text-main font-black uppercase tracking-wider animate-pulse">Checking official sources</span>
              <span className="max-w-full truncate text-[9px] text-gp-text-muted font-bold">{getItemDisplayName(item)}</span>
            </div>
          ) : isError ? (
             <div className="flex flex-col items-center gap-1 text-gp-text-muted opacity-50">
               <div className="relative">
                 <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                 <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full h-0.5 bg-gp-red rotate-45 transform origin-center"></div>
                 </div>
               </div>
               <span className="max-w-full px-2 text-[9px] uppercase font-bold" title={errorMessage || 'No image found'}>
                 {errorMessage || 'No Image Found'}
               </span>
             </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              {canUploadImage && (
                <button
                  onClick={(e) => { e.stopPropagation(); onUploadImage?.(); }}
                  className="px-3 py-2 rounded bg-gp-red text-white text-[10px] font-black uppercase tracking-wider hover:bg-red-700 transition-colors"
                >
                  Upload Visual
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onGenerate(); }}
                className="group/btn flex flex-col items-center gap-2 text-gp-text-muted hover:text-gp-text-main transition-colors"
              >
                <div className="p-3 rounded-full bg-gp-input group-hover/btn:bg-gp-border transition-colors">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider">Load Visual</span>
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Search Grounding Badge */}
      {imageUrl && (
        <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded flex items-center gap-1">
            <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
            <span className="text-[8px] font-bold text-white uppercase">Visual</span>
        </div>
      )}
      {imageUrl && canUploadImage && (
        <button
          onClick={(e) => { e.stopPropagation(); onUploadImage?.(); }}
          className="absolute left-2 bottom-2 bg-gp-red/90 px-2 py-1 rounded text-[8px] font-black uppercase tracking-wider text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          title={`Upload a corrected ${imageKind} image`}
        >
          Replace
        </button>
      )}
      {canUploadImage && (
        <div className={`pointer-events-none absolute inset-0 flex items-center justify-center bg-black/75 p-3 text-center transition-opacity ${isDragOver ? 'opacity-100' : 'opacity-0'}`}>
          <div className="rounded border border-gp-red bg-gp-black/90 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white shadow-xl">
            Drop ${imageKind} image to confirm upload
          </div>
        </div>
      )}
    </div>
  );
};

interface SupplierTyreImageUploadModalProps {
  item: InventoryItem | null;
  initialFile?: File | null;
  currentUser?: string | null;
  onClose: () => void;
  onUploaded: (item: InventoryItem, supplier: string, brand: string, pattern: string, imageUrl: string) => void;
}

const SupplierTyreImageUploadModal: React.FC<SupplierTyreImageUploadModalProps> = ({ item, initialFile, currentUser, onClose, onUploaded }) => {
  const tyre = item?.type === ProductType.TYRE ? item as TyreProduct : null;
  const wheel = item?.type === ProductType.WHEEL ? item as WheelProduct : null;
  const isWheel = Boolean(wheel);
  const imageKind = isWheel ? 'wheel' : 'tyre';
  const supplierName = wheel?.supplierName ?? tyre?.supplierName ?? '';
  const supplierStockCode = wheel?.supplierStockCode ?? tyre?.supplierStockCode ?? item?.id ?? '';
  const [brand, setBrand] = useState('');
  const [pattern, setPattern] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDropActive, setIsDropActive] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!tyre && !wheel) {
      setFile(null);
      setPreviewUrl('');
      setMessage('');
      return;
    }
    setBrand(isWheel ? wheel?.finish || wheel?.imageFinishKey || '' : tyre?.brand || tyre?.imageFinishKey || '');
    setPattern(isWheel ? wheel?.code || wheel?.imageDesignKey || '' : tyre?.pattern || tyre?.imageDesignKey || '');
    setFile(initialFile ?? null);
    setPreviewUrl(initialFile ? URL.createObjectURL(initialFile) : '');
    setMessage('');
  }, [tyre, wheel, isWheel, initialFile]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  if ((!tyre && !wheel) || !item) return null;

  const selectImageFile = (nextFile: File | null) => {
    if (!nextFile) {
      setFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
      setMessage('');
      return;
    }
    const mimeType = getSupportedStaffImageMimeType(nextFile);
    if (!mimeType) {
      setMessage('Use a JPG, PNG, WEBP or GIF image.');
      return;
    }
    if (nextFile.size > MAX_STAFF_UPLOAD_IMAGE_SIZE) {
      setMessage('Image is too large. Maximum upload size is 10MB.');
      return;
    }
    const normalizedFile = normalizeStaffImageFile(nextFile);
    setFile(normalizedFile);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(normalizedFile));
    setMessage(`Review the ${imageKind} visual, then confirm its details.`);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    selectImageFile(event.target.files?.[0] ?? null);
  };

  const handleDropZoneDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDropActive(true);
  };

  const handleDropZoneDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDropActive(false);
  };

  const handleDropZoneDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDropActive(false);
    const nextFile = Array.from(event.dataTransfer.files as ArrayLike<File>)
      .find((candidate) => Boolean(getSupportedStaffImageMimeType(candidate))) ?? null;
    if (!nextFile) {
      setMessage('Drop an image file to continue.');
      return;
    }
    selectImageFile(nextFile);
  };

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setMessage(`Select the ${imageKind} image first.`);
      return;
    }
    if (!getSupportedStaffImageMimeType(file)) {
      setMessage('Use a JPG, PNG, WEBP or GIF image.');
      return;
    }
    if (file.size > MAX_STAFF_UPLOAD_IMAGE_SIZE) {
      setMessage('Image is too large. Maximum upload size is 10MB.');
      return;
    }
    if (!brand.trim() || !pattern.trim()) {
      setMessage(isWheel ? 'Confirm both wheel code/design and finish.' : 'Confirm both tyre brand and tread/pattern.');
      return;
    }

    setIsUploading(true);
    setMessage(`Uploading confirmed ${imageKind} visual...`);

    try {
      const [base64, hash] = await Promise.all([fileToBase64(file), hashFile(file)]);
      const payload = isWheel
        ? buildStaffSupplierWheelImageUploadPayload({
          item,
          finish: brand.trim(),
          design: pattern.trim(),
          fileName: file.name,
          mimeType: file.type,
          base64,
          hash,
          uploadedBy: currentUser ?? undefined
        })
        : buildStaffSupplierTyreImageUploadPayload({
          item,
          brand: brand.trim(),
          pattern: pattern.trim(),
          fileName: file.name,
          mimeType: file.type,
          base64,
          hash,
          uploadedBy: currentUser ?? undefined
        });

      const { data, error } = await supabase.functions.invoke(SUPPLIER_IMAGE_IMPORT_FUNCTION, {
        body: payload
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Supplier image upload failed.');

      onUploaded(
        item,
        data.supplier || payload.supplier,
        data.finishKey || payload.finishKey,
        data.designKey || payload.designKey,
        data.publicImageUrl
      );
      setMessage(`Uploaded. Matching supplier ${imageKind}s now use this visual.`);
      onClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setMessage(errorMessage || 'Upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <form onSubmit={handleUpload} className="w-full max-w-2xl bg-gp-panel border border-gp-border rounded-lg shadow-2xl overflow-hidden">
        <div className="bg-gp-black border-b border-gp-border p-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-black uppercase text-gp-text-main">Upload {isWheel ? 'Wheel' : 'Tyre'} Visual</h2>
            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-gp-text-muted">
              Confirm supplier and {isWheel ? 'wheel code/design and finish' : 'brand and tread'} before uploading
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gp-text-muted hover:text-white text-3xl leading-none"
            aria-label="Close upload modal"
          >
            &times;
          </button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[220px_1fr]">
          <div
            onDragOver={handleDropZoneDragOver}
            onDragEnter={handleDropZoneDragOver}
            onDragLeave={handleDropZoneDragLeave}
            onDrop={handleDropZoneDrop}
            className={`relative min-h-[220px] rounded border bg-gp-black flex items-center justify-center overflow-hidden transition-colors ${isDropActive ? 'border-gp-red ring-2 ring-gp-red/70' : 'border-gp-border'}`}
          >
            {previewUrl ? (
              <img src={previewUrl} alt={`Selected ${imageKind} preview`} className="h-full w-full object-contain bg-white p-2" />
            ) : (
              <div className="px-4 text-center text-xs font-bold uppercase tracking-wider text-gp-text-muted">
                Drop {imageKind} image here or choose a file
              </div>
            )}
            <div className={`pointer-events-none absolute inset-0 flex items-center justify-center bg-black/75 p-4 text-center transition-opacity ${isDropActive ? 'opacity-100' : 'opacity-0'}`}>
              <div className="rounded border border-gp-red bg-gp-black/95 px-4 py-3 text-[11px] font-black uppercase tracking-wider text-white shadow-xl">
                Drop to review and confirm
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">Supplier</label>
                <input
                  value={supplierName}
                  disabled
                  className="w-full rounded border border-gp-border bg-gp-black p-2 text-sm font-bold text-gp-text-main opacity-80"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">Stock Code</label>
                <input
                  value={supplierStockCode}
                  disabled
                  className="w-full rounded border border-gp-border bg-gp-black p-2 text-sm font-bold text-gp-text-main opacity-80"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">{isWheel ? 'Wheel Finish' : 'Tyre Brand'}</label>
                <input
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                  className="w-full rounded border border-gp-border bg-gp-input p-2 text-sm font-bold text-gp-text-main focus:border-gp-red focus:outline-none"
                  placeholder={isWheel ? 'e.g. Black Machined Face' : 'e.g. Sailun'}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">{isWheel ? 'Wheel Code / Design' : 'Tread / Pattern'}</label>
                <input
                  value={pattern}
                  onChange={(event) => setPattern(event.target.value)}
                  className="w-full rounded border border-gp-border bg-gp-input p-2 text-sm font-bold text-gp-text-main focus:border-gp-red focus:outline-none"
                  placeholder={isWheel ? 'e.g. DX381' : 'e.g. TERRAMAX RT'}
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">{isWheel ? 'Wheel Image' : 'Tyre Image'}</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFileChange}
                className="w-full rounded border border-gp-border bg-gp-input p-2 text-sm text-gp-text-main file:mr-3 file:rounded file:border-0 file:bg-gp-red file:px-3 file:py-1.5 file:text-xs file:font-black file:uppercase file:text-white"
              />
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">
                You can also drag an image into the preview box.
              </p>
            </div>

            {message && (
              <div className={`rounded border p-3 text-xs font-bold ${message.includes('Uploaded') ? 'border-green-600/40 bg-green-900/20 text-green-400' : 'border-gp-border bg-gp-black text-gp-text-muted'}`}>
                {message}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gp-border bg-gp-black p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">
            This visual will apply to matching {isWheel ? 'wheels with the same supplier, code/design and finish.' : 'tyres from the same supplier, brand and tread pattern.'}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded border border-gp-border px-4 py-2 text-xs font-black uppercase text-gp-text-muted hover:text-white">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading}
              className="rounded bg-gp-red px-5 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
            >
              {isUploading ? 'Uploading...' : 'Confirm Upload'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

interface ViewComponentProps extends InventoryViewProps {
  visibleColumns: VisibleColumns;
  sortConfig: { key: SortKey; direction: SortDirection };
  onHeaderClick: (key: SortKey) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string, shiftKey?: boolean) => void;
  showImages: boolean;
  aspectRatio: AspectRatio;
  generatedImages: Record<string, string>;
  loadingImages: Set<string>;
  errorImages: Set<string>;
  imageErrors: Record<string, string>;
  onGenerateImage: (item: InventoryItem) => void;
  onUploadSupplierTyreImage: (item: InventoryItem, file?: File) => void;
  onCopyItem: (item: InventoryItem) => void;
}

const SpreadsheetView: React.FC<ViewComponentProps> = ({ items, isAdmin, onEdit, onDelete, onSell, onReserve, visibleColumns, sortConfig, onHeaderClick, selectedIds, onToggleSelect, isReadOnly, showSupplierName, showImages, generatedImages, loadingImages, errorImages, imageErrors, onGenerateImage, onUploadSupplierTyreImage, onCopyItem, aspectRatio, priceLabel = 'Selling Price' }) => {
  
  const SortIcon = ({ colKey }: { colKey: SortKey }) => (
    <span className={`ml-1 inline-block transition-opacity ${sortConfig.key === colKey ? 'opacity-100' : 'opacity-0 group-hover:opacity-30'}`}>
      {sortConfig.key === colKey && sortConfig.direction === 'desc' ? '▼' : '▲'}
    </span>
  );

  const Header = ({ label, colKey, align = 'left' }: { label: string, colKey?: SortKey, align?: string }) => (
    <th 
      className={`p-3 border-r border-b border-gp-border cursor-pointer hover:bg-gp-panel transition-colors group text-${align}`}
      onClick={() => colKey && onHeaderClick(colKey)}
    >
      <div className={`flex items-center ${align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'}`}>
        {label} {colKey && <SortIcon colKey={colKey} />}
      </div>
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-gp-border shadow-xl bg-gp-black mb-6">
      <table className="w-full text-left border-collapse text-sm">
        <thead>
          <tr className="bg-gp-dark text-gp-text-muted uppercase text-[10px] tracking-wider font-bold">
            <th className="p-3 border-r border-b border-gp-border w-10 text-center" title="Select products to copy">✓</th>
            {!isReadOnly && <th className="p-3 border-r border-b border-gp-border w-32 text-center">Actions</th>}
            <th className="p-3 border-r border-b border-gp-border w-20 text-center">Copy</th>
            {showImages && <th className="p-3 border-r border-b border-gp-border w-24 text-center">Visual</th>}
            <th className="p-3 border-r border-b border-gp-border w-16 text-center">Type</th>
            {showSupplierName && <th className="p-3 border-r border-b border-gp-border">Supplier</th>}
            <Header label="Main Spec" colKey="size" />
            {visibleColumns.specs && <Header label="Brand / Model" colKey="brand" />}
            {visibleColumns.specs && <th className="p-3 border-r border-b border-gp-border">Details</th>}
            {visibleColumns.location && <Header label="Location" colKey="location" />}
            <Header label="Qty" colKey="quantity" align="center" />
            {visibleColumns.cost && <th className="p-3 border-r border-b border-gp-border text-right text-green-600 bg-green-900/10">Cost</th>}
            {visibleColumns.price && <Header label={isReadOnly ? priceLabel : "Sell Price"} colKey="price" align="right" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gp-border">
          {items.map((item, idx) => (
            <tr key={item.id} className={`${idx % 2 === 0 ? 'bg-gp-black' : 'bg-gp-input'} hover:bg-gp-panel transition-colors group ${selectedIds.has(item.id) ? 'bg-gp-red/10' : ''}`}>
              <td className="p-2 border-r border-gp-border text-center">
                {isCustomerCopyItem(item) && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={(event) => onToggleSelect(item.id, (event.nativeEvent as MouseEvent).shiftKey)}
                    className="rounded border-gp-border bg-gp-input text-gp-red focus:ring-gp-red cursor-pointer"
                    title="Select item; hold Shift to select a range"
                    aria-label={`Select ${getItemDisplayName(item)}`}
                  />
                )}
              </td>
              {!isReadOnly && (
                <td className="p-2 border-r border-gp-border text-center">
                  <div className="flex justify-center gap-1 items-center">
                    <button 
                      onClick={() => onSell(item)}
                      className={`text-white bg-gp-red hover:bg-red-700 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-colors shadow-sm ${item.quantity === 0 ? 'opacity-30 cursor-not-allowed bg-gray-700 hover:bg-gray-700' : ''}`}
                      disabled={item.quantity === 0}
                    >
                      SELL
                    </button>
                    <button 
                      onClick={() => onReserve(item)}
                      className="text-blue-500 bg-blue-900/20 hover:bg-blue-900/40 border border-blue-900/50 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-colors shadow-sm"
                      title="Reserve"
                    >
                      RES
                    </button>
                    <button onClick={() => onEdit(item)} className="text-gp-text-muted hover:text-blue-400 p-1" title="Edit">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                    {isAdmin && (
                      <button onClick={() => onDelete(item)} className="text-gp-text-muted hover:text-red-400 p-1" title="Delete">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                </td>
              )}

              <td className="p-2 border-r border-gp-border text-center">
                <CopyItemButton item={item} onCopyItem={onCopyItem} className="px-2 py-1 text-[9px]" />
              </td>

              {showImages && (
                <td className="p-1 border-r border-gp-border w-24">
                    <div className="w-20 h-20 mx-auto rounded overflow-hidden border border-gp-border">
                        <ProductImage 
                            item={item} 
                            imageUrl={generatedImages[item.id]} 
                             isLoading={loadingImages.has(item.id)}
                             isError={errorImages.has(item.id)}
                             errorMessage={imageErrors[item.id]}
                            onGenerate={() => onGenerateImage(item)}
                            canUploadImage={isSupplierTyre(item) || isSupplierWheel(item)}
                            onUploadImage={(file) => onUploadSupplierTyreImage(item, file)}
                            aspectRatio={aspectRatio}
                        />
                    </div>
                </td>
              )}

              <td className="p-3 border-r border-gp-border text-center">
                <span className="text-[9px] font-bold bg-gp-overlay px-1.5 py-0.5 rounded text-gp-text-muted">{item.type.charAt(0)}</span>
              </td>

              {showSupplierName && (
                <td className="p-3 border-r border-gp-border">
                  <SupplierBadge item={item} />
                </td>
              )}
              
              <td className="p-3 border-r border-gp-border font-bold text-gp-text-main">
                {getItemDisplayName(item)}
              </td>

              {visibleColumns.specs && (
                <td className="p-3 border-r border-gp-border text-gp-text-main opacity-90">
                  {item.type === ProductType.TYRE ? (item as TyreProduct).brand : 
                   item.type === ProductType.WHEEL ? uniqueDisplayParts([
                     getWheelBrand(item as WheelProduct),
                     getWheelFinish(item as WheelProduct)
                   ]).join(' / ') :
                   (item as CoiloverProduct).brand}
                </td>
              )}

              {visibleColumns.specs && (
                <td className="p-3 border-r border-gp-border text-gp-text-muted text-xs">
                  {item.type === ProductType.TYRE ? getItemSecondaryLine(item) : 
                   item.type === ProductType.WHEEL ? getItemSecondaryLine(item) :
                   (item as CoiloverProduct).series}
                </td>
              )}

              {visibleColumns.location && (
                <td className="p-3 border-r border-gp-border text-gp-text-muted text-xs">
                  {item.type === ProductType.TYRE || item.type === ProductType.WHEEL
                    ? formatItemStockSummary(item)
                    : '-'}
                </td>
              )}

              <td className={`p-3 border-r border-gp-border text-center font-mono font-bold ${getStatusColor(item.quantity)}`}>
                {item.quantity}
              </td>

              {visibleColumns.cost && (
                <td className="p-3 border-r border-gp-border text-right font-mono text-green-500 bg-green-900/5">
                  {formatCurrency(item.costPrice)}
                </td>
              )}

              {visibleColumns.price && (
                <td className="p-3 text-right font-mono text-gp-text-main font-bold">
                  {formatCurrency(item.sellingPrice)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const GridView: React.FC<ViewComponentProps> = ({ items, isAdmin, onEdit, onDelete, onSell, onReserve, visibleColumns, selectedIds, onToggleSelect, isReadOnly, showSupplierName, showImages, generatedImages, loadingImages, errorImages, imageErrors, onGenerateImage, onUploadSupplierTyreImage, onCopyItem, aspectRatio, priceLabel = 'Selling Price' }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-6">
      {items.map((item) => (
        <div key={item.id} className={`bg-gp-panel border rounded-lg overflow-hidden flex flex-col group transition-all shadow-md relative ${selectedIds.has(item.id) ? 'border-gp-red shadow-[0_0_10px_rgba(255,0,0,0.2)]' : 'border-gp-border hover:border-gp-red/30'}`}>
          
          {showImages && (
            <ProductImage 
                item={item} 
                imageUrl={generatedImages[item.id]} 
                 isLoading={loadingImages.has(item.id)}
                 isError={errorImages.has(item.id)}
                 errorMessage={imageErrors[item.id]}
                onGenerate={() => onGenerateImage(item)}
                canUploadImage={isSupplierTyre(item) || isSupplierWheel(item)}
                onUploadImage={(file) => onUploadSupplierTyreImage(item, file)}
                aspectRatio={aspectRatio}
            />
          )}

          {!isReadOnly && (
            <div className="absolute top-2 left-2 z-10 flex gap-1">
               <button onClick={() => onEdit(item)} className="p-1 bg-gp-black/50 rounded-full text-gp-text-muted hover:text-blue-400 backdrop-blur-sm transition-colors border border-transparent hover:border-blue-500/30">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
               </button>
               {isAdmin && (
                  <button onClick={() => onDelete(item)} className="p-1 bg-gp-black/50 rounded-full text-gp-text-muted hover:text-red-400 backdrop-blur-sm transition-colors border border-transparent hover:border-red-500/30">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
               )}
            </div>
          )}

          {/* Header */}
          <div className="bg-gp-overlay p-3 pt-4 border-b border-gp-border">
            <div className="min-w-0 pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex max-w-full flex-wrap items-center gap-2">
                  <span className="text-[9px] bg-gp-black text-gp-text-muted px-2 py-0.5 rounded font-bold uppercase tracking-wide border border-gp-border">
                    {item.type}
                  </span>
                  {isSpecialItem(item) && (
                    <span className="rounded border border-gp-red bg-gp-red/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-gp-red">
                      Special
                    </span>
                  )}
                  {showSupplierName && <SupplierBadge item={item} />}
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <div className={`text-right ${getStatusColor(item.quantity)}`}>
                    <span className="text-3xl font-display font-bold leading-none">{item.quantity}</span>
                    <div className="text-[9px] uppercase opacity-70">Qty</div>
                  </div>
                </div>
              </div>
              <h3 className="mt-3 max-w-full whitespace-normal break-words font-display text-xl font-black leading-tight tracking-wide text-gp-text-main">
                {getItemDisplayName(item)}
              </h3>
              {item.type === ProductType.WHEEL && getWheelBrand(item as WheelProduct) && (
                <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-gp-red">
                  {getWheelBrand(item as WheelProduct)}
                </p>
              )}
              {visibleColumns.specs && (
                <p className="mt-1 max-w-full whitespace-normal break-words text-xs font-semibold uppercase leading-relaxed text-gp-silver">
                    {item.type === ProductType.WHEEL
                      ? getWheelFinish(item as WheelProduct) || 'Finish not supplied'
                      : getItemSecondaryLine(item)}
                </p>
              )}
            </div>
          </div>

          {/* Specs Area */}
          {(visibleColumns.specs || visibleColumns.location) && (
            <div className={`p-3 grid gap-2 flex-grow content-start bg-gradient-to-b from-gp-panel to-gp-overlay ${item.type === ProductType.WHEEL ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-3'}`}>
                {visibleColumns.specs && item.type === ProductType.TYRE && (
                    <>
                    <SpecBadge
                      label="Index"
                      value={(item as TyreProduct).loadSpeedIndex || (isSupplierTyre(item) ? '' : '-')}
                    />
                    <SpecBadge label="Cat" value="PCR" />
                    </>
                )}
                {visibleColumns.specs && item.type === ProductType.WHEEL && (
                    <>
                    <SpecBadge label="Size" value={(item as WheelProduct).size || ''} />
                    <SpecBadge label="PCD" value={formatWheelPcd((item as WheelProduct).pcd)} />
                    <SpecBadge label="ET" value={formatWheelOffset((item as WheelProduct).offset)} />
                    <SpecBadge label="CB" value={(item as WheelProduct).centerBore || ''} />
                    </>
                )}
                {visibleColumns.specs && item.type === ProductType.COILOVER && (
                    <>
                    <SpecBadge label="Series" value={(item as CoiloverProduct).series} />
                    <div className="col-span-2"><SpecBadge label="Fitment" value={(item as CoiloverProduct).vehicleCompatibility} /></div>
                    </>
                )}
                {visibleColumns.location && (item.type === ProductType.TYRE || item.type === ProductType.WHEEL) && (
                  <StockLocationPanel item={item} />
                )}
            </div>
          )}

          {/* Footer */}
          <div className="mt-auto border-t border-gp-border">
            {/* Cost Price Section */}
            {visibleColumns.cost && (
                <div className="bg-green-900/10 px-3 py-2 border-b border-gp-border flex justify-between items-center">
                    <span className="text-[9px] text-green-600 uppercase font-bold tracking-wider">Cost Price</span>
                    <span className="text-sm font-bold text-green-600 font-mono">{formatCurrency(item.costPrice)}</span>
                </div>
            )}

            {visibleColumns.price && (
                <div className="bg-gp-black p-3 grid grid-cols-2 gap-3 items-center">
                    <div className="flex flex-col">
                        <span className="text-[9px] text-gp-red uppercase font-bold tracking-wider">{isReadOnly ? priceLabel : "Selling Price"}</span>
                        <span className="text-xl font-bold text-gp-text-main font-mono">{formatCurrency(item.sellingPrice)}</span>
                    </div>

                    <div className="flex justify-end gap-1">
                      {isCustomerCopyItem(item) && (
                        <label
                          className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded border transition-colors ${selectedIds.has(item.id) ? 'border-gp-red bg-gp-red text-white shadow-[0_0_10px_rgba(255,0,0,0.25)]' : 'border-gp-border bg-gp-input text-transparent hover:border-gp-red/70'}`}
                          title="Select item; hold Shift to select a range"
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={(event) => onToggleSelect(item.id, (event.nativeEvent as MouseEvent).shiftKey)}
                            className="sr-only"
                            aria-label={`Select ${getItemDisplayName(item)}`}
                          />
                          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="m3.25 8.25 3 3 6.5-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </label>
                      )}
                      <CopyItemButton item={item} onCopyItem={onCopyItem} className="min-h-9 flex-1 max-w-[120px]" />
                      {!isReadOnly && (
                        <>
                            <button 
                                onClick={() => onReserve(item)}
                                className="w-8 flex items-center justify-center bg-blue-900/20 text-blue-500 border border-blue-900/50 rounded hover:bg-blue-900/40 transition-colors"
                                title="Reserve"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </button>
                            <button 
                                onClick={() => onSell(item)}
                                disabled={item.quantity === 0}
                                className={`flex-1 py-2 rounded text-xs font-black uppercase tracking-widest shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1 ${item.quantity === 0 ? 'bg-gp-input text-gp-text-muted cursor-not-allowed' : 'bg-gp-red hover:bg-red-700 text-white border border-red-600'}`}
                            >
                                SELL
                            </button>
                        </>
                      )}
                    </div>
                </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const ListView: React.FC<ViewComponentProps> = ({ items, onEdit, onSell, onReserve, visibleColumns, isAdmin, selectedIds, onToggleSelect, isReadOnly, showSupplierName, showImages, generatedImages, loadingImages, errorImages, imageErrors, onGenerateImage, onUploadSupplierTyreImage, onCopyItem, aspectRatio, priceLabel = 'Selling Price' }) => {
  return (
    <div className="flex flex-col divide-y divide-gp-border p-2 mb-6">
      {items.map((item) => (
        <div 
          key={item.id} 
          className={`py-4 px-3 flex flex-col sm:flex-row justify-between items-center active:bg-gp-overlay rounded transition-colors ${selectedIds.has(item.id) ? 'bg-gp-red/10' : ''}`}
        >
           <div className="flex items-center gap-3 w-full sm:w-auto">
               {isCustomerCopyItem(item) && (
                    <input 
                        type="checkbox" 
                        checked={selectedIds.has(item.id)}
                        onChange={(event) => onToggleSelect(item.id, (event.nativeEvent as MouseEvent).shiftKey)}
                        className="rounded border-gp-border bg-gp-input text-gp-red focus:ring-gp-red cursor-pointer"
                        title="Select item; hold Shift to select a range"
                        aria-label={`Select ${getItemDisplayName(item)}`}
                    />
               )}
               
               {showImages && (
                 <div className="w-16 h-16 rounded overflow-hidden border border-gp-border shrink-0">
                    <ProductImage 
                        item={item} 
                        imageUrl={generatedImages[item.id]} 
                         isLoading={loadingImages.has(item.id)}
                         isError={errorImages.has(item.id)}
                         errorMessage={imageErrors[item.id]}
                        onGenerate={() => onGenerateImage(item)}
                        canUploadImage={isSupplierTyre(item) || isSupplierWheel(item)}
                        onUploadImage={(file) => onUploadSupplierTyreImage(item, file)}
                        aspectRatio={aspectRatio}
                    />
                 </div>
               )}

               <div className="flex flex-col cursor-pointer" onClick={() => !isReadOnly && onEdit(item)}>
                  {showSupplierName && <SupplierBadge item={item} className="mb-1 self-start" />}
                  <span className="text-lg font-black text-gp-text-main font-display">
                    {getItemDisplayName(item)}
                  </span>
                  
                  {visibleColumns.specs && (
                    <span className="text-xs text-gp-silver uppercase font-bold mt-0.5">
                        {getItemSecondaryLine(item)}
                    </span>
                  )}

                  {visibleColumns.location && (item.type === ProductType.TYRE || item.type === ProductType.WHEEL) && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-1.5 py-0.5 rounded bg-gp-overlay text-[10px] text-gp-text-muted border border-gp-border font-mono">
                        {formatItemStockSummary(item)}
                      </span>
                    </div>
                  )}
               </div>
           </div>
           
           <div className="flex flex-col items-end gap-2 w-full sm:w-auto mt-4 sm:mt-0">
              <div className={`px-3 py-1 rounded text-xs font-bold ${getStatusColor(item.quantity)} bg-gp-black border border-gp-border`}>
                {item.quantity} Left
              </div>
              
              {/* Added Cost Price */}
              {visibleColumns.cost && (
                 <span className="text-xs font-bold text-green-600 font-mono bg-green-900/10 px-1 rounded">{formatCurrency(item.costPrice)}</span>
              )}

              {visibleColumns.price && (
                <div className="flex flex-col items-end">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-gp-red">{isReadOnly ? priceLabel : 'Selling Price'}</span>
                  <span className="text-base font-bold text-gp-text-main font-mono">{formatCurrency(item.sellingPrice)}</span>
                </div>
              )}
              
              <div className="flex gap-2">
                <CopyItemButton item={item} onCopyItem={onCopyItem} />
                {!isReadOnly && (
                  <>
                    <button 
                        onClick={() => onReserve(item)}
                        className="px-3 py-1.5 rounded text-xs font-bold uppercase bg-blue-900/20 text-blue-500 border border-blue-900/50 hover:bg-blue-900/40 transition-colors"
                    >
                        Res
                    </button>
                    <button 
                        onClick={() => onSell(item)}
                        disabled={item.quantity === 0}
                        className={`px-4 py-1.5 rounded text-xs font-bold uppercase shadow-sm tracking-wide ${item.quantity === 0 ? 'bg-gp-input text-gp-text-muted cursor-not-allowed' : 'bg-gp-red hover:bg-red-700 text-white active:scale-95 transition-transform'}`}
                    >
                        Sell
                    </button>
                  </>
                )}
              </div>
           </div>
        </div>
      ))}
    </div>
  );
};

export const InventoryView: React.FC<InventoryViewProps> = (props) => {
  // State for config
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'price', direction: 'asc' });
  const [groupBy, setGroupBy] = useState<GroupMode>('none');
  const [hideLowStock, setHideLowStock] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedIdRef = useRef<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>({
    specs: true,
    location: true,
    price: true,
    cost: false // Default to false, allow user to toggle
  });
  
  // Image Generation State
  const [showImages, setShowImages] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});
  const [supplierImages, setSupplierImages] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
  const [errorImages, setErrorImages] = useState<Set<string>>(new Set());
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({});
  const [uploadImageItem, setUploadImageItem] = useState<InventoryItem | null>(null);
  const [uploadImageInitialFile, setUploadImageInitialFile] = useState<File | null>(null);
  const [supplierImageRefreshKey, setSupplierImageRefreshKey] = useState(0);
  const [clipboardNotice, setClipboardNotice] = useState('');
  const [uploadNotice, setUploadNotice] = useState('');
  const [visibleCount, setVisibleCount] = useState(RENDER_CHUNK_SIZE);
  const [isInventoryReportOpen, setIsInventoryReportOpen] = useState(false);

  // Find and persist an exact supplier tyre visual through the server-side AI workflow.
  const handleGenerateImage = async (item: InventoryItem) => {
    if (loadingImages.has(item.id)) return;

    setLoadingImages(prev => new Set(prev).add(item.id));
    setErrorImages(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
    });
    setImageErrors((previous) => {
      const next = { ...previous };
      delete next[item.id];
      return next;
    });

    try {
      if (!isSupplierTyre(item)) throw new Error('Official web search is available for supplier tyres only.');
      const tyre = item as TyreProduct;
      const lookupItem = inventoryItemToSupplierImageLookup(item);
      if (!lookupItem?.supplierName || !lookupItem.imageDesignKey || !lookupItem.imageFinishKey) {
        throw new Error('This tyre needs a confirmed supplier, brand and pattern first.');
      }

      const response = await fetch('/api/business-agent', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'FIND_TYRE_VISUAL',
          supplier: lookupItem.supplierName,
          supplierStockCode: lookupItem.supplierStockCode || item.id,
          brand: tyre.brand,
          pattern: tyre.pattern,
          designKey: lookupItem.imageDesignKey,
          finishKey: lookupItem.imageFinishKey
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Official visual search failed.');
      if (!data?.ok || !data?.publicImageUrl) {
        throw new Error(data?.error || 'No exact official tyre image was found.');
      }

      handleSupplierTyreImageUploaded(
        item,
        data.supplier || lookupItem.supplierName,
        data.finishKey || lookupItem.imageFinishKey,
        data.designKey || lookupItem.imageDesignKey,
        data.publicImageUrl
      );
    } catch (err) {
      console.error('Official tyre visual search failed', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setImageErrors((previous) => ({ ...previous, [item.id]: errorMessage || 'No exact image found.' }));
      setErrorImages(prev => new Set(prev).add(item.id));
    } finally {
      setLoadingImages(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleSupplierTyreImageUploaded = (item: InventoryItem, supplier: string, brand: string, pattern: string, imageUrl: string) => {
    clearSupplierStockImageCache(supplier);
    const matchingIds = new Set<string>([item.id]);
    props.items.forEach((candidate) => {
      const isMatch = item.type === ProductType.WHEEL
        ? supplierWheelMatchesUploadKeys(candidate, supplier, brand, pattern)
        : supplierTyreMatchesUploadKeys(candidate, supplier, brand, pattern);
      if (isMatch) {
        matchingIds.add(candidate.id);
      }
    });

    setSupplierImages((previous) => {
      const next = { ...previous };
      matchingIds.forEach((id) => {
        next[id] = imageUrl;
      });
      return next;
    });
    setGeneratedImages((previous) => {
      const next = { ...previous };
      matchingIds.forEach((id) => {
        delete next[id];
      });
      return next;
    });
    setErrorImages((previous) => {
      const next = new Set(previous);
      matchingIds.forEach((id) => next.delete(id));
      return next;
    });
    setImageErrors((previous) => {
      const next = { ...previous };
      matchingIds.forEach((id) => delete next[id]);
      return next;
    });
    const productLabel = item.type === ProductType.WHEEL ? 'Wheel' : 'Tyre';
    setUploadNotice(`${productLabel} visual replaced for ${matchingIds.size} matching stock item${matchingIds.size === 1 ? '' : 's'}.`);
    setSupplierImageRefreshKey((value) => value + 1);
  };

  const openSupplierTyreImageUploader = (item: InventoryItem, file?: File) => {
    setUploadImageItem(item);
    setUploadImageInitialFile(file ?? null);
  };

  const closeSupplierTyreImageUploader = () => {
    setUploadImageItem(null);
    setUploadImageInitialFile(null);
  };

  const handleHeaderClick = (key: SortKey) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const toggleGroup = (groupTitle: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupTitle]: !prev[groupTitle]
    }));
  };

  const handleBulkAction = () => {
    if (selectedIds.size > 0) {
        props.onBulkDelete(Array.from(selectedIds));
        setSelectedIds(new Set()); // Clear selection after action
    }
  };

  const handleCopyItem = async (item: InventoryItem) => {
    const clipboardText = getItemClipboardText(item);
    if (!clipboardText) return;

    try {
      await copyTextToClipboard(clipboardText);
      setClipboardNotice(`Copied: ${clipboardText.split('\n')[0]}`);
    } catch (error) {
      console.error('Clipboard copy failed', error);
      setClipboardNotice('Could not copy to clipboard.');
    }
  };

  const handleCopyItems = async (items: InventoryItem[], label: string) => {
    const clipboardText = formatBulkClipboardText(items);
    const itemCount = clipboardText ? clipboardText.split('\n').length : 0;
    if (!clipboardText) {
      setClipboardNotice('No available tyre or wheel items to copy.');
      return;
    }

    try {
      await copyTextToClipboard(clipboardText);
      setClipboardNotice(`${label}: ${itemCount} available item${itemCount === 1 ? '' : 's'} copied.`);
    } catch (error) {
      console.error('Bulk clipboard copy failed', error);
      setClipboardNotice('Could not copy items to clipboard.');
    }
  };

  useEffect(() => {
    if (!clipboardNotice) return;
    const timer = window.setTimeout(() => setClipboardNotice(''), 2200);
    return () => window.clearTimeout(timer);
  }, [clipboardNotice]);

  useEffect(() => {
    if (!uploadNotice) return;
    const timer = window.setTimeout(() => setUploadNotice(''), 2600);
    return () => window.clearTimeout(timer);
  }, [uploadNotice]);

  // 1. Filter Items based on local view settings
  const viewFilteredItems = useMemo(() => {
    if (hideLowStock) {
        // Hide items with quantity 0 or 1
        return props.items.filter(item => item.type === ProductType.BATTERY || item.quantity > 1);
    }
    return props.items;
  }, [props.items, hideLowStock]);

  // 2. Sort Items
  const sortedItems = useMemo(() => {
    let sortableItems = [...viewFilteredItems];
    sortableItems.sort((a, b) => {
      const aValue = getSortValue(a, sortConfig.key);
      const bValue = getSortValue(b, sortConfig.key);

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sortableItems;
  }, [viewFilteredItems, sortConfig]);

  const warehouseTotals = useMemo(
    () => getWarehouseStockSummary(sortedItems),
    [sortedItems]
  );

  const customerCopyItems = useMemo(
    () => sortedItems.filter(isCustomerCopyItem),
    [sortedItems]
  );
  const selectedCopyItems = useMemo(
    () => customerCopyItems.filter((item) => selectedIds.has(item.id)),
    [customerCopyItems, selectedIds]
  );

  const handleToggleSelect = (id: string, shiftKey = false) => {
    const currentIndex = customerCopyItems.findIndex((item) => item.id === id);
    const previousIndex = lastSelectedIdRef.current
      ? customerCopyItems.findIndex((item) => item.id === lastSelectedIdRef.current)
      : -1;

    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (shiftKey && currentIndex >= 0 && previousIndex >= 0) {
        const start = Math.min(currentIndex, previousIndex);
        const end = Math.max(currentIndex, previousIndex);
        customerCopyItems.slice(start, end + 1).forEach((item) => next.add(item.id));
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastSelectedIdRef.current = id;
  };

  const handleSelectAll = () => {
    const allSelected = customerCopyItems.length > 0
      && customerCopyItems.every((item) => selectedIds.has(item.id));
    setSelectedIds(allSelected ? new Set() : new Set(customerCopyItems.map((item) => item.id)));
    lastSelectedIdRef.current = null;
  };

  // 3. Group Items
  const groupedItems: Record<string, InventoryItem[]> = useMemo(() => {
    if (groupBy === 'none') return { 'All Items': sortedItems };

    const groups: Record<string, InventoryItem[]> = {};
    
    sortedItems.forEach(item => {
      let groupKey = 'Other';
      if (groupBy === 'location') {
        if (item.type === ProductType.TYRE) groupKey = (item as TyreProduct).location || 'Unknown';
        else if (item.type === ProductType.WHEEL) groupKey = (item as WheelProduct).location || 'General Stock';
        else groupKey = 'General Stock';
      } else if (groupBy === 'brand') {
        if (item.type === ProductType.TYRE) groupKey = (item as TyreProduct).brand || 'Unknown';
        else if (item.type === ProductType.WHEEL) groupKey = (item as WheelProduct).code || 'Unknown'; // Use Code as Brand equivalent
        else if (item.type === ProductType.COILOVER) groupKey = (item as CoiloverProduct).brand || 'Unknown';
        else if (item.type === ProductType.BATTERY) groupKey = 'Dixon Batteries';
      } else if (groupBy === 'type') {
        groupKey = item.type;
      }

      // Clean up key
      groupKey = groupKey.toUpperCase().trim();
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(item);
    });

    return groups;
  }, [sortedItems, groupBy]);

  const reportItems = useMemo(
    () => groupBy === 'none' ? sortedItems : Object.values(groupedItems).flat(),
    [groupBy, groupedItems, sortedItems]
  );

  const resolveReportImageUrls = async (): Promise<Record<string, string>> => {
    const sourceImages = Object.fromEntries(reportItems.flatMap((item) => {
      const imageUrl = (item as InventoryItem & { imageUrl?: string }).imageUrl;
      return imageUrl ? [[item.id, imageUrl]] : [];
    }));
    const lookupItems = reportItems.filter((item) => inventoryItemToSupplierImageLookup(item));
    if (!lookupItems.length) return { ...sourceImages, ...generatedImages, ...supplierImages };

    try {
      const rows = await fetchSupplierStockImages();
      return {
        ...sourceImages,
        ...buildSupplierImageMap(lookupItems, rows),
        ...generatedImages,
        ...supplierImages
      };
    } catch (error) {
      console.error('Inventory report image lookup failed', error);
      return { ...sourceImages, ...generatedImages, ...supplierImages };
    }
  };

  // Clear selection if items change significantly (e.g. filter change)
  useEffect(() => {
    setSelectedIds(new Set());
    lastSelectedIdRef.current = null;
    setVisibleCount(RENDER_CHUNK_SIZE);
  }, [props.items]);

  useEffect(() => {
    setVisibleCount(RENDER_CHUNK_SIZE);
  }, [groupBy, hideLowStock, sortConfig]);

  const visibleItems = useMemo(() => sortedItems.slice(0, visibleCount), [sortedItems, visibleCount]);
  const supplierImageLookupItems = useMemo(
    () => visibleItems.filter((item) => inventoryItemToSupplierImageLookup(item)),
    [visibleItems]
  );
  const supplierImageLookupSignature = useMemo(
    () => supplierImageLookupItems
      .map((item) => {
        const lookupItem = inventoryItemToSupplierImageLookup(item);
        if (!lookupItem) return '';
        return [
          lookupItem.id,
          lookupItem.productType,
          lookupItem.supplierName ?? '',
          lookupItem.supplierStockCode ?? '',
          lookupItem.imageDesignKey ?? '',
          lookupItem.imageFinishKey ?? '',
          lookupItem.imageSourceKey ?? '',
          lookupItem.size ?? '',
          lookupItem.pcd ?? ''
        ].join(':');
      })
      .join('|'),
    [supplierImageLookupItems]
  );

  useEffect(() => {
    let cancelled = false;

    const loadSupplierImages = async () => {
      if (!showImages) {
        setSupplierImages({});
        return;
      }
      if (!supplierImageLookupItems.length) {
        setSupplierImages({});
        return;
      }

      try {
        const rows = await fetchSupplierStockImages();
        if (!cancelled) setSupplierImages(buildSupplierImageMap(supplierImageLookupItems, rows));
      } catch (error) {
        console.error('Supplier image lookup failed', error);
        if (!cancelled) setSupplierImages({});
      }
    };

    void loadSupplierImages();
    return () => {
      cancelled = true;
    };
  }, [showImages, supplierImageLookupSignature, supplierImageRefreshKey]);
  const visibleGroupedItems: Record<string, InventoryItem[]> = useMemo(() => {
    if (groupBy === 'none') return { 'All Items': visibleItems };

    const visibleIds = new Set(visibleItems.map((item) => item.id));
    return Object.entries(groupedItems).reduce<Record<string, InventoryItem[]>>((groups, [groupTitle, groupItems]) => {
      const visibleGroupItems = groupItems.filter((item) => visibleIds.has(item.id));
      if (visibleGroupItems.length) groups[groupTitle] = visibleGroupItems;
      return groups;
    }, {});
  }, [groupBy, groupedItems, visibleItems]);
  const hasMoreItems = visibleCount < sortedItems.length;
  const isBatteryCatalog = props.items.every((item) => item.type === ProductType.BATTERY);

  useEffect(() => {
    if (!isBatteryCatalog) return;
    if (sortConfig.key === 'quantity' || sortConfig.key === 'location') {
      setSortConfig((current) => ({ ...current, key: 'size' }));
    }
    if (groupBy !== 'none') setGroupBy('none');
    if (showImages) setShowImages(false);
    if (hideLowStock) setHideLowStock(false);
  }, [groupBy, hideLowStock, isBatteryCatalog, showImages, sortConfig.key]);
  const hasMarkupAdjuster = Boolean(
    props.isReadOnly
    && !isBatteryCatalog
    && props.markupAdjustment
    && props.onMarkupAdjustmentChange
  );

  if (props.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gp-text-muted border border-dashed border-gp-border rounded-xl m-4 bg-gp-overlay">
        <svg className="w-16 h-16 mb-4 text-gp-text-muted opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="px-4 text-center text-lg font-display uppercase tracking-widest text-gp-text-muted">
          {props.emptyStateTitle || 'No Inventory Found'}
        </p>
        <p className="mt-1 px-4 text-center text-sm text-gp-text-muted opacity-70">
          {props.emptyStateDetail || 'Adjust filters or search criteria'}
        </p>
      </div>
    );
  }

  // Helper to render the correct view component
  const renderView = (items: InventoryItem[]) => {
    const sourceImages = Object.fromEntries(
      items.flatMap((item) => {
        const imageUrl = (item as InventoryItem & { imageUrl?: string }).imageUrl;
        return imageUrl ? [[item.id, imageUrl]] : [];
      })
    );
    const visualImages = { ...sourceImages, ...generatedImages, ...supplierImages };
    const viewProps = { 
        ...props, 
        items, 
        visibleColumns, 
        sortConfig, 
        onHeaderClick: handleHeaderClick,
        selectedIds,
        onToggleSelect: handleToggleSelect,
        showImages,
        generatedImages: visualImages,
        loadingImages,
        errorImages,
        imageErrors,
        onGenerateImage: handleGenerateImage,
        onUploadSupplierTyreImage: openSupplierTyreImageUploader,
        onCopyItem: handleCopyItem,
        aspectRatio
    };

    const batteryItems = items.filter((item): item is BatteryProduct => item.type === ProductType.BATTERY);
    const standardItems = items.filter((item) => item.type !== ProductType.BATTERY);
    const renderStandardItems = () => {
      const standardProps = { ...viewProps, items: standardItems };
      switch (props.viewMode) {
        case ViewMode.TABLE: return <SpreadsheetView {...standardProps} />;
        case ViewMode.GRID: return <GridView {...standardProps} />;
        case ViewMode.LIST: return <ListView {...standardProps} />;
        default: return <GridView {...standardProps} />;
      }
    };

    if (batteryItems.length && standardItems.length) {
      return (
        <div className="flex flex-col gap-5">
          {renderStandardItems()}
          <section>
            <div className="mb-3 flex items-center gap-2 border-b border-gp-border pb-2">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <h3 className="font-display text-lg font-black uppercase tracking-wide text-gp-text-main">Dixon Batteries</h3>
              <span className="rounded-full bg-gp-red px-2 py-0.5 text-[10px] font-black text-white">{batteryItems.length}</span>
            </div>
            <BatteryCatalogueView items={batteryItems} viewMode={props.viewMode} showSupplierName={props.showSupplierName} />
          </section>
        </div>
      );
    }
    if (batteryItems.length) return <BatteryCatalogueView items={batteryItems} viewMode={props.viewMode} showSupplierName={props.showSupplierName} />;
    return renderStandardItems();
  };

  return (
    <div className="flex flex-col gap-4 relative">
      {clipboardNotice && (
        <div className="fixed right-5 top-20 z-[90] max-w-sm rounded border border-green-500/40 bg-green-950/95 px-4 py-3 text-xs font-bold uppercase tracking-wider text-green-300 shadow-2xl backdrop-blur">
          {clipboardNotice}
        </div>
      )}
      {uploadNotice && (
        <div className="fixed right-5 top-20 z-[90] max-w-sm rounded border border-green-500/40 bg-green-950/95 px-4 py-3 text-xs font-bold uppercase tracking-wider text-green-300 shadow-2xl backdrop-blur">
          {uploadNotice}
        </div>
      )}

      <SupplierTyreImageUploadModal
        item={uploadImageItem}
        initialFile={uploadImageInitialFile}
        currentUser={props.currentUser}
        onClose={closeSupplierTyreImageUploader}
        onUploaded={handleSupplierTyreImageUploaded}
      />

      {isInventoryReportOpen && (
        <InventoryReportModal
          items={reportItems}
          context={{
            catalogueLabel: props.reportCatalogueLabel || (props.isReadOnly ? 'Supplier catalogue' : 'Available stock'),
            searchQuery: props.reportSearchQuery || '',
            generatedBy: TERMINAL_STAFF_NAMES[props.currentUser || ''] || props.currentUser || 'Unknown',
            terminalId: props.currentUser || 'Unknown',
            showSupplierName: Boolean(props.showSupplierName),
            visibility: {
              visual: showImages,
              type: true,
              mainSpec: true,
              brandModel: true,
              supplier: Boolean(props.showSupplierName),
              specs: visibleColumns.specs,
              location: visibleColumns.location,
              quantity: true,
              cost: props.isAdmin && visibleColumns.cost,
              sellingPrice: visibleColumns.price
            },
            priceLabel: props.priceLabel
          }}
          canShowCost={props.isAdmin}
          rowOptions={{
            groupBy: groupBy as InventoryReportGroupMode,
            showSupplierName: Boolean(props.showSupplierName)
          }}
          resolveImageUrls={resolveReportImageUrls}
          onClose={() => setIsInventoryReportOpen(false)}
        />
      )}
      
      {/* View Configuration Toolbar */}
      <div data-testid="inventory-toolbar" className={`sticky top-0 z-20 grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 rounded-md border border-gp-border bg-gp-panel px-3 py-2.5 shadow-xl ${hasMarkupAdjuster ? 'xl:grid-cols-[minmax(250px,auto)_minmax(420px,1fr)_auto] xl:items-end' : 'lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end'}`}>
        
        <div className="flex min-w-0 flex-wrap items-end gap-3">
            {/* Sorting */}
            <div className="min-w-0">
                <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-gp-text-muted">Sort by</span>
                <div className="flex items-center gap-1.5">
                  <select
                    value={sortConfig.key}
                    onChange={(e) => setSortConfig(prev => ({ ...prev, key: e.target.value as SortKey }))}
                    className="h-9 min-w-28 rounded-md border border-gp-border bg-gp-input px-2.5 text-xs font-bold text-gp-text-main focus:border-gp-red focus:outline-none"
                >
                    <option value="size">{isBatteryCatalog ? 'Battery Type' : 'Size / Name'}</option>
                    <option value="brand">{isBatteryCatalog ? 'Description' : 'Brand'}</option>
                    {!isBatteryCatalog && <option value="quantity">Quantity</option>}
                    <option value="price">Price</option>
                    {!isBatteryCatalog && <option value="location">Location</option>}
                </select>
                  <button
                    type="button"
                    onClick={() => setSortConfig(prev => ({ ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' }))}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gp-border bg-gp-input text-gp-text-main transition-colors hover:border-gp-text-muted hover:bg-gp-border"
                    title={sortConfig.direction === 'asc' ? 'Sort ascending' : 'Sort descending'}
                    aria-label={sortConfig.direction === 'asc' ? 'Sort ascending' : 'Sort descending'}
                >
                    <svg className={`h-4 w-4 transition-transform ${sortConfig.direction === 'desc' ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
            </div>

            {/* Grouping */}
            {!isBatteryCatalog && <div className="min-w-0 sm:border-l sm:border-gp-border sm:pl-3">
                <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-gp-text-muted">Group by</span>
                <select 
                    value={groupBy}
                    onChange={(e) => setGroupBy(e.target.value as GroupMode)}
                    className="h-9 min-w-24 rounded-md border border-gp-border bg-gp-input px-2.5 text-xs font-bold text-gp-text-main focus:border-gp-red focus:outline-none"
                >
                    <option value="none">None</option>
                    <option value="location">Location</option>
                    <option value="brand">Brand</option>
                    <option value="type">Type</option>
                </select>
            </div>}

        </div>

        {hasMarkupAdjuster && props.markupAdjustment && props.onMarkupAdjustmentChange && (
          <SupplierMarkupAdjuster
            adjustment={props.markupAdjustment}
            onChange={props.onMarkupAdjustmentChange}
          />
        )}

        <div className="min-w-0 justify-self-start xl:justify-self-end">
          <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-gp-text-muted">View</span>
          <div className="flex w-fit gap-0.5 rounded-md border border-gp-border bg-gp-black/50 p-1">
            <button
                onClick={() => props.onViewModeChange(ViewMode.TABLE)}
                className={`flex h-7 items-center rounded px-2.5 text-[9px] font-black uppercase transition-colors ${props.viewMode === ViewMode.TABLE ? 'bg-gp-panel text-gp-text-main shadow-sm' : 'text-gp-text-muted hover:bg-gp-panel/70 hover:text-gp-text-main'}`}
                aria-pressed={props.viewMode === ViewMode.TABLE}
            >
                <span>Sheet</span>
            </button>
            <button
                onClick={() => props.onViewModeChange(ViewMode.GRID)}
                className={`flex h-7 items-center rounded px-2.5 text-[9px] font-black uppercase transition-colors ${props.viewMode === ViewMode.GRID ? 'bg-gp-panel text-gp-text-main shadow-sm' : 'text-gp-text-muted hover:bg-gp-panel/70 hover:text-gp-text-main'}`}
                aria-pressed={props.viewMode === ViewMode.GRID}
            >
                <span>Card</span>
            </button>
            <button
                onClick={() => props.onViewModeChange(ViewMode.LIST)}
                className={`flex h-7 items-center rounded px-2.5 text-[9px] font-black uppercase transition-colors ${props.viewMode === ViewMode.LIST ? 'bg-gp-panel text-gp-text-main shadow-sm' : 'text-gp-text-muted hover:bg-gp-panel/70 hover:text-gp-text-main'}`}
                aria-pressed={props.viewMode === ViewMode.LIST}
            >
                <span>List</span>
            </button>
          </div>
        </div>

        {/* Filters & Toggles */}
        <div className={`flex min-w-0 flex-wrap items-center gap-2 border-t border-gp-border pt-2.5 ${hasMarkupAdjuster ? 'xl:col-span-3' : 'lg:col-span-2'}`}>
          {!isBatteryCatalog && (
            <>
             <span className="mr-1 text-[9px] font-black uppercase tracking-wider text-gp-text-muted">Display</span>

             {/* Show Images Toggle */}
             <ToolbarToggle checked={showImages} onChange={setShowImages} label="Visuals" />

             {/* Aspect Ratio Selector - Only visible if images enabled */}
             {showImages && (
                <div className="flex h-8 items-center gap-1.5 rounded-md border border-gp-border bg-gp-black/30 px-2.5">
                    <span className="text-[9px] font-bold uppercase text-gp-text-muted">Ratio</span>
                    <select
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                        className="bg-transparent text-[10px] font-bold text-gp-text-main focus:outline-none"
                    >
                        <option value="1:1">1:1</option>
                        <option value="4:3">4:3</option>
                        <option value="3:4">3:4</option>
                        <option value="16:9">16:9</option>
                    </select>
                </div>
             )}

             {/* Hide Low Stock Toggle */}
             <ToolbarToggle checked={hideLowStock} onChange={setHideLowStock} label="Hide low stock" />
             <span className="mx-1 hidden h-5 w-px bg-gp-border sm:block" aria-hidden="true" />
             <ToolbarToggle checked={visibleColumns.location} onChange={(checked) => setVisibleColumns({...visibleColumns, location: checked})} label="Locations" />
             <ToolbarToggle checked={visibleColumns.specs} onChange={(checked) => setVisibleColumns({...visibleColumns, specs: checked})} label="Specs" />
             <ToolbarToggle checked={visibleColumns.price} onChange={(checked) => setVisibleColumns({...visibleColumns, price: checked})} label="Price" />
             <ToolbarToggle checked={visibleColumns.cost} onChange={(checked) => setVisibleColumns({...visibleColumns, cost: checked})} label="Cost" />
            </>
          )}
             <div className="ml-auto flex min-w-0 basis-full flex-wrap items-center justify-end gap-2 sm:basis-auto sm:border-l sm:border-gp-border sm:pl-3">
               <button
                 type="button"
                 onClick={() => setIsInventoryReportOpen(true)}
                 disabled={reportItems.length === 0}
                 className="inline-flex h-8 min-w-28 flex-1 items-center justify-center gap-2 rounded-md bg-gp-red px-3 text-[9px] font-black uppercase tracking-wider text-white shadow-[0_0_12px_rgba(255,0,0,0.18)] transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-35 sm:flex-none"
                 title="Create a landscape A4 stock sheet"
               >
                 <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2">
                   <path d="M6 3h9l3 3v15H6z" />
                   <path d="M15 3v4h4M9 12h6M9 16h6" />
                 </svg>
                 Print
               </button>
             {customerCopyItems.length > 0 && (
               <>
                 <button
                   type="button"
                   onClick={handleSelectAll}
                   className="h-8 rounded-md border border-gp-red/60 bg-gp-red/10 px-3 text-[9px] font-black uppercase tracking-wider text-gp-red transition-colors hover:bg-gp-red hover:text-white"
                 >
                   {selectedCopyItems.length === customerCopyItems.length ? 'Clear All' : 'Select All'}
                 </button>
                 <button
                   type="button"
                   onClick={() => handleCopyItems(selectedCopyItems, 'Copied selected')}
                   disabled={selectedCopyItems.length === 0}
                   className="h-8 rounded-md bg-gp-red px-3 text-[9px] font-black uppercase tracking-wider text-white shadow-[0_0_12px_rgba(255,0,0,0.18)] transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-35"
                 >
                   Copy Selected ({selectedCopyItems.length})
                 </button>
                 <button
                   type="button"
                   onClick={() => handleCopyItems(customerCopyItems, 'Copied all')}
                   className="h-8 rounded-md bg-gp-red px-3 text-[9px] font-black uppercase tracking-wider text-white shadow-[0_0_12px_rgba(255,0,0,0.18)] transition-colors hover:bg-red-700"
                 >
                   Copy All ({customerCopyItems.length})
                 </button>
               </>
             )}
             </div>
        </div>

      </div>

      {!isBatteryCatalog && visibleColumns.location && warehouseTotals.length > 0 && (
        <section className="rounded-lg border border-gp-border bg-gp-panel p-3 shadow-md" aria-label="Warehouse stock totals">
          <div className="mb-2 flex min-w-0 flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-[10px] font-black uppercase tracking-[0.16em] text-gp-text-main">Warehouse stock totals</h2>
              <p className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-gp-text-muted">All matching products currently shown</p>
            </div>
            <span className="font-mono text-[10px] font-bold text-gp-text-muted">{warehouseTotals.length} location{warehouseTotals.length === 1 ? '' : 's'}</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2">
            {warehouseTotals.map(([location, quantity]) => (
              <div key={location} className="flex min-h-11 min-w-0 items-center justify-between gap-3 rounded border border-gp-border bg-gp-black/70 px-3 py-2">
                <span className="truncate text-[10px] font-black uppercase tracking-wider text-gp-text-muted" title={location}>{location}</span>
                <span className="shrink-0 font-mono text-sm font-black tabular-nums text-green-500">{quantity}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bulk Action Bar - Shows when items are selected */}
      {selectedCopyItems.length > 0 && (
        <div className="bg-gp-red text-white p-3 rounded-lg flex items-center justify-between shadow-lg animate-fade-in-up">
            <span className="font-bold text-sm uppercase tracking-wide px-2">
                {selectedCopyItems.length} Item{selectedCopyItems.length === 1 ? '' : 's'} Selected
            </span>
            <div className="flex flex-wrap justify-end gap-2">
                <button 
                    onClick={() => {
                      setSelectedIds(new Set());
                      lastSelectedIdRef.current = null;
                    }}
                    className="px-4 py-1.5 rounded border border-white/30 hover:bg-white/10 text-xs font-bold uppercase transition-colors"
                >
                    Clear
                </button>
                <button
                    onClick={() => handleCopyItems(selectedCopyItems, 'Copied selected')}
                    className="px-4 py-1.5 rounded bg-white text-gp-red font-bold text-xs uppercase hover:bg-gray-100 transition-colors shadow-sm"
                >
                    Copy Selected
                </button>
                {props.isAdmin && !props.isReadOnly && (
                  <button
                      onClick={handleBulkAction}
                      className="px-4 py-1.5 rounded border border-white/40 text-white font-bold text-xs uppercase hover:bg-white/10 transition-colors"
                  >
                      Delete Selected
                  </button>
                )}
            </div>
        </div>
      )}

      {/* Grouped Render */}
      {Object.entries(visibleGroupedItems).map(([groupTitle, groupItems]) => {
        const isCollapsed = collapsedGroups[groupTitle];
        return (
            <div key={groupTitle} className="flex flex-col gap-2">
                {groupBy !== 'none' && (
                    <div 
                        className="flex items-center gap-2 py-2 border-b border-gp-border mt-2 cursor-pointer hover:bg-gp-panel/50 rounded px-2 transition-colors select-none"
                        onClick={() => toggleGroup(groupTitle)}
                    >
                        <div className={`p-1 rounded text-gp-text-muted transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                        <span className="text-lg font-display font-black text-gp-text-main uppercase tracking-tighter">{groupTitle}</span>
                        <span className="bg-gp-red text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{groupItems.length}</span>
                    </div>
                )}
                
                {/* Content - Hidden if collapsed */}
                <div className={`${isCollapsed && groupBy !== 'none' ? 'hidden' : 'block'}`}>
                    {renderView(groupItems)}
                </div>
            </div>
        );
      })}

      {hasMoreItems && (
        <div className="flex flex-col items-center gap-2 py-6">
          <p className="text-xs font-bold uppercase tracking-wider text-gp-text-muted">
            Showing {Math.min(visibleCount, sortedItems.length)} of {sortedItems.length} matching items
          </p>
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + RENDER_CHUNK_SIZE)}
            className="rounded-lg border border-gp-border bg-gp-panel px-5 py-2 text-xs font-black uppercase tracking-wider text-gp-text-main transition-colors hover:border-gp-red hover:text-gp-red"
          >
            Load More
          </button>
        </div>
      )}

    </div>
  );
};
