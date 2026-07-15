
import React, { useState, useMemo, useEffect } from 'react';
import { InventoryItem, ProductType, TyreProduct, WheelProduct, CoiloverProduct, ViewMode } from '../types';
import { formatCurrency, getStatusColor } from '../utils';
import {
  buildStaffSupplierTyreImageUploadPayload,
  buildSupplierImageMap,
  clearSupplierStockImageCache,
  fetchSupplierStockImages,
  inventoryItemToSupplierImageLookup,
  supplierTyreMatchesUploadKeys
} from '../supplierStockImages';
import { supabase } from '../supabaseClient';
import {
  normalizeStockByLocation,
  parseStockLocationSummary,
  sortStockLocationEntries
} from '../stockLocation';

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
  }
  
  return '';
};

const getWheelDisplayName = (wheel: WheelProduct): string => (
  wheel.imageDesignKey || wheel.code || wheel.size || 'Wheel'
);

const isSupplierTyre = (item: InventoryItem): item is TyreProduct => (
  item.type === ProductType.TYRE && Boolean((item as TyreProduct).supplierName)
);

export const getItemSupplierName = (item: InventoryItem): string => (
  String(item.supplierName || '').trim().toUpperCase()
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

const getTyreClipboardText = (item: InventoryItem): string => {
  if (item.type !== ProductType.TYRE) return '';
  const tyre = item as TyreProduct;
  return [tyre.size, tyre.brand, tyre.pattern]
    .map((part) => String(part || '').trim())
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

const StockLocationPanel: React.FC<{ item: InventoryItem }> = ({ item }) => {
  const structuredEntries = getStockEntries(item);
  const availableEntries = structuredEntries.filter(([, quantity]) => quantity > 0);
  const fallbackLocation = getItemLocation(item);

  return (
    <div className="col-span-full mt-2 border-t border-gp-border/70 pt-3">
      <span className="block text-[9px] leading-none text-gp-text-muted uppercase font-bold tracking-wider">
        Available locations
      </span>
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
    detailLine
  ].join('\n');
};

const getItemClipboardText = (item: InventoryItem): string => (
  item.type === ProductType.WHEEL ? getWheelClipboardText(item) : getTyreClipboardText(item)
);

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
          title="Upload a corrected tyre tread image"
        >
          Replace
        </button>
      )}
      {canUploadImage && (
        <div className={`pointer-events-none absolute inset-0 flex items-center justify-center bg-black/75 p-3 text-center transition-opacity ${isDragOver ? 'opacity-100' : 'opacity-0'}`}>
          <div className="rounded border border-gp-red bg-gp-black/90 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white shadow-xl">
            Drop tyre image to confirm upload
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
  const [brand, setBrand] = useState('');
  const [pattern, setPattern] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDropActive, setIsDropActive] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!tyre) {
      setFile(null);
      setPreviewUrl('');
      setMessage('');
      return;
    }
    setBrand(tyre.brand || tyre.imageFinishKey || '');
    setPattern(tyre.pattern || tyre.imageDesignKey || '');
    setFile(initialFile ?? null);
    setPreviewUrl(initialFile ? URL.createObjectURL(initialFile) : '');
    setMessage('');
  }, [tyre, initialFile]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  if (!tyre || !item) return null;

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
      setMessage('Use a JPG, PNG, WEBP or GIF tyre image.');
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
    setMessage('Review the tyre visual, then confirm brand and tread pattern.');
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
      setMessage('Drop a tyre image file to continue.');
      return;
    }
    selectImageFile(nextFile);
  };

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setMessage('Select the tyre tread image first.');
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
      setMessage('Confirm both tyre brand and tread/pattern.');
      return;
    }

    setIsUploading(true);
    setMessage('Uploading confirmed tyre visual...');

    try {
      const [base64, hash] = await Promise.all([fileToBase64(file), hashFile(file)]);
      const payload = buildStaffSupplierTyreImageUploadPayload({
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
      setMessage('Uploaded. Matching supplier tyres now use this visual.');
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
            <h2 className="font-display text-2xl font-black uppercase text-gp-text-main">Upload Tyre Visual</h2>
            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-gp-text-muted">
              Confirm supplier, brand and tread before uploading
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
              <img src={previewUrl} alt="Selected tyre tread preview" className="h-full w-full object-contain bg-white p-2" />
            ) : (
              <div className="px-4 text-center text-xs font-bold uppercase tracking-wider text-gp-text-muted">
                Drop tyre image here or choose a file
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
                  value={tyre.supplierName ?? ''}
                  disabled
                  className="w-full rounded border border-gp-border bg-gp-black p-2 text-sm font-bold text-gp-text-main opacity-80"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">Stock Code</label>
                <input
                  value={tyre.supplierStockCode ?? item.id}
                  disabled
                  className="w-full rounded border border-gp-border bg-gp-black p-2 text-sm font-bold text-gp-text-main opacity-80"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">Tyre Brand</label>
                <input
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                  className="w-full rounded border border-gp-border bg-gp-input p-2 text-sm font-bold text-gp-text-main focus:border-gp-red focus:outline-none"
                  placeholder="e.g. Sailun"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">Tread / Pattern</label>
                <input
                  value={pattern}
                  onChange={(event) => setPattern(event.target.value)}
                  className="w-full rounded border border-gp-border bg-gp-input p-2 text-sm font-bold text-gp-text-main focus:border-gp-red focus:outline-none"
                  placeholder="e.g. TERRAMAX RT"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">Tyre Image</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFileChange}
                className="w-full rounded border border-gp-border bg-gp-input p-2 text-sm text-gp-text-main file:mr-3 file:rounded file:border-0 file:bg-gp-red file:px-3 file:py-1.5 file:text-xs file:font-black file:uppercase file:text-white"
              />
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">
                You can also drag a tyre image into the preview box.
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
            This visual will apply to matching tyres from the same supplier, brand and tread pattern.
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
  onToggleSelect: (id: string) => void;
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
            {isAdmin && !isReadOnly && <th className="p-3 border-r border-b border-gp-border w-10 text-center">✓</th>}
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
              {isAdmin && !isReadOnly && (
                <td className="p-2 border-r border-gp-border text-center">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.has(item.id)}
                    onChange={() => onToggleSelect(item.id)}
                    className="rounded border-gp-border bg-gp-input text-gp-red focus:ring-gp-red cursor-pointer"
                  />
                </td>
              )}
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
                            canUploadImage={isSupplierTyre(item)}
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
                  {item.type === ProductType.TYRE ? (item as TyreProduct).location : 
                   item.type === ProductType.WHEEL ? (item as WheelProduct).location : '-'}
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
                canUploadImage={isSupplierTyre(item)}
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

          {isAdmin && !isReadOnly && (
            <div className="absolute top-2 right-2 z-10">
                <input 
                    type="checkbox" 
                    checked={selectedIds.has(item.id)}
                    onChange={() => onToggleSelect(item.id)}
                    className="w-5 h-5 rounded border-gp-border bg-gp-black text-gp-red focus:ring-gp-red cursor-pointer shadow-sm"
                />
            </div>
          )}

          {/* Header */}
          <div className="bg-gp-overlay p-3 pt-4 border-b border-gp-border flex justify-between items-start">
            <div className="pt-4 overflow-hidden">
              <div className="flex max-w-full flex-wrap items-center gap-2">
                <span className="text-[9px] bg-gp-black text-gp-text-muted px-2 py-0.5 rounded font-bold uppercase tracking-wide border border-gp-border">
                  {item.type}
                </span>
                {showSupplierName && <SupplierBadge item={item} />}
              </div>
              {item.type === ProductType.WHEEL && getWheelBrand(item as WheelProduct) && (
                <p className="mt-2 text-[10px] font-black uppercase text-gp-red tracking-widest">
                  {getWheelBrand(item as WheelProduct)}
                </p>
              )}
              <h3 className="text-xl font-black text-gp-text-main mt-2 leading-none font-display tracking-wide truncate max-w-full">
                {getItemDisplayName(item)}
              </h3>
              {visibleColumns.specs && (
                <p className="text-xs text-gp-silver mt-1 uppercase font-semibold truncate max-w-full">
                    {item.type === ProductType.WHEEL
                      ? getWheelFinish(item as WheelProduct) || 'Finish not supplied'
                      : getItemSecondaryLine(item)}
                </p>
              )}
            </div>
            
            <div className="flex flex-col items-end shrink-0 pl-2">
               <div className={`text-right ${getStatusColor(item.quantity)}`}>
                  <span className="text-3xl font-display font-bold leading-none">{item.quantity}</span>
                  <div className="text-[9px] uppercase opacity-70">Qty</div>
               </div>
            </div>
          </div>

          {/* Specs Area */}
          {visibleColumns.specs && (
            <div className={`p-3 grid gap-2 flex-grow content-start bg-gradient-to-b from-gp-panel to-gp-overlay ${item.type === ProductType.WHEEL ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-3'}`}>
                {item.type === ProductType.TYRE && (
                    <>
                    <SpecBadge
                      label="Index"
                      value={(item as TyreProduct).loadSpeedIndex || (isSupplierTyre(item) ? '' : '-')}
                    />
                    <SpecBadge label="Cat" value="PCR" />
                    </>
                )}
                {item.type === ProductType.WHEEL && (
                    <>
                    <SpecBadge label="Size" value={(item as WheelProduct).size} />
                    <SpecBadge label="PCD" value={formatWheelPcd((item as WheelProduct).pcd) || '-'} />
                    <SpecBadge label="ET" value={formatWheelOffset((item as WheelProduct).offset) || '-'} />
                    <SpecBadge label="CB" value={(item as WheelProduct).centerBore || '-'} />
                    </>
                )}
                {item.type === ProductType.COILOVER && (
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
               {isAdmin && !isReadOnly && (
                    <input 
                        type="checkbox" 
                        checked={selectedIds.has(item.id)}
                        onChange={() => onToggleSelect(item.id)}
                        className="rounded border-gp-border bg-gp-input text-gp-red focus:ring-gp-red cursor-pointer"
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
                        canUploadImage={isSupplierTyre(item)}
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
                        {item.type === ProductType.TYRE ? (item as TyreProduct).location : (item as WheelProduct).location}
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
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'size', direction: 'asc' });
  const [groupBy, setGroupBy] = useState<GroupMode>('none');
  const [hideLowStock, setHideLowStock] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
      if (supplierTyreMatchesUploadKeys(candidate, supplier, brand, pattern)) {
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
    setUploadNotice(`Tyre visual replaced for ${matchingIds.size} matching stock item${matchingIds.size === 1 ? '' : 's'}.`);
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

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
  };

  const handleSelectAll = (items: InventoryItem[]) => {
    if (selectedIds.size === items.length) {
        setSelectedIds(new Set());
    } else {
        setSelectedIds(new Set(items.map(i => i.id)));
    }
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
        return props.items.filter(item => item.quantity > 1);
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

  // Clear selection if items change significantly (e.g. filter change)
  useEffect(() => {
    setSelectedIds(new Set());
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

  if (props.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gp-text-muted border border-dashed border-gp-border rounded-xl m-4 bg-gp-overlay">
        <svg className="w-16 h-16 mb-4 text-gp-text-muted opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-lg font-display uppercase tracking-widest text-gp-text-muted">No Inventory Found</p>
        <p className="text-sm text-gp-text-muted mt-1 opacity-70">Adjust filters or search criteria</p>
      </div>
    );
  }

  // Helper to render the correct view component
  const renderView = (items: InventoryItem[]) => {
    const visualImages = { ...generatedImages, ...supplierImages };
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

    switch (props.viewMode) {
      case ViewMode.TABLE: return <SpreadsheetView {...viewProps} />;
      case ViewMode.GRID: return <GridView {...viewProps} />;
      case ViewMode.LIST: return <ListView {...viewProps} />;
      default: return <GridView {...viewProps} />;
    }
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
      
      {/* View Configuration Toolbar */}
      <div className="bg-gp-panel border border-gp-border rounded-lg p-3 flex flex-col lg:flex-row gap-4 lg:items-center justify-between shadow-sm sticky top-0 z-20">
        
        <div className="flex flex-wrap gap-4 items-center">
            {/* Sorting */}
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase text-gp-text-muted tracking-wider">Sort:</span>
                <select 
                    value={sortConfig.key}
                    onChange={(e) => setSortConfig(prev => ({ ...prev, key: e.target.value as SortKey }))}
                    className="bg-gp-input border border-gp-border text-xs rounded p-1.5 text-gp-text-main focus:outline-none focus:border-gp-red font-medium"
                >
                    <option value="size">Size / Name</option>
                    <option value="brand">Brand</option>
                    <option value="quantity">Quantity</option>
                    <option value="price">Price</option>
                    <option value="location">Location</option>
                </select>
                <button 
                    onClick={() => setSortConfig(prev => ({ ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' }))}
                    className="p-1.5 bg-gp-input border border-gp-border rounded text-gp-text-main hover:bg-gp-border"
                >
                    {sortConfig.direction === 'asc' ? '↑' : '↓'}
                </button>
            </div>

            {/* Grouping */}
            <div className="flex items-center gap-2 border-l border-gp-border pl-4">
                <span className="text-[10px] font-bold uppercase text-gp-text-muted tracking-wider">Group:</span>
                <select 
                    value={groupBy}
                    onChange={(e) => setGroupBy(e.target.value as GroupMode)}
                    className="bg-gp-input border border-gp-border text-xs rounded p-1.5 text-gp-text-main focus:outline-none focus:border-gp-red font-medium"
                >
                    <option value="none">None</option>
                    <option value="location">Location</option>
                    <option value="brand">Brand</option>
                    <option value="type">Type</option>
                </select>
            </div>

            {/* Bulk Selection (Admin Only) */}
            {props.isAdmin && !props.isReadOnly && (
                <div className="flex items-center gap-2 border-l border-gp-border pl-4">
                    <button 
                        onClick={() => handleSelectAll(sortedItems)}
                        className="text-xs font-bold text-gp-text-muted hover:text-gp-text-main uppercase"
                    >
                        {selectedIds.size === sortedItems.length ? 'Deselect All' : 'Select All'}
                    </button>
                </div>
            )}
        </div>

        <div className="flex bg-gp-input border border-gp-border rounded-lg p-1 gap-1 shadow-inner lg:mx-4">
            <button
                onClick={() => props.onViewModeChange(ViewMode.TABLE)}
                className={`p-2 rounded text-xs uppercase font-bold flex items-center gap-2 transition-all ${props.viewMode === ViewMode.TABLE ? 'bg-gp-panel text-gp-text-main shadow-sm' : 'text-gp-text-muted hover:text-gp-text-main'}`}
            >
                <span>Sheet</span>
            </button>
            <button
                onClick={() => props.onViewModeChange(ViewMode.GRID)}
                className={`p-2 rounded text-xs uppercase font-bold flex items-center gap-2 transition-all ${props.viewMode === ViewMode.GRID ? 'bg-gp-panel text-gp-text-main shadow-sm' : 'text-gp-text-muted hover:text-gp-text-main'}`}
            >
                <span>Card</span>
            </button>
            <button
                onClick={() => props.onViewModeChange(ViewMode.LIST)}
                className={`p-2 rounded text-xs uppercase font-bold flex items-center gap-2 transition-all ${props.viewMode === ViewMode.LIST ? 'bg-gp-panel text-gp-text-main shadow-sm' : 'text-gp-text-muted hover:text-gp-text-main'}`}
            >
                <span>List</span>
            </button>
        </div>

        {/* Filters & Toggles */}
        <div className="flex items-center gap-3 lg:border-l border-gp-border lg:pl-4 overflow-x-auto">
             
             {/* Show Images Toggle */}
             <label className="flex items-center gap-1.5 cursor-pointer mr-2 border-r border-gp-border pr-4">
                <input 
                    type="checkbox" 
                    checked={showImages} 
                    onChange={e => setShowImages(e.target.checked)}
                    className="rounded border-gp-border bg-gp-input text-gp-red focus:ring-gp-red"
                />
                <span className="text-xs text-gp-text-main font-bold select-none whitespace-nowrap flex items-center gap-1">
                    <svg className="w-4 h-4 text-gp-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Enable Visuals
                </span>
             </label>

             {/* Aspect Ratio Selector - Only visible if images enabled */}
             {showImages && (
                <div className="flex items-center gap-1 mr-4 border-r border-gp-border pr-4">
                    <span className="text-[10px] font-bold uppercase text-gp-text-muted">Ratio:</span>
                    <select
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                        className="bg-gp-input border border-gp-border text-xs rounded p-1 text-gp-text-main focus:outline-none focus:border-gp-red"
                    >
                        <option value="1:1">1:1</option>
                        <option value="4:3">4:3</option>
                        <option value="3:4">3:4</option>
                        <option value="16:9">16:9</option>
                    </select>
                </div>
             )}

             {/* Hide Low Stock Toggle */}
             <label className="flex items-center gap-1.5 cursor-pointer mr-4 border-r border-gp-border pr-4">
                <input 
                    type="checkbox" 
                    checked={hideLowStock} 
                    onChange={e => setHideLowStock(e.target.checked)}
                    className="rounded border-gp-border bg-gp-input text-gp-red focus:ring-gp-red"
                />
                <span className="text-xs text-gp-text-main font-medium select-none whitespace-nowrap">Hide Low Stock</span>
             </label>

             <span className="text-[10px] font-bold uppercase text-gp-text-muted tracking-wider whitespace-nowrap">Show:</span>
             <label className="flex items-center gap-1.5 cursor-pointer">
                <input 
                    type="checkbox" 
                    checked={visibleColumns.location} 
                    onChange={e => setVisibleColumns({...visibleColumns, location: e.target.checked})}
                    className="rounded border-gp-border bg-gp-input text-gp-red focus:ring-gp-red"
                />
                <span className="text-xs text-gp-text-main font-medium select-none">Loc</span>
             </label>
             <label className="flex items-center gap-1.5 cursor-pointer">
                <input 
                    type="checkbox" 
                    checked={visibleColumns.specs} 
                    onChange={e => setVisibleColumns({...visibleColumns, specs: e.target.checked})}
                    className="rounded border-gp-border bg-gp-input text-gp-red focus:ring-gp-red"
                />
                <span className="text-xs text-gp-text-main font-medium select-none">Specs</span>
             </label>
             <label className="flex items-center gap-1.5 cursor-pointer">
                <input 
                    type="checkbox" 
                    checked={visibleColumns.price} 
                    onChange={e => setVisibleColumns({...visibleColumns, price: e.target.checked})}
                    className="rounded border-gp-border bg-gp-input text-gp-red focus:ring-gp-red"
                />
                <span className="text-xs text-gp-text-main font-medium select-none">Price</span>
             </label>
             
             <label className="flex items-center gap-1.5 cursor-pointer">
                <input 
                    type="checkbox" 
                    checked={visibleColumns.cost} 
                    onChange={e => setVisibleColumns({...visibleColumns, cost: e.target.checked})}
                    className="rounded border-gp-border bg-gp-input text-gp-red focus:ring-gp-red"
                />
                <span className="text-xs text-gp-text-main font-medium select-none">Cost</span>
             </label>
        </div>

      </div>

      {/* Bulk Action Bar - Shows when items are selected */}
      {selectedIds.size > 0 && props.isAdmin && !props.isReadOnly && (
        <div className="bg-gp-red text-white p-3 rounded-lg flex items-center justify-between shadow-lg animate-fade-in-up">
            <span className="font-bold text-sm uppercase tracking-wide px-2">
                {selectedIds.size} Items Selected
            </span>
            <div className="flex gap-2">
                <button 
                    onClick={() => setSelectedIds(new Set())}
                    className="px-4 py-1.5 rounded border border-white/30 hover:bg-white/10 text-xs font-bold uppercase transition-colors"
                >
                    Cancel
                </button>
                <button 
                    onClick={handleBulkAction}
                    className="px-4 py-1.5 rounded bg-white text-gp-red font-bold text-xs uppercase hover:bg-gray-100 transition-colors shadow-sm"
                >
                    Delete Selected
                </button>
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
