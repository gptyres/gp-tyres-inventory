import React from 'react';
import { Info, Search, X } from 'lucide-react';
import { ProductType } from '../types';
import type { WheelFilters } from '../wheelInventoryFilters';
import './WheelSearchPanel.css';

interface Props {
  query: string;
  filters: WheelFilters;
  options: { diameters: string[]; widths: string[] };
  count: number;
  loading?: boolean;
  setOfFour?: boolean;
  onQueryChange: (value: string) => void;
  onFiltersChange: (value: WheelFilters) => void;
  onCategoryChange: (value: ProductType | 'ALL') => void;
  onClear: () => void;
}

export const WheelSearchPanel: React.FC<Props> = ({
  query, filters, options, count, loading, setOfFour,
  onQueryChange, onFiltersChange, onCategoryChange, onClear
}) => {
  const change = (key: keyof WheelFilters, value: string) => onFiltersChange({ ...filters, [key]: value });
  return (
    <section className="wheel-search-panel" aria-label="Wheel search filters">
      <div className="wheel-search-top">
        <label className="wheel-search-field wheel-search-query">
          <span>Search</span>
          <div className="wheel-search-input-wrap">
            <Search size={17} aria-hidden="true" />
            <input aria-label="Search wheels" type="search" value={query} onChange={event => onQueryChange(event.target.value)}
              placeholder="Stock code, description, price…" aria-describedby="wheel-search-help" />
          </div>
        </label>
        <label className="wheel-search-field">
          <span>Category</span>
          <select aria-label="Category" value={ProductType.WHEEL} onChange={event => onCategoryChange(event.target.value as ProductType | 'ALL')}>
            <option value="ALL">All categories</option>
            <option value={ProductType.WHEEL}>Wheels</option>
            <option value={ProductType.TYRE}>Tyres</option>
            <option value={ProductType.COILOVER}>Suspension &amp; accessories</option>
            <option value={ProductType.BATTERY}>Batteries</option>
          </select>
        </label>
        <div className="wheel-search-actions">
          <span className="wheel-search-count" role="status" aria-live="polite" aria-atomic="true">
            {loading ? 'Loading wheels…' : <><strong>{count.toLocaleString('en-ZA')}</strong> {count === 1 ? 'wheel' : 'wheels'}</>}
          </span>
          <button type="button" className="wheel-search-clear" onClick={onClear}><X size={16} aria-hidden="true" /> Clear filters</button>
        </div>
      </div>
      <p id="wheel-search-help" className="wheel-search-help">Separate terms with a space to narrow your search — all terms must match.</p>
      <div className="wheel-search-specs">
        <label className="wheel-search-field">
          <span>Vehicle</span>
          <input aria-label="Vehicle" value={filters.vehicle || ''} onChange={event => change('vehicle', event.target.value)} placeholder="e.g. Toyota Hilux" />
        </label>
        <label className="wheel-search-field">
          <span>PCD</span>
          <input aria-label="PCD" value={filters.pcd || ''} onChange={event => change('pcd', event.target.value)} placeholder="e.g. 5x112 or 6x139.7" />
        </label>
        <label className="wheel-search-field">
          <span>Size</span>
          <select aria-label="Size" value={filters.diameter || ''} onChange={event => change('diameter', event.target.value)}>
            <option value="">All sizes</option>
            {options.diameters.map(size => <option key={size} value={size}>{size} inch</option>)}
          </select>
        </label>
        <label className="wheel-search-field">
          <span>Width</span>
          <select aria-label="Width" value={filters.width || ''} onChange={event => change('width', event.target.value)}>
            <option value="">All widths</option>
            {options.widths.map(width => <option key={width} value={width}>{width} inch</option>)}
          </select>
        </label>
      </div>
      <div className="wheel-search-note">
        <Info size={15} aria-hidden="true" />
        <p>{setOfFour ? <>A-Line wheel prices are for a <strong>set of 4, including VAT.</strong> </> : <>Prices retain each catalogue’s VAT-inclusive pricing basis. </>}
          Stock quantities are individual units. Vehicle matches use recorded applications; confirm ET, centre bore, width and load rating before fitting.</p>
      </div>
    </section>
  );
};
