import React from 'react';
import { Backorder } from '../types';

interface BackordersViewProps {
  backorders: Backorder[];
  onMarkReceived: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (item: Backorder) => void;
}

export const BackordersView: React.FC<BackordersViewProps> = ({ backorders, onMarkReceived, onDelete, onEdit }) => {
  if (backorders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-gp-text-muted border border-dashed border-gp-border rounded-xl m-4 bg-gp-overlay">
        <svg className="w-20 h-20 mb-4 text-gp-text-muted opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-lg font-display uppercase tracking-widest text-gp-text-muted">No Incoming Stock</p>
        <p className="text-sm text-gp-text-muted mt-1 opacity-70">Add a backorder to track expected deliveries</p>
      </div>
    );
  }

  // Sort: Pending first, then by date
  const sortedOrders = [...backorders].sort((a, b) => {
    if (a.status === b.status) {
      return new Date(a.expectedDate).getTime() - new Date(b.expectedDate).getTime();
    }
    return a.status === 'PENDING' ? -1 : 1;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 mt-6">
      <div className="bg-gp-panel border border-gp-border rounded-lg overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse bg-gp-black text-sm">
            <thead>
              <tr className="bg-gp-dark text-gp-text-muted uppercase text-[10px] tracking-wider font-bold">
                <th className="p-4 border-b border-gp-border w-32">Status</th>
                <th className="p-4 border-b border-gp-border">Expected Date</th>
                <th className="p-4 border-b border-gp-border">Supplier</th>
                <th className="p-4 border-b border-gp-border">Product Details</th>
                <th className="p-4 border-b border-gp-border text-center">Qty</th>
                <th className="p-4 border-b border-gp-border text-right w-48">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gp-border">
              {sortedOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gp-panel transition-colors group">
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border ${
                      order.status === 'PENDING' 
                        ? 'bg-yellow-900/20 text-yellow-500 border-yellow-700' 
                        : order.status === 'RECEIVED'
                        ? 'bg-green-900/20 text-green-500 border-green-700'
                        : 'bg-red-900/20 text-red-500 border-red-700'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="p-4 text-gp-text-main font-mono text-xs">
                    {order.expectedDate}
                  </td>
                  <td className="p-4">
                    <span className="font-bold text-gp-text-main uppercase tracking-wider text-xs bg-gp-input px-2 py-1 rounded border border-gp-border">
                        {order.supplier}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col">
                        <span className="font-bold text-gp-text-main">{order.productDescription}</span>
                        {order.notes && <span className="text-[10px] text-gp-text-muted italic mt-1">{order.notes}</span>}
                    </div>
                  </td>
                  <td className="p-4 text-center font-mono font-bold text-lg text-gp-text-main">
                    {order.quantity}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                        {order.status === 'PENDING' && (
                            <button 
                                onClick={() => onMarkReceived(order.id)}
                                className="p-1.5 rounded bg-green-900/30 text-green-500 hover:bg-green-500 hover:text-white border border-green-700 transition-colors"
                                title="Mark Received"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            </button>
                        )}
                        <button 
                            onClick={() => onEdit(order)}
                            className="p-1.5 rounded bg-blue-900/30 text-blue-500 hover:bg-blue-500 hover:text-white border border-blue-700 transition-colors"
                            title="Edit"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button 
                            onClick={() => onDelete(order.id)}
                            className="p-1.5 rounded bg-red-900/30 text-red-500 hover:bg-red-500 hover:text-white border border-red-700 transition-colors"
                            title="Delete"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};