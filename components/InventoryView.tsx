
import React, { useState, useMemo, useEffect } from 'react';
import { InventoryItem, ProductType, TyreProduct, WheelProduct, CoiloverProduct, ViewMode } from '../types';
import { formatCurrency, getStatusColor } from '../utils';
import { GoogleGenAI } from "@google/genai";
import { buildSupplierImageMap, fetchSupplierStockImages, inventoryItemToSupplierImageLookup } from '../supplierStockImages';

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
}

// --- CONFIG TYPES ---
type SortKey = 'brand' | 'size' | 'quantity' | 'price' | 'location';
type SortDirection = 'asc' | 'desc';
type GroupMode = 'none' | 'location' | 'brand' | 'type';
type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '9:16' | '16:9' | '21:9';

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

const getItemDisplayName = (item: InventoryItem): string => {
  if (item.type === ProductType.TYRE) {
    const tyre = item as TyreProduct;
    if (isSupplierTyre(item)) return tyre.pattern || tyre.imageDesignKey || tyre.size;
    return tyre.size;
  }
  if (item.type === ProductType.WHEEL) return getWheelDisplayName(item as WheelProduct);
  return (item as CoiloverProduct).vehicleCompatibility;
};

const getItemSecondaryLine = (item: InventoryItem): string => {
  if (item.type === ProductType.TYRE) {
    const tyre = item as TyreProduct;
    if (isSupplierTyre(item)) {
      return [tyre.size, tyre.brand, tyre.loadSpeedIndex].filter(Boolean).join(' / ');
    }
    return `${tyre.brand} ${tyre.pattern}`.trim();
  }
  if (item.type === ProductType.WHEEL) {
    const wheel = item as WheelProduct;
    return [wheel.size, wheel.pcd, wheel.offset ? `ET${wheel.offset}` : ''].filter(Boolean).join(' / ');
  }
  const coilover = item as CoiloverProduct;
  return `${coilover.brand} ${coilover.series}`.trim();
};

const getDragFileName = (item: InventoryItem): string => (
  `${getItemDisplayName(item).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'gp-wheel'}.jpg`
);

// --- SUB-COMPONENTS ---

const SpecBadge = ({ label, value }: { label: string; value: string | number }) => (
  <div className="flex flex-col bg-gp-overlay p-1.5 rounded border border-gp-border min-w-[60px]">
    <span className="text-[9px] text-gp-text-muted uppercase font-bold tracking-wider truncate">{label}</span>
    <span className="text-xs text-gp-text-main font-mono font-bold truncate">{value}</span>
  </div>
);

// --- IMAGE COMPONENT ---
interface ProductImageProps {
  item: InventoryItem;
  imageUrl?: string;
  isLoading: boolean;
  isError: boolean;
  onGenerate: () => void;
  aspectRatio: AspectRatio;
}

