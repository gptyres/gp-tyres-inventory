import React, { useEffect, useMemo, useState } from 'react';
import {
  CartItem,
  CoiloverProduct,
  CustomerInfo,
  InventoryItem,
  ProductType,
  StaffName,
  TyreProduct,
  WheelProduct
} from '../types';
import { STAFF_NAMES } from '../config';
import { formatCurrency, searchInventory } from '../utils';

interface ServicePreset {
  title: string;
  price: number;
}

interface ManualLineInput {
  title: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

interface POSModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: InventoryItem[];
  supplierItems: InventoryItem[];
  cart: CartItem[];
  customerInfo: CustomerInfo;
  onCustomerInfoChange: (customerInfo: CustomerInfo) => void;
  onAddItem: (item: InventoryItem) => void;
  onAddSupplierItem: (item: InventoryItem) => void;
  onAddService: (service: ServicePreset) => void;
  onAddManualLine: (line: ManualLineInput) => void;
  onRemoveItem: (itemId: string) => void;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onUpdateDiscount: (itemId: string, discount: number) => void;
  onUpdateLineTotal: (itemId: string, lineTotal: number) => void;
  onCompleteSale: (staffName: StaffName) => Promise<void>;
  onGenerateQuote: (staffName?: StaffName) => void;
  isCompletingSale: boolean;
}

const SERVICE_PRESETS: ServicePreset[] = [
  { title: 'FITMENT', price: 50 },
  { title: 'BALANCING', price: 50 },
  { title: 'WHEEL ALIGNMENT', price: 350 },
  { title: 'COILOVER INSTALLATION', price: 1500 }
];

const getInventoryTitle = (item: InventoryItem) => {
  if (item.type === ProductType.TYRE) {
    const tyre = item as TyreProduct;
    return `${tyre.size} ${tyre.brand}`.trim();
  }
  if (item.type === ProductType.WHEEL) {
    const wheel = item as WheelProduct;
    return `${wheel.code} ${wheel.size}`.trim();
  }
  const coilover = item as CoiloverProduct;
  return `${coilover.brand} ${coilover.vehicleCompatibility}`.trim();
};

const getInventoryMeta = (item: InventoryItem) => {
  if (item.type === ProductType.TYRE) {
    const tyre = item as TyreProduct;
    return [tyre.pattern, tyre.loadSpeedIndex, tyre.location].filter(Boolean).join(' | ');
  }
  if (item.type === ProductType.WHEEL) {
    const wheel = item as WheelProduct;
    return [wheel.pcd, wheel.offset ? `ET${wheel.offset}` : '', wheel.colour].filter(Boolean).join(' | ');
  }
  const coilover = item as CoiloverProduct;
  return coilover.series;
};

const getLineTotal = (item: CartItem) => {
  return Math.max(0, item.sellingPrice - item.appliedDiscount) * item.cartQuantity;
};

const getMaxQuantity = (item: CartItem) => {
  return item.cartLineType === 'INVENTORY' || item.cartLineType === 'SUPPLIER' ? Math.max(1, item.quantity) : 999;
};

const hasSearchText = (query: string) => query.trim().length > 0;

