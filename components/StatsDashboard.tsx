import React from 'react';
import { InventoryStats } from '../types';
import { formatCurrency } from '../utils';

interface StatsDashboardProps {
  stats: InventoryStats;
  visible: boolean; // Corresponds to isAdmin
}

export const StatsDashboard: React.FC<StatsDashboardProps> = ({ stats, visible }) => {
  return (
    <div className="max-w-7xl mx-auto px-4 mt-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* Total Items - Always Visible */}
        <div className="bg-gp-panel border border-gp-border p-4 rounded-lg shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-30 group-hover:opacity-40 transition-opacity">
            <svg className="w-12 h-12 text-gp-text-main" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <p className="text-gp-text-muted text-[10px] font-bold uppercase tracking-wider relative z-10">Total Stock Count</p>
          <p className="text-3xl font-display font-black text-gp-text-main mt-1 relative z-10">{stats.totalItems}</p>
        </div>

        {/* Low Stock - Always Visible */}
        <div className="bg-gp-panel border border-gp-border p-4 rounded-lg shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-30 group-hover:opacity-40 transition-opacity">
            <svg className="w-12 h-12 text-gp-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-gp-text-muted text-[10px] font-bold uppercase tracking-wider relative z-10">Low Stock Alerts</p>
          <p className={`text-3xl font-display font-black mt-1 relative z-10 ${stats.lowStockCount > 0 ? 'text-gp-red animate-pulse' : 'text-gp-text-muted'}`}>
            {stats.lowStockCount}
          </p>
        </div>

        {/* Retail Value - Admin Only */}
        {visible ? (
          <div className="bg-gp-panel border border-gp-border p-4 rounded-lg shadow-lg relative overflow-hidden">
             <div className="absolute top-0 right-0 p-2 opacity-30">
              <svg className="w-12 h-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-gp-text-muted text-[10px] font-bold uppercase tracking-wider relative z-10">Total Retail Value</p>
            <p className="text-2xl font-display font-bold text-gp-silver mt-1 relative z-10">{formatCurrency(stats.totalValueRetail)}</p>
          </div>
        ) : (
          <div className="bg-gp-panel border border-gp-border p-4 rounded-lg flex items-center justify-center opacity-50">
            <span className="text-xs uppercase tracking-widest text-gp-text-muted font-bold flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              Retail Value Hidden
            </span>
          </div>
        )}

        {/* Cost Value - Admin Only */}
        {visible ? (
          <div className="bg-gp-panel border border-gp-border p-4 rounded-lg shadow-lg relative overflow-hidden">
             <div className="absolute top-0 right-0 p-2 opacity-30">
              <svg className="w-12 h-12 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 7h6m0 3.666A9.154 9.154 0 013 15m0 0a9.154 9.154 0 013-4.334M3 15c0 1.105 1.79 2 4 2s4-.895 4-2m5.666-4.334A9.154 9.154 0 0121 12m0 0a9.154 9.154 0 01-3 4.334M21 12c0 1.105-1.79 2-4 2s-4-.895-4-2" />
              </svg>
            </div>
            <p className="text-gp-text-muted text-[10px] font-bold uppercase tracking-wider relative z-10">Total Cost Value</p>
            <p className="text-2xl font-display font-bold text-green-500 mt-1 relative z-10">{formatCurrency(stats.totalValueCost)}</p>
          </div>
        ) : (
          <div className="bg-gp-panel border border-gp-border p-4 rounded-lg flex items-center justify-center opacity-50">
            <span className="text-xs uppercase tracking-widest text-gp-text-muted font-bold flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              Cost Value Hidden
            </span>
          </div>
        )}

      </div>
    </div>
  );
};