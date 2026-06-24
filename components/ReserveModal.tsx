
import React, { useState, useEffect } from 'react';
import { InventoryItem, StaffName, ProductType, TyreProduct, WheelProduct, CoiloverProduct } from '../types';
import { STAFF_NAMES } from '../config';

interface ReserveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReserve: (item: InventoryItem, quantity: number, customerName: string, staffName: StaffName) => void;
  item: InventoryItem | undefined;
}

export const ReserveModal: React.FC<ReserveModalProps> = ({ isOpen, onClose, onReserve, item }) => {
  const [quantity, setQuantity] = useState(1);
  const [selectedStaff, setSelectedStaff] = useState<StaffName | ''>('');
  const [customerName, setCustomerName] = useState('');

  useEffect(() => {
    if (isOpen && item) {
      setQuantity(1);
      setSelectedStaff('');
      setCustomerName('');
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) {
      alert("Please select your name to reserve.");
      return;
    }
    if (!customerName.trim()) {
      alert("Please enter customer name.");
      return;
    }
    if (quantity > item.quantity) {
        alert("Cannot reserve more than available stock.");
        return;
    }
    
    onReserve(item, quantity, customerName, selectedStaff);
    onClose();
  };

  const getItemName = () => {
    if (item.type === ProductType.TYRE) return `${(item as TyreProduct).size} ${(item as TyreProduct).brand}`;
    if (item.type === ProductType.WHEEL) return `${(item as WheelProduct).code} ${(item as WheelProduct).size}`;
    return `${(item as CoiloverProduct).brand} ${(item as CoiloverProduct).vehicleCompatibility}`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gp-panel border border-gp-border w-full max-w-md rounded-lg shadow-2xl flex flex-col relative overflow-hidden">
        
        {/* Header */}
        <div className="bg-blue-600 p-4">
          <h2 className="text-xl font-display font-black text-white uppercase tracking-wider">Reserve Stock</h2>
          <p className="text-blue-100 text-xs mt-1">Hold items for customer</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-6">
          
          <div className="bg-gp-overlay p-4 rounded border border-gp-border">
            <h3 className="font-bold text-gp-text-main text-lg leading-tight">{getItemName()}</h3>
            <p className="text-gp-text-muted text-xs mt-1">Available: {item.quantity}</p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
                <label className="block text-xs font-bold text-gp-text-muted uppercase mb-2">Customer Name</label>
                <input 
                  required
                  type="text"
                  placeholder="Enter Customer Name"
                  className="w-full h-12 bg-gp-black border border-gp-border rounded px-3 text-gp-text-main focus:border-blue-500 focus:outline-none"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
            </div>

            <div>
              <label className="block text-xs font-bold text-gp-text-muted uppercase mb-2">Qty to Reserve</label>
              <div className="flex items-center">
                <button 
                  type="button" 
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-10 h-12 bg-gp-input border border-gp-border rounded-l text-gp-text-main font-bold text-lg hover:bg-gp-border"
                >
                  -
                </button>
                <input 
                  type="number" 
                  min="1" 
                  max={item.quantity}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.min(item.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="flex-1 bg-gp-black border-y border-gp-border h-12 text-center text-xl font-bold text-gp-text-main focus:border-blue-500 focus:outline-none"
                />
                <button 
                  type="button" 
                  onClick={() => setQuantity(q => Math.min(item.quantity, q + 1))}
                  className="w-10 h-12 bg-gp-input border border-gp-border rounded-r text-gp-text-main font-bold text-lg hover:bg-gp-border"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gp-text-muted uppercase mb-2">Reserved By</label>
            <select 
              required
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value as StaffName)}
              className="w-full bg-gp-black border border-gp-border rounded p-3 text-gp-text-main focus:border-blue-500 focus:outline-none appearance-none"
            >
              <option value="">Select Staff Member</option>
              {STAFF_NAMES.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gp-border">
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 py-3 rounded bg-gp-input text-gp-text-muted font-bold hover:bg-gp-border transition-colors uppercase tracking-wider text-xs"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="flex-[2] py-3 rounded bg-blue-600 text-white font-bold hover:bg-blue-700 transition-transform active:scale-95 uppercase tracking-wider text-xs shadow-lg"
            >
              Confirm Reserve
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
