import React from 'react';
import { InventoryStats } from '../types';
import { formatCurrency } from '../utils';

interface StatsDashboardProps {
  stats: InventoryStats;
  visible: boolean;
  compact?: boolean;
  onStockClick?: () => void;
  onLowStockClick?: () => void;
}

export const StatsDashboard: React.FC<StatsDashboardProps> = ({ stats, visible, compact, onStockClick, onLowStockClick }) => {
  const metrics = [
    { label: 'Units in stock', value: stats.totalItems.toLocaleString('en-ZA'), detail: 'Across owned inventory', action: onStockClick },
    { label: 'Low stock products', value: stats.lowStockCount.toLocaleString('en-ZA'), detail: '1–3 units remaining', action: onLowStockClick },
    ...(visible ? [
      { label: 'Retail stock value', value: formatCurrency(stats.totalValueRetail), detail: 'Owned stock · retail prices', action: undefined },
      { label: 'Cost stock value', value: formatCurrency(stats.totalValueCost), detail: 'Owned stock · admin access', action: undefined }
    ] : [])
  ];
  return <section aria-label="Inventory overview" className={`${compact ? '' : 'max-w-7xl mx-auto px-4 mt-6'} workspace-stats ${visible ? 'workspace-stats-admin' : ''}`}>
    {metrics.map(metric => {
      const content = <><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}{metric.action && <span aria-hidden="true"> ↗</span>}</small></>;
      return metric.action
        ? <button className="workspace-stat" key={metric.label} type="button" onClick={metric.action}>{content}</button>
        : <div className="workspace-stat" key={metric.label}>{content}</div>;
    })}
  </section>;
};
