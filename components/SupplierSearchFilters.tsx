import React from 'react';
import type { ConcreteSupplierCatalog } from '../supplierCatalogLoader';

interface SupplierOption {
  catalog: ConcreteSupplierCatalog;
  label: string;
}

interface SupplierSearchFiltersProps {
  options: SupplierOption[];
  selected: ConcreteSupplierCatalog[];
  onChange: (catalogs: ConcreteSupplierCatalog[]) => void;
}

export const SupplierSearchFilters: React.FC<SupplierSearchFiltersProps> = ({
  options,
  selected,
  onChange
}) => {
  const selectedSet = new Set(selected);
  const allSelected = selected.length === options.length;
  const selectionLabel = allSelected
    ? 'All suppliers'
    : selected.length === 0
      ? 'No suppliers selected'
      : selected.length === 1
        ? options.find((option) => option.catalog === selected[0])?.label || '1 supplier'
        : `${selected.length} suppliers`;

  const toggleSupplier = (catalog: ConcreteSupplierCatalog) => {
    if (selectedSet.has(catalog)) {
      onChange(selected.filter((selectedCatalog) => selectedCatalog !== catalog));
      return;
    }
    onChange(options.map((option) => option.catalog).filter((optionCatalog) => (
      selectedSet.has(optionCatalog) || optionCatalog === catalog
    )));
  };

  return (
    <section className="relative min-w-0" aria-label="Supplier search filters">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-blue-300">Search suppliers</p>
          <p className="mt-0.5 text-[11px] text-gp-text-muted">Choose who is included before searching stock.</p>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide">
          <button
            type="button"
            onClick={() => onChange(options.map((option) => option.catalog))}
            className="rounded-md border border-gp-border bg-gp-input px-2.5 py-1.5 text-gp-text-main transition hover:border-blue-500 hover:text-blue-300 active:translate-y-px"
          >
            All
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded-md border border-gp-border bg-gp-input px-2.5 py-1.5 text-gp-text-muted transition hover:border-blue-500 hover:text-gp-text-main active:translate-y-px"
          >
            Clear
          </button>
        </div>
      </div>

      <details className="group relative">
        <summary className="flex h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-blue-700/50 bg-gp-input px-3 text-left transition hover:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 truncate text-xs font-black uppercase tracking-wide text-gp-text-main">{selectionLabel}</span>
          <span className="shrink-0 text-[10px] font-bold text-blue-300">
            {selected.length}/{options.length} <span aria-hidden="true" className="ml-1 inline-block transition group-open:rotate-180">▼</span>
          </span>
        </summary>

        <div className="absolute right-0 z-40 mt-2 max-h-[min(440px,65vh)] w-full min-w-[280px] overflow-y-auto rounded-lg border border-blue-800/70 bg-gp-panel p-2 shadow-2xl shadow-black/50 sm:min-w-[420px]">
          <div className="grid gap-1 sm:grid-cols-2">
            {options.map((option) => {
              const checked = selectedSet.has(option.catalog);
              return (
                <label
                  key={option.catalog}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-xs font-bold transition ${checked ? 'border-blue-600/70 bg-blue-900/25 text-blue-200' : 'border-transparent text-gp-text-muted hover:border-gp-border hover:bg-gp-input hover:text-gp-text-main'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSupplier(option.catalog)}
                    className="h-4 w-4 shrink-0 accent-blue-600"
                  />
                  <span className="min-w-0 truncate">{option.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      </details>
    </section>
  );
};
