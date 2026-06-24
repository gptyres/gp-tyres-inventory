
import React, { useMemo, useState } from 'react';
import { Order } from '../types';
import { formatCurrency } from '../utils';

interface ShiftReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
}

export const ShiftReconciliationModal: React.FC<ShiftReconciliationModalProps> = ({ isOpen, onClose, orders }) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => o.timestamp.startsWith(selectedDate) && o.type === 'SALE');
  }, [orders, selectedDate]);

  const totalSales = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + o.totalPrice, 0);
  }, [filteredOrders]);

  const salesByStaff = useMemo(() => {
    const acc: Record<string, number> = {};
    filteredOrders.forEach(o => {
        acc[o.staffName] = (acc[o.staffName] || 0) + o.totalPrice;
    });
    return acc;
  }, [filteredOrders]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gp-panel border border-gp-border w-full max-w-2xl rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
        
        <div className="p-6 bg-gp-dark border-b border-gp-border flex justify-between items-center">
          <div>
            <h2 className="text-xl font-display font-black text-gp-text-main uppercase tracking-wider">
              Shift Cash Up
            </h2>
            <p className="text-xs text-gp-text-muted mt-1">Daily Sales Reconciliation</p>
          </div>
          <button onClick={onClose} className="text-gp-text-muted hover:text-gp-text-main">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
            
            <div className="mb-6">
                <label className="block text-xs font-bold text-gp-text-muted uppercase mb-2">Select Date</label>
                <input 
                    type="date" 
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-gp-input border border-gp-border rounded p-2 text-gp-text-main font-bold"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-green-900/10 border border-green-900/30 p-4 rounded-lg">
                    <p className="text-xs font-bold text-green-600 uppercase tracking-wider">Total Revenue</p>
                    <p className="text-3xl font-black text-green-500 mt-1">{formatCurrency(totalSales)}</p>
                    <p className="text-xs text-gp-text-muted mt-2">{filteredOrders.length} Transactions</p>
                </div>
                
                <div className="bg-gp-input border border-gp-border p-4 rounded-lg">
                    <p className="text-xs font-bold text-gp-text-muted uppercase tracking-wider mb-3">Sales by Staff</p>
                    <div className="space-y-2">
                        {Object.entries(salesByStaff).map(([staff, amount]) => (
                            <div key={staff} className="flex justify-between items-center border-b border-gp-border pb-1 last:border-0">
                                <span className="font-bold text-gp-text-main text-sm">{staff}</span>
                                <span className="font-mono text-gp-text-main">{formatCurrency(amount as number)}</span>
                            </div>
                        ))}
                        {Object.keys(salesByStaff).length === 0 && <span className="text-xs text-gp-text-muted italic">No sales recorded.</span>}
                    </div>
                </div>
            </div>

            <div>
                <p className="text-xs font-bold text-gp-text-muted uppercase tracking-wider mb-2">Transaction Log</p>
                <div className="border border-gp-border rounded overflow-hidden">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-gp-input text-gp-text-muted font-bold uppercase">
                            <tr>
                                <th className="p-2 border-b border-gp-border">Time</th>
                                <th className="p-2 border-b border-gp-border">Item</th>
                                <th className="p-2 border-b border-gp-border text-right">Amount</th>
                                <th className="p-2 border-b border-gp-border text-right">Staff</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gp-border bg-gp-panel">
                            {filteredOrders.map(o => (
                                <tr key={o.id}>
                                    <td className="p-2 text-gp-text-muted font-mono">{new Date(o.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                                    <td className="p-2 text-gp-text-main truncate max-w-[150px]">{o.productDescription}</td>
                                    <td className="p-2 text-right font-bold text-gp-text-main">{formatCurrency(o.totalPrice)}</td>
                                    <td className="p-2 text-right text-gp-text-muted uppercase">{o.staffName}</td>
                                </tr>
                            ))}
                            {filteredOrders.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-4 text-center text-gp-text-muted italic">No transactions for this date.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>

        <div className="p-4 border-t border-gp-border bg-gp-input flex justify-end">
            <button 
                onClick={() => window.print()}
                className="px-6 py-2 bg-gp-text-main text-gp-panel font-bold rounded uppercase text-xs hover:opacity-80 transition-opacity"
            >
                Print Report
            </button>
        </div>

      </div>
    </div>
  );
};
