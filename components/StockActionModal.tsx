import React, { useState, useEffect } from 'react';
import { InventoryItem, ProductType, TyreProduct, WheelProduct, CoiloverProduct, StaffName } from '../types';
import { STAFF_NAMES } from '../config';

interface StockActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: InventoryItem, action: 'ADD' | 'EDIT' | 'DELETE', staffName: StaffName) => void;
  initialItem?: InventoryItem; // If provided, we are in Edit/Delete mode
  isAdmin: boolean;
}

export const StockActionModal: React.FC<StockActionModalProps> = ({ isOpen, onClose, onSave, initialItem, isAdmin }) => {
  // Common State
  const [actionType, setActionType] = useState<'ADD' | 'EDIT' | 'DELETE'>('ADD');
  const [selectedStaff, setSelectedStaff] = useState<StaffName | ''>('');
  const [productType, setProductType] = useState<ProductType>(ProductType.TYRE);

  // Form Fields State (Unified for simplicity)
  const [formData, setFormData] = useState<any>({
    brand: '',
    pattern: '',
    size: '',
    loadSpeedIndex: '',
    location: '',
    quantity: 0,
    costPrice: 0,
    sellingPrice: 0,
    code: '',
    pcd: '',
    offset: '',
    colour: '',
    series: '',
    vehicleCompatibility: ''
  });

  useEffect(() => {
    if (isOpen) {
      if (initialItem) {
        setActionType('EDIT'); 
        setProductType(initialItem.type);
        setFormData({ ...initialItem });
      } else {
        setActionType('ADD');
        setProductType(ProductType.TYRE); // Default
        setFormData({
            brand: '', pattern: '', size: '', loadSpeedIndex: '', location: '',
            quantity: 0, costPrice: 0, sellingPrice: 0,
            code: '', pcd: '', offset: '', colour: '', series: '', vehicleCompatibility: ''
        });
      }
      setSelectedStaff(''); // Reset staff selection on open
    }
  }, [isOpen, initialItem]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) {
      alert("Please select your name to proceed.");
      return;
    }

    // Construct the item object based on type
    const base = {
      id: initialItem?.id || `new-${Date.now()}`,
      type: productType,
      quantity: Number(formData.quantity),
      costPrice: Number(formData.costPrice),
      sellingPrice: Number(formData.sellingPrice),
      lastUpdated: new Date().toISOString().split('T')[0]
    };

    let finalItem: InventoryItem;

    if (productType === ProductType.TYRE) {
      finalItem = { ...base, brand: formData.brand, pattern: formData.pattern, size: formData.size, loadSpeedIndex: formData.loadSpeedIndex, location: formData.location } as TyreProduct;
    } else if (productType === ProductType.WHEEL) {
      finalItem = { ...base, code: formData.code, size: formData.size, pcd: formData.pcd, offset: formData.offset, centerBore: '', colour: formData.colour, setQuantity: 4 } as WheelProduct;
    } else {
      finalItem = { ...base, brand: formData.brand, series: formData.series, vehicleCompatibility: formData.vehicleCompatibility } as CoiloverProduct;
    }

    onSave(finalItem, actionType, selectedStaff);
    onClose();
  };

  const handleDelete = () => {
    if (!selectedStaff) {
      alert("Please select your name to proceed.");
      return;
    }
    // We construct the item just to pass ID, but data might be old. Using initialItem is safer if we just need ID.
    // But typescript needs a full item.
    if (initialItem) {
        onSave(initialItem, 'DELETE', selectedStaff);
        onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gp-panel border border-gp-border w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg shadow-2xl flex flex-col">
        
        {/* Header */}
        <div className="p-4 border-b border-gp-border flex justify-between items-center bg-gp-dark">
          <h2 className="text-xl font-display font-bold text-gp-text-main uppercase tracking-wider">
            {initialItem ? 'Manage Stock' : 'Add New Stock'}
          </h2>
          <button onClick={onClose} className="text-gp-text-muted hover:text-gp-text-main">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex-grow flex flex-col gap-6">
          
          {/* CRITICAL: Staff Name Selection */}
          <div className="bg-gp-input p-4 rounded border border-gp-red/30 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-gp-red"></div>
            <label className="block text-sm font-bold text-gp-red uppercase mb-2 tracking-wider">
              Modification Author (Required)
            </label>
            <select 
              required
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value as StaffName)}
              className="w-full bg-gp-black border border-gp-border rounded p-3 text-gp-text-main focus:border-gp-red focus:outline-none appearance-none"
            >
              <option value="">-- WHO ARE YOU? --</option>
              {STAFF_NAMES.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Product Type Toggle (Only for Add mode) */}
          {!initialItem && (
             <div className="flex gap-2 p-1 bg-gp-input rounded border border-gp-border">
                {(['TYRE', 'WHEEL', 'COILOVER'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setProductType(ProductType[type])}
                    className={`flex-1 py-2 text-xs font-bold uppercase rounded transition-colors ${productType === ProductType[type] ? 'bg-gp-panel text-gp-text-main shadow-sm' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                  >
                    {type}
                  </button>
                ))}
             </div>
          )}

          {/* Dynamic Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Tyre Fields */}
            {productType === ProductType.TYRE && (
              <>
                <div className="col-span-2 md:col-span-1">
                  <label className="text-xs text-gp-text-muted uppercase font-bold">Size</label>
                  <input required type="text" placeholder="e.g. 195/40/17" className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main mt-1 focus:border-gp-silver focus:outline-none" value={formData.size} onChange={e => setFormData({...formData, size: e.target.value})} />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="text-xs text-gp-text-muted uppercase font-bold">Brand</label>
                  <input required type="text" placeholder="e.g. Dunlop" className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main mt-1 focus:border-gp-silver focus:outline-none" value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="text-xs text-gp-text-muted uppercase font-bold">Pattern</label>
                  <input type="text" placeholder="e.g. AT3G" className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main mt-1 focus:border-gp-silver focus:outline-none" value={formData.pattern} onChange={e => setFormData({...formData, pattern: e.target.value})} />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="text-xs text-gp-text-muted uppercase font-bold">Load/Speed</label>
                  <input type="text" placeholder="e.g. 112H" className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main mt-1 focus:border-gp-silver focus:outline-none" value={formData.loadSpeedIndex} onChange={e => setFormData({...formData, loadSpeedIndex: e.target.value})} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gp-text-muted uppercase font-bold">Location</label>
                  <input type="text" placeholder="e.g. Deck" className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main mt-1 focus:border-gp-silver focus:outline-none" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
                </div>
              </>
            )}

            {/* Wheel Fields */}
            {productType === ProductType.WHEEL && (
              <>
                <div className="col-span-2 md:col-span-1">
                  <label className="text-xs text-gp-text-muted uppercase font-bold">Code / Name</label>
                  <input required type="text" className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main mt-1 focus:border-gp-silver focus:outline-none" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="text-xs text-gp-text-muted uppercase font-bold">Size</label>
                  <input required type="text" placeholder="e.g. 15x6.5" className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main mt-1 focus:border-gp-silver focus:outline-none" value={formData.size} onChange={e => setFormData({...formData, size: e.target.value})} />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="text-xs text-gp-text-muted uppercase font-bold">PCD</label>
                  <input type="text" placeholder="e.g. 5/100" className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main mt-1 focus:border-gp-silver focus:outline-none" value={formData.pcd} onChange={e => setFormData({...formData, pcd: e.target.value})} />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="text-xs text-gp-text-muted uppercase font-bold">Offset (ET)</label>
                  <input type="text" className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main mt-1 focus:border-gp-silver focus:outline-none" value={formData.offset} onChange={e => setFormData({...formData, offset: e.target.value})} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gp-text-muted uppercase font-bold">Colour</label>
                  <input type="text" className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main mt-1 focus:border-gp-silver focus:outline-none" value={formData.colour} onChange={e => setFormData({...formData, colour: e.target.value})} />
                </div>
              </>
            )}

            {/* Coilover Fields */}
            {productType === ProductType.COILOVER && (
              <>
                <div className="col-span-2 md:col-span-1">
                  <label className="text-xs text-gp-text-muted uppercase font-bold">Brand</label>
                  <input required type="text" className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main mt-1 focus:border-gp-silver focus:outline-none" value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="text-xs text-gp-text-muted uppercase font-bold">Series</label>
                  <input type="text" placeholder="e.g. Yellow" className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main mt-1 focus:border-gp-silver focus:outline-none" value={formData.series} onChange={e => setFormData({...formData, series: e.target.value})} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gp-text-muted uppercase font-bold">Vehicle Compatibility</label>
                  <input required type="text" placeholder="e.g. Golf 7" className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main mt-1 focus:border-gp-silver focus:outline-none" value={formData.vehicleCompatibility} onChange={e => setFormData({...formData, vehicleCompatibility: e.target.value})} />
                </div>
              </>
            )}

            {/* Common Fields */}
            <div className="col-span-2 border-t border-gp-border pt-4 mt-2"></div>
            
            <div className="col-span-2 md:col-span-1">
              <label className="text-xs text-gp-text-muted uppercase font-bold">Quantity</label>
              <input required type="number" min="0" className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main mt-1 text-lg font-bold focus:border-gp-silver focus:outline-none" value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} />
            </div>
            
            <div className="col-span-2 md:col-span-1">
              <label className="text-xs text-gp-red uppercase font-bold">Selling Price (R)</label>
              <input required type="number" min="0" className="w-full bg-gp-input border border-gp-red rounded p-2 text-gp-text-main mt-1 text-lg font-bold focus:border-gp-text-main focus:outline-none" value={formData.sellingPrice} onChange={e => setFormData({...formData, sellingPrice: e.target.value})} />
            </div>

            {isAdmin && (
                <div className="col-span-2">
                  <label className="text-xs text-green-600 uppercase font-bold">Cost Price (R)</label>
                  <input type="number" min="0" className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-muted mt-1 focus:border-green-600 focus:text-gp-text-main focus:outline-none" value={formData.costPrice} onChange={e => setFormData({...formData, costPrice: e.target.value})} />
                </div>
            )}

          </div>

          <div className="flex gap-4 mt-6">
            {initialItem && (
                <button 
                    type="button" 
                    onClick={handleDelete}
                    className="flex-1 bg-gp-input border border-red-900 text-red-500 font-bold py-3 rounded uppercase tracking-wider hover:bg-red-900 hover:text-white transition-colors"
                >
                    Remove Stock
                </button>
            )}
            <button 
              type="submit" 
              className="flex-[2] bg-gp-text-main text-gp-panel font-bold py-3 rounded uppercase tracking-wider hover:opacity-80 transition-colors"
            >
              {initialItem ? 'Save Changes' : 'Add to Inventory'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};