import React, { useState } from 'react';
import { PhotoFacets, PhotoFilters } from '../../photoLibrary';

interface SearchToolbarProps {
  filters: PhotoFilters;
  facets: PhotoFacets;
  total: number;
  onChange: (next: PhotoFilters) => void;
  onReset: () => void;
}

const selectClass = 'min-h-10 min-w-0 rounded border border-gp-border bg-gp-black px-3 text-xs font-bold text-gp-text-main outline-none focus:border-gp-red';

const Options: React.FC<{ values: string[]; allLabel: string }> = ({ values, allLabel }) => (
  <>
    <option value="ALL">{allLabel}</option>
    {values.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
  </>
);

export const SearchToolbar: React.FC<SearchToolbarProps> = ({ filters, facets, total, onChange, onReset }) => {
  const [expanded, setExpanded] = useState(false);
  const setFilter = <K extends keyof PhotoFilters>(key: K, value: PhotoFilters[K]) => onChange({ ...filters, [key]: value });

  return (
    <section className="sticky top-0 z-20 border-b border-gp-border bg-gp-black/95 px-4 py-3 backdrop-blur lg:px-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative min-w-0 flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gp-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
          </svg>
          <label htmlFor="photo-library-search" className="sr-only">Search customer photos</label>
          <input
            id="photo-library-search"
            value={filters.search}
            onChange={(event) => setFilter('search', event.target.value)}
            placeholder="Search brand, pattern, size, supplier or tags..."
            className="h-11 w-full rounded border border-gp-border bg-gp-input pl-10 pr-4 text-sm text-gp-text-main outline-none placeholder:text-gp-text-muted focus:border-gp-red"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex">
          <select aria-label="Product type" className={selectClass} value={filters.productType} onChange={(event) => setFilter('productType', event.target.value)}>
            <Options values={facets.productTypes} allLabel="All products" />
          </select>
          <select aria-label="Supplier" className={selectClass} value={filters.supplier} onChange={(event) => setFilter('supplier', event.target.value)}>
            <Options values={facets.suppliers} allLabel="All suppliers" />
          </select>
          <select aria-label="Customer readiness" className={selectClass} value={filters.customerReady} onChange={(event) => setFilter('customerReady', event.target.value)}>
            <option value="ALL">All readiness</option>
            <option value="true">Customer ready</option>
            <option value="false">Not customer ready</option>
          </select>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className={`min-h-10 rounded border px-3 text-xs font-black uppercase transition ${expanded ? 'border-gp-red bg-gp-red text-white' : 'border-gp-border bg-gp-input text-gp-text-main hover:border-gp-red'}`}
            aria-expanded={expanded}
          >
            Filters
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 grid gap-2 border-t border-gp-border pt-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
          <select aria-label="Brand" className={selectClass} value={filters.brand} onChange={(event) => setFilter('brand', event.target.value)}><Options values={facets.brands} allLabel="All brands" /></select>
          <select aria-label="Pattern" className={selectClass} value={filters.pattern} onChange={(event) => setFilter('pattern', event.target.value)}><Options values={facets.patterns} allLabel="All patterns" /></select>
          <select aria-label="Tyre size" className={selectClass} value={filters.tyreSize} onChange={(event) => setFilter('tyreSize', event.target.value)}><Options values={facets.tyreSizes} allLabel="All tyre sizes" /></select>
          <select aria-label="Wheel size" className={selectClass} value={filters.wheelSize} onChange={(event) => setFilter('wheelSize', event.target.value)}><Options values={facets.wheelSizes} allLabel="All wheel sizes" /></select>
          <select aria-label="Photo status" className={selectClass} value={filters.status} onChange={(event) => setFilter('status', event.target.value)}><Options values={facets.statuses} allLabel="All statuses" /></select>
          <select aria-label="Verification" className={selectClass} value={filters.verified} onChange={(event) => setFilter('verified', event.target.value)}>
            <option value="ALL">All verification</option><option value="true">Verified</option><option value="false">Needs verification</option>
          </select>
          <select aria-label="Source" className={selectClass} value={filters.source} onChange={(event) => setFilter('source', event.target.value)}><Options values={facets.sources} allLabel="All sources" /></select>
          <select aria-label="Sort photos" className={selectClass} value={filters.sort} onChange={(event) => setFilter('sort', event.target.value as PhotoFilters['sort'])}>
            <option value="recent">Newest first</option><option value="brand">Brand A-Z</option><option value="pattern">Pattern A-Z</option>
          </select>
          <select aria-label="Tag" className={selectClass} value={filters.tag} onChange={(event) => setFilter('tag', event.target.value)}><Options values={facets.tags} allLabel="All tags" /></select>
          <label className="flex min-h-10 items-center gap-2 rounded border border-gp-border bg-gp-black px-3 text-xs font-bold text-gp-text-muted">
            Added after
            <input type="date" value={filters.dateFrom} onChange={(event) => setFilter('dateFrom', event.target.value)} className="min-w-0 flex-1 bg-transparent text-gp-text-main outline-none" />
          </label>
          <button type="button" onClick={onReset} className="min-h-10 rounded border border-gp-border bg-gp-input px-3 text-xs font-black uppercase text-gp-text-main hover:border-gp-red">Clear filters</button>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gp-text-muted">
        <span>{total.toLocaleString()} matching photos</span>
        <span>Ctrl+A selects this page</span>
      </div>
    </section>
  );
};