export const POSModal: React.FC<POSModalProps> = ({
  isOpen,
  onClose,
  items,
  supplierItems,
  cart,
  customerInfo,
  onCustomerInfoChange,
  onAddItem,
  onAddSupplierItem,
  onAddService,
  onAddManualLine,
  onRemoveItem,
  onUpdateQuantity,
  onUpdateDiscount,
  onUpdateLineTotal,
  onCompleteSale,
  onGenerateQuote,
  isCompletingSale
}) => {
  const [query, setQuery] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<StaffName | ''>('');
  const [message, setMessage] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualQuantity, setManualQuantity] = useState(1);
  const [manualUnitPrice, setManualUnitPrice] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setMessage('');
    }
  }, [isOpen]);

  const availableItems = useMemo(() => items.filter(item => item.quantity > 0), [items]);
  const availableSupplierItems = useMemo(() => supplierItems.filter(item => item.quantity > 0), [supplierItems]);

  const searchResults = useMemo(() => {
    const results = searchInventory(availableItems, query.trim());
    return results.slice(0, query.trim() ? 30 : 12);
  }, [availableItems, query]);

  const supplierSearchResults = useMemo(() => {
    const cleanedQuery = query.trim();
    if (cleanedQuery.length < 2) return [];
    return searchInventory(availableSupplierItems, cleanedQuery).slice(0, 24);
  }, [availableSupplierItems, query]);

  const totals = useMemo(() => {
    return cart.reduce(
      (acc, item) => ({
        subtotal: acc.subtotal + item.sellingPrice * item.cartQuantity,
        discount: acc.discount + item.appliedDiscount * item.cartQuantity,
        total: acc.total + getLineTotal(item)
      }),
      { subtotal: 0, discount: 0, total: 0 }
    );
  }, [cart]);

  if (!isOpen) return null;

  const customerMissing = !customerInfo.fullName.trim() || !customerInfo.contactDetail.trim();

  const updateCustomerField = (field: keyof CustomerInfo, value: string) => {
    onCustomerInfoChange({
      ...customerInfo,
      [field]: value
    });
  };

  const handleAddManualLine = () => {
    if (!manualTitle.trim()) {
      setMessage('Enter a manual item description before adding it to the cart.');
      return;
    }
    if (manualQuantity < 1) {
      setMessage('Manual line quantity must be at least 1.');
      return;
    }

    onAddManualLine({
      title: manualTitle.trim(),
      description: manualDescription.trim(),
      quantity: manualQuantity,
      unitPrice: Math.max(0, manualUnitPrice)
    });
    setManualTitle('');
    setManualDescription('');
    setManualQuantity(1);
    setManualUnitPrice(0);
    setMessage('');
  };

  const handleAddSearchAsQuoteLine = () => {
    const title = query.trim();
    if (title.length < 2) {
      setMessage('Search for the item first, then add it as a custom quote line.');
      return;
    }

    onAddManualLine({
      title,
      description: 'Custom quote line',
      quantity: 1,
      unitPrice: 0
    });
    setManualTitle('');
    setManualDescription('');
    setManualQuantity(1);
    setManualUnitPrice(0);
    setMessage('Custom quote line added. Edit the line total in the register before generating the quote.');
  };

  const handleCompleteSale = async () => {
    if (!cart.length) {
      setMessage('Add stock, a service, or a manual line before completing a sale.');
      return;
    }
    if (customerMissing) {
      setMessage('Customer full name and contact detail are required.');
      return;
    }
    if (!selectedStaff) {
      setMessage('Select the staff member handling this sale.');
      return;
    }
    setMessage('');
    await onCompleteSale(selectedStaff);
  };

  const handleQuote = () => {
    if (!cart.length) {
      setMessage('Add stock, a service, or a manual line before generating a quote.');
      return;
    }
    if (customerMissing) {
      setMessage('Customer full name and contact detail are required.');
      return;
    }
    setMessage('');
    onGenerateQuote(selectedStaff || undefined);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
      <div className="flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-gp-border bg-gp-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-gp-border bg-gp-dark px-4 py-3">
          <div>
            <h2 className="font-display text-xl font-black uppercase tracking-wider text-gp-text-main">Quick POS</h2>
            <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-gp-text-muted">Customer, services, manual lines, stock, sale or quote</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gp-text-muted transition-colors hover:bg-gp-border hover:text-gp-text-main"
            title="Close POS"
            aria-label="Close POS"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1.12fr_0.88fr]">
          <section className="min-h-0 overflow-y-auto border-b border-gp-border lg:border-b-0 lg:border-r">
            <div className="space-y-4 p-4">
              <div className="rounded-md border border-gp-border bg-gp-black/40 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-display text-sm font-black uppercase tracking-wider text-gp-text-main">Customer Information</h3>
                  <span className="text-[10px] font-bold uppercase text-gp-red">Required</span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">Full Name</label>
                    <input
                      value={customerInfo.fullName}
                      onChange={(event) => updateCustomerField('fullName', event.target.value)}
                      placeholder="Customer full name"
                      className="h-10 w-full rounded border border-gp-border bg-gp-input px-3 text-sm text-gp-text-main outline-none placeholder:text-gp-text-muted focus:border-gp-red"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">Phone or Email</label>
                    <input
                      value={customerInfo.contactDetail}
                      onChange={(event) => updateCustomerField('contactDetail', event.target.value)}
                      placeholder="Phone number or email"
                      className="h-10 w-full rounded border border-gp-border bg-gp-input px-3 text-sm text-gp-text-main outline-none placeholder:text-gp-text-muted focus:border-gp-red"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">Vehicle Details</label>
                    <input
                      value={customerInfo.vehicleDetails}
                      onChange={(event) => updateCustomerField('vehicleDetails', event.target.value)}
                      placeholder="Vehicle make, model, registration, notes"
                      className="h-10 w-full rounded border border-gp-border bg-gp-input px-3 text-sm text-gp-text-main outline-none placeholder:text-gp-text-muted focus:border-gp-red"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-gp-border bg-gp-dark p-4">
                <h3 className="mb-3 font-display text-sm font-black uppercase tracking-wider text-gp-text-main">Services</h3>
                <div className="grid grid-cols-2 gap-2">
                  {SERVICE_PRESETS.map(service => (
                    <button
                      key={service.title}
                      onClick={() => onAddService(service)}
                      className="flex items-center justify-between rounded border border-gp-border bg-gp-input px-3 py-2 text-left transition-colors hover:border-gp-red hover:bg-gp-panel"
                    >
                      <span className="text-xs font-black uppercase text-gp-text-main">{service.title}</span>
                      <span className="font-mono text-xs font-bold text-gp-text-muted">{formatCurrency(service.price)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-gp-border bg-gp-dark p-4">
                <h3 className="mb-3 font-display text-sm font-black uppercase tracking-wider text-gp-text-main">Manual Item Line</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_86px_120px_auto]">
                  <input
                    value={manualTitle}
                    onChange={(event) => setManualTitle(event.target.value)}
                    placeholder="Item or service description"
                    className="h-10 rounded border border-gp-border bg-gp-input px-3 text-sm text-gp-text-main outline-none placeholder:text-gp-text-muted focus:border-gp-red"
                  />
                  <input
                    type="number"
                    min="1"
                    value={manualQuantity}
                    onChange={(event) => setManualQuantity(Math.max(1, parseInt(event.target.value, 10) || 1))}
                    className="h-10 rounded border border-gp-border bg-gp-input px-3 text-center font-mono text-sm font-bold text-gp-text-main outline-none focus:border-gp-red"
                    aria-label="Manual line quantity"
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={manualUnitPrice}
                    onChange={(event) => setManualUnitPrice(parseFloat(event.target.value) || 0)}
                    className="h-10 rounded border border-gp-border bg-gp-input px-3 text-right font-mono text-sm font-bold text-gp-text-main outline-none focus:border-gp-red"
                    aria-label="Manual line unit price"
                  />
                  <button
                    onClick={handleAddManualLine}
                    className="h-10 rounded bg-gp-red px-4 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-red-700"
                  >
                    Add Line
                  </button>
                </div>
                <input
                  value={manualDescription}
                  onChange={(event) => setManualDescription(event.target.value)}
                  placeholder="Optional notes shown under the line item"
                  className="mt-3 h-10 w-full rounded border border-gp-border bg-gp-input px-3 text-sm text-gp-text-main outline-none placeholder:text-gp-text-muted focus:border-gp-red"
                />
              </div>

              <div className="rounded-md border border-gp-border bg-gp-black/40 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">Find Stock for Sale or Quote</label>
                  <span className="text-[10px] font-bold uppercase text-gp-text-muted">GP stock first, suppliers second</span>
                </div>
                <div className="relative">
                  <svg className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gp-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                  </svg>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    autoFocus
                    placeholder="Search current stock and supplier stock..."
                    className="h-12 w-full rounded-md border border-gp-border bg-gp-input py-3 pl-10 pr-3 text-sm text-gp-text-main outline-none transition-colors placeholder:text-gp-text-muted focus:border-gp-red"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="font-display text-xs font-black uppercase tracking-wider text-gp-text-main">Current Available Stock</h3>
                  <span className="text-[10px] font-bold uppercase text-gp-text-muted">Main stock source</span>
                </div>
                <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                  {searchResults.map(item => {
                    const inCart = cart.find(cartItem => cartItem.cartLineType === 'INVENTORY' && cartItem.inventoryItemId === item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => onAddItem(item)}
                        className="group flex min-h-[94px] w-full items-stretch overflow-hidden rounded-md border border-gp-border bg-gp-black text-left transition-colors hover:border-gp-red/60 hover:bg-gp-input"
                      >
                        <div className="flex w-14 shrink-0 flex-col items-center justify-center border-r border-gp-border bg-gp-panel">
                          <span className="text-[9px] font-black uppercase text-gp-text-muted">{item.type.slice(0, 1)}</span>
                          <span className="font-display text-2xl font-black text-gp-text-main">{item.quantity}</span>
                        </div>
                        <div className="min-w-0 flex-1 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-display text-base font-black uppercase text-gp-text-main">{getInventoryTitle(item)}</p>
                              <p className="mt-1 line-clamp-2 text-xs text-gp-text-muted">{getInventoryMeta(item)}</p>
                            </div>
                            <span className="shrink-0 rounded bg-gp-overlay px-2 py-1 font-mono text-xs font-bold text-gp-text-main">
                              {formatCurrency(item.sellingPrice)}
                            </span>
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">
                              {inCart ? `${inCart.cartQuantity} in cart` : 'Tap to add'}
                            </span>
                            <span className="rounded-full bg-gp-red px-2 py-1 text-[10px] font-black uppercase text-white opacity-0 transition-opacity group-hover:opacity-100">
                              Add
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {hasSearchText(query) && searchResults.length === 0 && (
                  <div className="rounded-md border border-dashed border-gp-border bg-gp-black/40 p-4 text-sm text-gp-text-muted">
                    No current GP stock matched this search. Check supplier stock below or add it as a custom quote line.
                  </div>
                )}
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-display text-xs font-black uppercase tracking-wider text-gp-text-main">Supplier Stock</h3>
                  <span className="text-[10px] font-bold uppercase text-gp-text-muted">Secondary stock source</span>
                </div>

                {query.trim().length < 2 ? (
                  <div className="rounded-md border border-blue-900/40 bg-blue-950/10 p-4 text-xs font-bold uppercase tracking-wide text-gp-text-muted">
                    Enter at least 2 characters to search all supplier catalogues.
                  </div>
                ) : supplierSearchResults.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                    {supplierSearchResults.map(item => {
                      const inCart = cart.find(cartItem => cartItem.cartLineType === 'SUPPLIER' && cartItem.inventoryItemId === item.id);
                      return (
                        <button
                          key={item.id}
                          onClick={() => onAddSupplierItem(item)}
                          className="group flex min-h-[94px] w-full items-stretch overflow-hidden rounded-md border border-blue-900/50 bg-gp-black text-left transition-colors hover:border-blue-500/70 hover:bg-gp-input"
                        >
                          <div className="flex w-14 shrink-0 flex-col items-center justify-center border-r border-gp-border bg-blue-950/30">
                            <span className="text-[9px] font-black uppercase text-blue-400">{item.type.slice(0, 1)}</span>
                            <span className="font-display text-2xl font-black text-gp-text-main">{item.quantity}</span>
                          </div>
                          <div className="min-w-0 flex-1 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-display text-base font-black uppercase text-gp-text-main">{getInventoryTitle(item)}</p>
                                <p className="mt-1 line-clamp-2 text-xs text-gp-text-muted">{getInventoryMeta(item)}</p>
                              </div>
                              <span className="shrink-0 rounded bg-gp-overlay px-2 py-1 font-mono text-xs font-bold text-gp-text-main">
                                {formatCurrency(item.sellingPrice)}
                              </span>
                            </div>
                            <div className="mt-3 flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">
                                {inCart ? `${inCart.cartQuantity} in cart` : 'Tap to add'}
                              </span>
                              <span className="rounded-full bg-blue-600 px-2 py-1 text-[10px] font-black uppercase text-white opacity-0 transition-opacity group-hover:opacity-100">
                                Add
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-md border border-blue-900/50 bg-blue-950/10 p-4">
                    <p className="text-sm font-bold text-gp-text-main">No supplier stock matched this search.</p>
                    <p className="mt-1 text-xs text-gp-text-muted">Add the searched item as a custom quote line, then edit the price in the register.</p>
                    <button
                      onClick={handleAddSearchAsQuoteLine}
                      className="mt-3 rounded bg-blue-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-blue-500"
                    >
                      Add to Quote
                    </button>
                  </div>
                )}

                {query.trim().length >= 2 && supplierSearchResults.length > 0 && (
                  <div className="mt-3 rounded-md border border-gp-border bg-gp-black/40 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-gp-text-muted">Still cannot find the exact supplier item?</p>
                      <button
                        onClick={handleAddSearchAsQuoteLine}
                        className="rounded border border-blue-700 px-3 py-2 text-xs font-black uppercase tracking-wider text-blue-300 transition-colors hover:bg-blue-950/40"
                      >
                        Add Search as Quote Line
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="flex min-h-0 flex-col bg-gp-dark">
            <div className="border-b border-gp-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-black uppercase tracking-wide text-gp-text-main">Register</h3>
                  <p className="text-xs text-gp-text-muted">{cart.length} line item{cart.length === 1 ? '' : 's'}</p>
                </div>
                <div className="rounded-md border border-gp-border bg-gp-black px-3 py-2 text-right">
                  <p className="text-[10px] font-bold uppercase text-gp-text-muted">Total</p>
                  <p className="font-display text-2xl font-black text-gp-text-main">{formatCurrency(totals.total)}</p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {cart.length === 0 ? (
                <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-md border border-dashed border-gp-border bg-gp-black/40 p-6 text-center">
                  <svg className="mb-3 h-12 w-12 text-gp-text-muted opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-2 4h14M9 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z" />
                  </svg>
                  <p className="font-display text-sm font-black uppercase tracking-wider text-gp-text-main">Cart Empty</p>
                  <p className="mt-1 max-w-xs text-xs text-gp-text-muted">Add stock, services, or a manual item line.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map(item => (
                    <div key={item.id} className="rounded-md border border-gp-border bg-gp-panel p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-gp-input px-1.5 py-0.5 text-[9px] font-black uppercase text-gp-text-muted">{item.cartLineType}</span>
                            <p className="truncate font-bold text-gp-text-main">{item.title}</p>
                          </div>
                          {item.description && <p className="mt-0.5 truncate text-xs text-gp-text-muted">{item.description}</p>}
                        </div>
                        <button
                          onClick={() => onRemoveItem(item.id)}
                          className="rounded p-1 text-gp-text-muted transition-colors hover:bg-red-900/30 hover:text-red-400"
                          title="Remove item"
                          aria-label="Remove item"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      <div className="mt-3 grid grid-cols-[132px_1fr] gap-3">
                        <div>
                          <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-gp-text-muted">Qty</label>
                          <div className="flex h-10 items-center">
                            <button
                              onClick={() => onUpdateQuantity(item.id, item.cartQuantity - 1)}
                              className="h-10 w-10 rounded-l border border-gp-border bg-gp-input font-bold text-gp-text-main hover:bg-gp-border"
                              type="button"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              max={getMaxQuantity(item)}
                              value={item.cartQuantity}
                              onChange={(event) => onUpdateQuantity(item.id, parseInt(event.target.value, 10) || 1)}
                              className="h-10 w-12 border-y border-gp-border bg-gp-black text-center font-mono font-bold text-gp-text-main outline-none"
                            />
                            <button
                              onClick={() => onUpdateQuantity(item.id, item.cartQuantity + 1)}
                              className="h-10 w-10 rounded-r border border-gp-border bg-gp-input font-bold text-gp-text-main hover:bg-gp-border"
                              type="button"
                            >
                              +
                            </button>
                          </div>
                          <p className="mt-1 text-[10px] text-gp-text-muted">
                            {item.cartLineType === 'INVENTORY' || item.cartLineType === 'SUPPLIER' ? `Available: ${item.quantity}` : 'Non-stock line'}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-gp-text-muted">Discount Each</label>
                            <input
                              type="number"
                              min="0"
                              max={item.sellingPrice}
                              step="1"
                              value={item.appliedDiscount}
                              onChange={(event) => onUpdateDiscount(item.id, parseFloat(event.target.value) || 0)}
                              className="h-10 w-full rounded border border-gp-border bg-gp-black px-2 text-right font-mono font-bold text-gp-text-main outline-none focus:border-gp-red"
                            />
                          </div>
                          <div className="text-right">
                            <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-gp-text-muted">Line Total</p>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={Number(getLineTotal(item).toFixed(2))}
                              onChange={(event) => onUpdateLineTotal(item.id, parseFloat(event.target.value) || 0)}
                              className="h-10 w-full rounded border border-gp-border bg-gp-black px-2 text-right font-mono font-bold text-gp-text-main outline-none focus:border-gp-red"
                              aria-label={`Line total for ${item.title}`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-gp-border bg-gp-black p-4">
              <div className="mb-3 grid grid-cols-3 gap-2 rounded-md border border-gp-border bg-gp-panel p-3 text-sm">
                <div>
                  <p className="text-[10px] font-bold uppercase text-gp-text-muted">Subtotal</p>
                  <p className="font-mono font-bold text-gp-text-main">{formatCurrency(totals.subtotal)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-gp-text-muted">Discount</p>
                  <p className="font-mono font-bold text-orange-400">{formatCurrency(totals.discount)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase text-gp-text-muted">Due</p>
                  <p className="font-display text-xl font-black text-gp-text-main">{formatCurrency(totals.total)}</p>
                </div>
              </div>

              <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">Staff Member</label>
              <select
                value={selectedStaff}
                onChange={(event) => setSelectedStaff(event.target.value as StaffName)}
                className="mb-3 h-11 w-full rounded border border-gp-border bg-gp-input px-3 text-sm font-bold text-gp-text-main outline-none focus:border-gp-red"
              >
                <option value="">Select staff for sale</option>
                {STAFF_NAMES.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>

              {message && (
                <div className="mb-3 rounded border border-orange-500/40 bg-orange-950/20 px-3 py-2 text-xs font-bold text-orange-300">
                  {message}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleQuote}
                  disabled={!cart.length || isCompletingSale}
                  className="rounded-md border border-gp-border bg-gp-panel py-3 text-xs font-black uppercase tracking-wider text-gp-text-main transition-colors hover:bg-gp-border disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Generate Quote
                </button>
                <button
                  onClick={handleCompleteSale}
                  disabled={!cart.length || isCompletingSale}
                  className="rounded-md bg-gp-red py-3 text-xs font-black uppercase tracking-wider text-white shadow-[0_0_15px_rgba(255,0,0,0.35)] transition-transform hover:bg-red-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isCompletingSale ? 'Processing...' : 'Complete Sale'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
