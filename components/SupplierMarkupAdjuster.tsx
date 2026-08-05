import React from 'react';
import {
  SUPPLIER_MARKUP_PERCENTAGES,
  type SupplierMarkupAdjustment
} from '../supplierMarkup';

interface SupplierMarkupAdjusterProps {
  adjustment: SupplierMarkupAdjustment;
  onChange: (adjustment: SupplierMarkupAdjustment) => void;
}

const adjustmentKey = (adjustment: SupplierMarkupAdjustment) => (
  adjustment.mode === 'BASE'
    ? 'BASE'
    : adjustment.mode === 'FIXED'
      ? 'FIXED'
      : String(adjustment.value)
);

export const SupplierMarkupAdjuster: React.FC<SupplierMarkupAdjusterProps> = ({ adjustment, onChange }) => {
  const selectedKey = adjustmentKey(adjustment);
  const selectAdjustment = (key: string) => {
    if (key === 'BASE') {
      onChange({ mode: 'BASE', value: 0 });
      return;
    }
    if (key === 'FIXED') {
      onChange({ mode: 'FIXED', value: adjustment.mode === 'FIXED' ? adjustment.value : 0 });
      return;
    }
    onChange({ mode: 'PERCENT', value: Number(key) });
  };

  return (
    <div className="min-w-0 border-gp-border xl:border-l xl:pl-4" aria-label="Supplier selling price markup">
      <div className="flex flex-wrap items-center gap-2">
        <div className="shrink-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-gp-text-main">Markup</p>
          <p className="text-[8px] font-bold uppercase text-gp-text-muted">From cost incl. VAT</p>
        </div>

        <select
          value={selectedKey}
          onChange={(event) => selectAdjustment(event.target.value)}
          className="h-9 min-w-32 flex-1 rounded border border-gp-border bg-gp-input px-2 text-xs font-bold text-gp-text-main focus:border-gp-red focus:outline-none sm:hidden"
          aria-label="Select supplier markup"
        >
          <option value="BASE">Base price</option>
          {SUPPLIER_MARKUP_PERCENTAGES.map((percentage) => (
            <option key={percentage} value={percentage}>{percentage}% markup</option>
          ))}
          <option value="FIXED">Custom Rand markup</option>
        </select>

        <div className="hidden flex-wrap items-center gap-1 sm:flex" role="group" aria-label="Supplier markup presets">
          <button
            type="button"
            onClick={() => selectAdjustment('BASE')}
            className={`h-8 rounded border px-2 text-[10px] font-black uppercase transition ${selectedKey === 'BASE' ? 'border-gp-red bg-gp-red text-white' : 'border-gp-border bg-gp-input text-gp-text-muted hover:text-gp-text-main'}`}
          >
            Base
          </button>
          {SUPPLIER_MARKUP_PERCENTAGES.map((percentage) => (
            <button
              key={percentage}
              type="button"
              onClick={() => selectAdjustment(String(percentage))}
              className={`h-8 rounded border px-2 text-[10px] font-black transition ${selectedKey === String(percentage) ? 'border-gp-red bg-gp-red text-white' : 'border-gp-border bg-gp-input text-gp-text-muted hover:text-gp-text-main'}`}
            >
              {percentage}%
            </button>
          ))}
          <button
            type="button"
            onClick={() => selectAdjustment('FIXED')}
            className={`h-8 rounded border px-2 text-[10px] font-black uppercase transition ${selectedKey === 'FIXED' ? 'border-gp-red bg-gp-red text-white' : 'border-gp-border bg-gp-input text-gp-text-muted hover:text-gp-text-main'}`}
          >
            +R
          </button>
        </div>

        {adjustment.mode === 'FIXED' && (
          <label className="flex h-9 min-w-36 flex-1 items-center overflow-hidden rounded border border-gp-red/60 bg-gp-input focus-within:border-gp-red sm:max-w-40">
            <span className="pl-3 text-xs font-black text-gp-red">R</span>
            <input
              type="number"
              min="0"
              step="50"
              inputMode="decimal"
              value={adjustment.value || ''}
              onChange={(event) => onChange({ mode: 'FIXED', value: Math.max(0, Number(event.target.value) || 0) })}
              placeholder="Custom markup"
              className="h-full min-w-0 flex-1 bg-transparent px-2 text-xs font-bold text-gp-text-main outline-none"
              aria-label="Custom Rand markup amount"
            />
          </label>
        )}
      </div>
    </div>
  );
};
