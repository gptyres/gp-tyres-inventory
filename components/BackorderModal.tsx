import React, { useState, useEffect } from 'react';
import { Backorder } from '../types';

interface BackorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (backorder: Backorder) => void;
  initialData?: Backorder;
}

export const BackorderModal: React.FC<BackorderModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [formData, setFormData] = useState({
    supplier: '',
    productDescription: '',
    quantity: 1,
    expectedDate: '',
    notes: '',
    status: 'PENDING' as Backorder['status']
  });

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          supplier: initialData.supplier,
          productDescription: initialData.productDescription,
          quantity: initialData.quantity,
          expectedDate: initialData.expectedDate,
          notes: initialData.notes || '',
          status: initialData.status
        });
      } else {
        setFormData({
          supplier: '',
          productDescription: '',
          quantity: 1,
          expectedDate: new Date().toISOString().split('T')[0],
          notes: '',
          status: 'PENDING'
        });
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const backorder: Backorder = {
      id: initialData?.id || `bo-${Date.now()}`,
      createdAt: initialData?.createdAt || new Date().toISOString(),
      supplier: formData.supplier,
      productDescription: formData.productDescription,
      quantity: Number(formData.quantity),
      expectedDate: formData.expectedDate,
      notes: formData.notes,
      status: formData.status
    };

    onSave(backorder);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gp-panel border border-gp-border w-full max-w-lg rounded-lg shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        
        <div className="bg-gp-dark p-4 border-b border-gp-border flex justify-between items-center">
          <h2 className="text-lg font-display font-bold text-gp-text-main uppercase tracking-wider">
            {initialData ? 'Edit Backorder' : 'Log New Backorder'}
          </h2>
          <button onClick={onClose} className="text-gp-text-muted hover:text-gp-text-main">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          
          <div>
            <label className="block text-xs font-bold text-gp-text-muted uppercase mb-1">Supplier Name</label>
            <input 
              required
              type="text" 
              className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main focus:border-gp-red focus:outline-none"
              placeholder="e.g. BRIDGESTONE SA"
              value={formData.supplier}
              onChange={(e) => setFormData({...formData, supplier: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gp-text-muted uppercase mb-1">Product Description</label>
            <input 
              required
              type="text" 
              className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main focus:border-gp-red focus:outline-none"
              placeholder="e.g. 265/65/17 AT3G"
              value={formData.productDescription}
              onChange={(e) => setFormData({...formData, productDescription: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-xs font-bold text-gp-text-muted uppercase mb-1">Quantity</label>
                <input 
                required
                type="number" 
                min="1"
                className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main focus:border-gp-red focus:outline-none"
                value={formData.quantity}
                onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value)})}
                />
            </div>
            <div>
                <label className="block text-xs font-bold text-gp-text-muted uppercase mb-1">Expected Date</label>
                <input 
                required
                type="date" 
                className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main focus:border-gp-red focus:outline-none"
                value={formData.expectedDate}
                onChange={(e) => setFormData({...formData, expectedDate: e.target.value})}
                />
            </div>
          </div>

          {initialData && (
              <div>
                <label className="block text-xs font-bold text-gp-text-muted uppercase mb-1">Status</label>
                <select
                    className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main focus:border-gp-red focus:outline-none"
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value as Backorder['status']})}
                >
                    <option value="PENDING">Pending</option>
                    <option value="RECEIVED">Received</option>
                    <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gp-text-muted uppercase mb-1">Notes (Optional)</label>
            <textarea 
              className="w-full bg-gp-input border border-gp-border rounded p-2 text-gp-text-main focus:border-gp-red focus:outline-none"
              rows={3}
              placeholder="e.g. Customer Name, Deposit Paid..."
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
            />
          </div>

          <div className="flex gap-3 mt-4 pt-4 border-t border-gp-border">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 bg-gp-input text-gp-text-muted font-bold py-3 rounded uppercase tracking-wider text-xs hover:bg-gp-border transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="flex-[2] bg-gp-red text-white font-bold py-3 rounded uppercase tracking-wider text-xs hover:bg-red-700 transition-colors shadow-lg"
            >
              {initialData ? 'Update Backorder' : 'Create Backorder'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};