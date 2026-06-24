import React, { useState, useEffect } from 'react';
import { InventoryItem, StaffName, ProductType, TyreProduct, WheelProduct, CoiloverProduct } from '../types';
import { STAFF_NAMES } from '../config';
import { formatCurrency } from '../utils';

interface SellModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSell: (item: InventoryItem, quantity: number, staffName: StaffName, finalUnitPrice: number) => void;
  item: InventoryItem | undefined;
}

export const SellModal: React.FC<SellModalProps> = ({ isOpen, onClose, onSell, item }) => {
  const [quantity, setQuantity] = useState(1);
  const [selectedStaff, setSelectedStaff] = useState<StaffName | ''>('');
  const [unitPrice, setUnitPrice] = useState<number>(0);

  useEffect(() => {
    if (isOpen && item) {
      setQuantity(1);
      setUnitPrice(item.sellingPrice);
      setSelectedStaff('');
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) {
      alert("Please select your name to process the sale.");
      return;
    }
    if (quantity > item.quantity) {
      alert("Cannot sell more than available stock.");
      return;
    }
    onSell(item, quantity, selectedStaff, unitPrice);
    onClose();
  };

  const getItemName = () => {
    if (item.type === ProductType.TYRE) return `${(item as TyreProduct).size} ${(item as TyreProduct).brand}`;
    if (item.type === ProductType.WHEEL) return `${(item as WheelProduct).code} ${(item as WheelProduct).size}`;
    return `${(item as CoiloverProduct).brand} ${(item as CoiloverProduct).vehicleCompatibility}`;
  };

  const getItemDescription = () => {
    if (item.type === ProductType.TYRE) return `${(item as TyreProduct).pattern} ${(item as TyreProduct).loadSpeedIndex || ''}`;
    if (item.type === ProductType.WHEEL) return `${(item as WheelProduct).pcd} ET${(item as WheelProduct).offset} ${(item as WheelProduct).colour}`;
    return (item as CoiloverProduct).series;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gp-panel border border-gp-border w-full max-w-md rounded-lg shadow-2xl flex flex-col relative overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-gp-red to-red-900 p-4">
          <h2 className="text-xl font-display font-black text-white uppercase tracking-wider">Process Sale</h2>
          <p className="text-red-100 text-xs mt-1">Deducting from Live Inventory</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-6">
          
          {/* Product Summary */}
          <div className="flex gap-4 items-start bg-gp-overlay p-4 rounded border border-gp-border">
            <div className="bg-gp-input p-3 rounded flex items-center justify-center">
              <svg className="w-8 h-8 text-gp-text-main" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gp-text-main text-lg leading-tight">{getItemName()}</h3>
              <p className="text-gp-text-muted text-xs mb-1">{getItemDescription()}</p>
              <div className="flex justify-between items-center mt-2">
                <p className="text-gp-silver text-xs">Stock: <span className="text-gp-text-main font-bold">{item.quantity}</span></p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Quantity Input */}
            <div>
              <label className="block text-xs font-bold text-gp-text-muted uppercase mb-2">Qty</label>
              <div className="flex items-center">
                <button 
                  type="button" 
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-10 h-12 bg-gp-input hover:bg-gp-border border border-gp-border rounded-l text-gp-text-main font-bold text-lg transition-colors active:scale-95"
                >
                  -
                </button>
                <input 
                  type="number" 
                  min="1" 
                  max={item.quantity}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.min(item.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="flex-1 bg-gp-black border-y border-gp-border h-12 text-center text-xl font-bold text-gp-text-main focus:border-gp-red focus:outline-none"
                />
                <button 
                  type="button" 
                  onClick={() => setQuantity(q => Math.min(item.quantity, q + 1))}
                  className="w-10 h-12 bg-gp-input hover:bg-gp-border border border-gp-border rounded-r text-gp-text-main font-bold text-lg transition-colors active:scale-95"
                >
                  +
                </button>
              </div>
            </div>

            {/* Unit Price Input */}
            <div>
                <label className="block text-xs font-bold text-gp-text-muted uppercase mb-2">Unit Price (R)</label>
                <input 
                  type="number"
                  min="0"
                  step="1"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
                  className="w-full h-12 bg-gp-black border border-gp-border rounded px-3 text-right text-xl font-mono font-bold text-gp-text-main focus:border-gp-red focus:outline-none"
                />
            </div>
          </div>

          {/* Staff Selection */}
          <div>
            <label className="block text-xs font-bold text-gp-text-muted uppercase mb-2">Sold By (Staff Member)</label>
            <div className="relative">
              <select 
                required
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value as StaffName)}
                className="w-full bg-gp-black border border-gp-border rounded p-3 text-gp-text-main focus:border-gp-red focus:outline-none appearance-none"
              >
                <option value="">Select Staff Member</option>
                {STAFF_NAMES.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                <svg className="w-4 h-4 text-gp-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
          </div>

          {/* Total & Action */}
          <div className="mt-2 pt-4 border-t border-gp-border">
            <div className="flex justify-between items-center mb-4 bg-gp-overlay p-2 rounded">
              <span className="text-sm font-bold text-gp-text-muted uppercase">Total Sale Value</span>
              <span className="text-2xl font-black text-gp-text-main font-display tracking-wide">{formatCurrency(unitPrice * quantity)}</span>
            </div>
            
            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={onClose} 
                className="flex-1 py-3 rounded bg-gp-input text-gp-text-muted font-bold hover:bg-gp-border transition-colors uppercase tracking-wider text-xs"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="flex-[2] py-3 rounded bg-gp-red text-white font-bold hover:bg-red-700 transition-transform active:scale-95 uppercase tracking-wider text-xs shadow-[0_0_15px_rgba(255,0,0,0.3)]"
              >
                Confirm Sale
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
};