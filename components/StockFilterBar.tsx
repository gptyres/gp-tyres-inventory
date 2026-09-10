import React from 'react';
import { STOCK_FILTERS, StockFilter } from '../stockWorkspace';

interface Props {
  value: StockFilter;
  counts: Record<StockFilter, number>;
  query: string;
  category: string;
  onChange: (value: StockFilter) => void;
  onReset: () => void;
  onSearchSuppliers: () => void;
}

export function StockFilterBar({ value, counts, query, category, onChange, onReset, onSearchSuppliers }: Props) {
  const filtered = value !== 'ALL' || query.trim() || category !== 'ALL';
  return <section className="stock-filter-bar" aria-label="Stock availability">
    <div className="stock-filter-options" role="group" aria-label="Filter owned stock">
      {STOCK_FILTERS.map(filter => <button key={filter.value} type="button"
        className="stock-filter" aria-pressed={value === filter.value} onClick={() => onChange(filter.value)}>
        {filter.label}<span>{counts[filter.value].toLocaleString('en-ZA')}</span>
      </button>)}
    </div>
    <div className="stock-filter-context">
      <span className="text-gp-text-muted text-xs" aria-live="polite">
        {query.trim() ? `Matching “${query.trim()}”` : 'All products'}{category !== 'ALL' ? ` · ${category.toLowerCase()}` : ''}
        {value === 'LOW_STOCK' ? ' · 1–3 units remaining' : ''}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        {filtered && <button type="button" className="workspace-text-button" onClick={onReset}>Clear filters</button>}
        <button type="button" className="workspace-text-button" onClick={onSearchSuppliers}>
          {query.trim() ? 'Search suppliers for this' : 'Search suppliers'} <span aria-hidden="true">↗</span>
        </button>
      </div>
    </div>
  </section>;
}
