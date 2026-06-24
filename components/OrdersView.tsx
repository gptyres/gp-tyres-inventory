
import React from 'react';
import { Order } from '../types';
import { formatCurrency } from '../utils';

interface OrdersViewProps {
  orders: Order[];
  onRefund: (order: Order) => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({ orders, onRefund }) => {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-gp-text-muted border border-dashed border-gp-border rounded-xl m-4 bg-gp-overlay">
        <svg className="w-20 h-20 mb-4 text-gp-text-muted opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
        <p className="text-lg font-display uppercase tracking-widest text-gp-text-muted">No Sales Recorded</p>
        <p className="text-sm text-gp-text-muted mt-1 opacity-70">Sales made will appear here instantly</p>
      </div>
    );
  }

  // Sort orders new to old
  const sortedOrders = [...orders].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="max-w-7xl mx-auto px-4 mt-6">
      <div className="bg-gp-panel border border-gp-border rounded-lg overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse bg-gp-black text-sm">
            <thead>
              <tr className="bg-gp-dark text-gp-text-muted uppercase text-[10px] tracking-wider font-bold">
                <th className="p-4 border-b border-gp-border">Date / Time</th>
                <th className="p-4 border-b border-gp-border">Terminal</th>
                <th className="p-4 border-b border-gp-border">Staff Member</th>
                <th className="p-4 border-b border-gp-border">Product</th>
                <th className="p-4 border-b border-gp-border text-center">Qty</th>
                <th className="p-4 border-b border-gp-border text-right text-green-500">Total Value</th>
                <th className="p-4 border-b border-gp-border text-center w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gp-border">
              {sortedOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gp-panel transition-colors group">
                  <td className="p-4 text-gp-text-muted font-mono text-xs">
                    {new Date(order.timestamp).toLocaleDateString()} <span className="opacity-50">{new Date(order.timestamp).toLocaleTimeString()}</span>
                  </td>
                  <td className="p-4">
                    <span className="text-[10px] font-bold text-gp-silver bg-gp-overlay px-2 py-1 rounded border border-gp-border">
                        {order.terminalId || 'UNKNOWN'}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="bg-gp-input text-gp-text-muted px-2 py-1 rounded text-xs font-bold uppercase">{order.staffName}</span>
                  </td>
                  <td className="p-4 font-bold text-gp-text-main">
                    {order.productDescription}
                    {order.type === 'RESERVE' && <span className="ml-2 text-[9px] bg-blue-900/30 text-blue-400 px-1.5 py-0.5 rounded border border-blue-900/50 uppercase">Reserved</span>}
                    {order.type === 'REFUND' && <span className="ml-2 text-[9px] bg-red-900/30 text-red-400 px-1.5 py-0.5 rounded border border-red-900/50 uppercase">Refunded</span>}
                  </td>
                  <td className="p-4 text-center font-bold text-gp-text-muted">
                    {order.quantity}
                  </td>
                  <td className={`p-4 text-right font-mono font-bold ${order.totalPrice < 0 ? 'text-red-500' : 'text-gp-text-main'}`}>
                    {formatCurrency(order.totalPrice)}
                  </td>
                  <td className="p-4 text-center">
                    {order.type === 'SALE' && order.totalPrice > 0 && (
                        <button 
                            onClick={() => onRefund(order)}
                            className="text-[10px] font-bold uppercase text-red-500 hover:text-red-400 hover:underline transition-colors opacity-0 group-hover:opacity-100"
                        >
                            Refund
                        </button>
                    )}
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