const ProductImage: React.FC<ProductImageProps> = ({ item, imageUrl, isLoading, isError, onGenerate, aspectRatio }) => {
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
  
  return (
    <div className={`w-full ${aspectClass} bg-gp-black border-b border-gp-border relative overflow-hidden group`}>
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
              <div className="w-6 h-6 border-2 border-gp-red border-t-transparent rounded-full animate-spin"></div>
              <span className="text-[10px] text-gp-text-muted font-bold animate-pulse">SOURCING IMAGE...</span>
            </div>
          ) : isError ? (
             <div className="flex flex-col items-center gap-1 text-gp-text-muted opacity-50">
               <div className="relative">
                 <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                 <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full h-0.5 bg-gp-red rotate-45 transform origin-center"></div>
                 </div>
               </div>
               <span className="text-[9px] uppercase font-bold">No Image Found</span>
             </div>
          ) : (
            <button 
              onClick={(e) => { e.stopPropagation(); onGenerate(); }}
              className="group/btn flex flex-col items-center gap-2 text-gp-text-muted hover:text-gp-text-main transition-colors"
            >
              <div className="p-3 rounded-full bg-gp-input group-hover/btn:bg-gp-border transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">Load Visual</span>
            </button>
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
  onGenerateImage: (item: InventoryItem) => void;
}

const SpreadsheetView: React.FC<ViewComponentProps> = ({ items, isAdmin, onEdit, onDelete, onSell, onReserve, visibleColumns, sortConfig, onHeaderClick, selectedIds, onToggleSelect, isReadOnly, showImages, generatedImages, loadingImages, errorImages, onGenerateImage, aspectRatio }) => {
  
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
            {showImages && <th className="p-3 border-r border-b border-gp-border w-24 text-center">Visual</th>}
            <th className="p-3 border-r border-b border-gp-border w-16 text-center">Type</th>
            <Header label="Main Spec" colKey="size" />
            {visibleColumns.specs && <Header label="Brand / Model" colKey="brand" />}
            {visibleColumns.specs && <th className="p-3 border-r border-b border-gp-border">Details</th>}
            {visibleColumns.location && <Header label="Location" colKey="location" />}
            <Header label="Qty" colKey="quantity" align="center" />
            {visibleColumns.cost && <th className="p-3 border-r border-b border-gp-border text-right text-green-600 bg-green-900/10">Cost</th>}
            {visibleColumns.price && <Header label={isReadOnly ? "Selling Price" : "Sell Price"} colKey="price" align="right" />}
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

              {showImages && (
                <td className="p-1 border-r border-gp-border w-24">
                    <div className="w-20 h-20 mx-auto rounded overflow-hidden border border-gp-border">
                        <ProductImage 
                            item={item} 
                            imageUrl={generatedImages[item.id]} 
                            isLoading={loadingImages.has(item.id)}
                            isError={errorImages.has(item.id)}
                            onGenerate={() => onGenerateImage(item)}
                            aspectRatio={aspectRatio}
                        />
                    </div>
                </td>
              )}

              <td className="p-3 border-r border-gp-border text-center">
                <span className="text-[9px] font-bold bg-gp-overlay px-1.5 py-0.5 rounded text-gp-text-muted">{item.type.charAt(0)}</span>
              </td>
              
              <td className="p-3 border-r border-gp-border font-bold text-gp-text-main">
                {getItemDisplayName(item)}
              </td>

              {visibleColumns.specs && (
                <td className="p-3 border-r border-gp-border text-gp-text-main opacity-90">
                  {item.type === ProductType.TYRE ? (item as TyreProduct).brand : 
                   item.type === ProductType.WHEEL ? (item as WheelProduct).code : 
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

const GridView: React.FC<ViewComponentProps> = ({ items, isAdmin, onEdit, onDelete, onSell, onReserve, visibleColumns, selectedIds, onToggleSelect, isReadOnly, showImages, generatedImages, loadingImages, errorImages, onGenerateImage, aspectRatio }) => {
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
                onGenerate={() => onGenerateImage(item)}
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
              <span className="text-[9px] bg-gp-black text-gp-text-muted px-2 py-0.5 rounded font-bold uppercase tracking-wide border border-gp-border">
                {item.type}
              </span>
              <h3 className="text-xl font-black text-gp-text-main mt-2 leading-none font-display tracking-wide truncate max-w-full">
                {getItemDisplayName(item)}
              </h3>
              {visibleColumns.specs && (
                <p className="text-xs text-gp-silver mt-1 uppercase font-semibold truncate max-w-full">
                    {getItemSecondaryLine(item)}
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
            <div className="p-3 grid grid-cols-3 gap-2 flex-grow content-start bg-gradient-to-b from-gp-panel to-gp-overlay">
                {item.type === ProductType.TYRE && (
                    <>
                    <SpecBadge label="Index" value={(item as TyreProduct).loadSpeedIndex || '-'} />
                    {visibleColumns.location && <SpecBadge label="Loc" value={(item as TyreProduct).location} />}
                    <SpecBadge label="Cat" value="PCR" />
                    </>
                )}
                {item.type === ProductType.WHEEL && (
                    <>
                    <SpecBadge label="Size" value={(item as WheelProduct).size} />
                    <SpecBadge label="PCD" value={(item as WheelProduct).pcd} />
                    <SpecBadge label="ET" value={(item as WheelProduct).offset} />
                    {(item as WheelProduct).location && (
                       <div className="col-span-3 mt-1 flex flex-col bg-black/10 p-1.5 rounded border border-gp-border/50">
                           <span className="text-[9px] text-gp-text-muted uppercase font-bold tracking-wider">Warehouse Stock</span>
                           <span className="text-[10px] font-mono font-bold text-gp-text-main truncate">{(item as WheelProduct).location}</span>
                       </div>
                    )}
                    </>
                )}
                {item.type === ProductType.COILOVER && (
                    <>
                    <SpecBadge label="Series" value={(item as CoiloverProduct).series} />
                    <div className="col-span-2"><SpecBadge label="Fitment" value={(item as CoiloverProduct).vehicleCompatibility} /></div>
                    </>
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
                        <span className="text-[9px] text-gp-red uppercase font-bold tracking-wider">{isReadOnly ? "Selling Price" : "Selling Price"}</span>
                        <span className="text-xl font-bold text-gp-text-main font-mono">{formatCurrency(item.sellingPrice)}</span>
                    </div>

                    {!isReadOnly && (
                        <div className="flex gap-1">
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
                        </div>
                    )}
                </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const ListView: React.FC<ViewComponentProps> = ({ items, onEdit, onSell, onReserve, visibleColumns, isAdmin, selectedIds, onToggleSelect, isReadOnly, showImages, generatedImages, loadingImages, errorImages, onGenerateImage, aspectRatio }) => {
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
                        onGenerate={() => onGenerateImage(item)}
                        aspectRatio={aspectRatio}
                    />
                 </div>
               )}

               <div className="flex flex-col cursor-pointer" onClick={() => !isReadOnly && onEdit(item)}>
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

              {visibleColumns.price && <span className="text-base font-bold text-gp-text-main font-mono">{formatCurrency(item.sellingPrice)}</span>}
              
              {!isReadOnly && (
                <div className="flex gap-2">
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
                </div>
              )}
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
  const supplierImageLookupItems = useMemo(
    () => props.items.filter((item) => inventoryItemToSupplierImageLookup(item)),
    [props.items]
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
  }, [showImages, supplierImageLookupSignature]);

  // Function to generate image using Gemini
  const handleGenerateImage = async (item: InventoryItem) => {
    if (loadingImages.has(item.id)) return;

    setLoadingImages(prev => new Set(prev).add(item.id));
    setErrorImages(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
    });

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        let prompt = '';
        if (item.type === ProductType.TYRE) {
            const t = item as TyreProduct;
            prompt = `High quality studio photography of a ${t.brand} ${t.pattern} tyre tread pattern. Close up, detailed, professional lighting, white background. Size: ${t.size}`;
        } else if (item.type === ProductType.WHEEL) {
            const w = item as WheelProduct;
            prompt = `High quality studio photography of a ${w.code} alloy wheel, color ${w.colour}. Professional lighting, white background.`;
        } else {
            const c = item as CoiloverProduct;
            prompt = `High quality studio photography of ${c.brand} ${c.series} coilovers for ${c.vehicleCompatibility}. Professional lighting, white background.`;
        }

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: {
                parts: [{ text: prompt }]
            },
            config: {
                imageConfig: {
                    aspectRatio: aspectRatio,
                    imageSize: "1K"
                },
                tools: [{ googleSearch: {} }] // Use search to ground the generation for accuracy
            }
        });

        // Find image part
        let imageUrl = '';
        if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    const base64String = part.inlineData.data;
                    imageUrl = `data:image/png;base64,${base64String}`;
                    break;
                }
            }
        }

        if (imageUrl) {
            setGeneratedImages(prev => ({ ...prev, [item.id]: imageUrl }));
        } else {
            throw new Error("No image generated");
        }

    } catch (err) {
        console.error("Image generation failed", err);
        setErrorImages(prev => new Set(prev).add(item.id));
    } finally {
        setLoadingImages(prev => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
        });
    }
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
  }, [props.items]);

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
        onGenerateImage: handleGenerateImage,
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
      {Object.entries(groupedItems).map(([groupTitle, groupItems]) => {
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

    </div>
  );
};
