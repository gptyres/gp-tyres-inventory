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
  const isAdjusted = adjustment.mode !== 'BASE';
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
    <div className="min-w-0 xl:border-l xl:border-gp-border xl:pl-4" aria-label="Supplier selling price markup">
      <div className="mb-1.5 flex min-h-5 items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="shrink-0 text-[9px] font-black uppercase tracking-wider text-gp-text-muted">Price markup</p>
          <span className="truncate rounded-sm border border-sky-500/20 bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase text-sky-300">
            Cost incl. VAT
          </span>
        </div>
        {isAdjusted && (
          <button
            type="button"
            onClick={() => selectAdjustment('BASE')}
            className="shrink-0 border-l border-gp-border pl-3 text-[9px] font-black uppercase text-gp-text-muted transition-colors hover:text-gp-text-main"
            title="Reset supplier selling prices"
          >
            Reset
          </button>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-2">

        <select
          value={selectedKey}
          onChange={(event) => selectAdjustment(event.target.value)}
          className="h-9 min-w-0 flex-1 rounded-md border border-gp-border bg-gp-input px-3 text-xs font-bold text-gp-text-main focus:border-gp-red focus:outline-none sm:hidden"
          aria-label="Select supplier markup"
        >
          <option value="BASE">Base price</option>
          {SUPPLIER_MARKUP_PERCENTAGES.map((percentage) => (
            <option key={percentage} value={percentage}>{percentage}% markup</option>
          ))}
          <option value="FIXED">Custom Rand markup</option>
        </select>

        <div className="hidden min-w-0 items-center rounded-md border border-gp-border bg-gp-black/50 p-1 sm:flex" role="group" aria-label="Supplier markup presets">
          <button
            type="button"
            onClick={() => selectAdjustment('BASE')}
            aria-pressed={selectedKey === 'BASE'}
            className={`h-7 rounded px-2 text-[9px] font-black uppercase transition-colors ${selectedKey === 'BASE' ? 'bg-gp-panel text-white shadow-sm' : 'text-gp-text-muted hover:bg-gp-panel/70 hover:text-gp-text-main'}`}
          >
            Base
          </button>
          {SUPPLIER_MARKUP_PERCENTAGES.map((percentage) => (
            <button
              key={percentage}
              type="button"
              onClick={() => selectAdjustment(String(percentage))}
              aria-pressed={selectedKey === String(percentage)}
              className={`h-7 rounded px-2 text-[9px] font-black transition-colors ${selectedKey === String(percentage) ? 'bg-gp-red text-white shadow-sm' : 'text-gp-text-muted hover:bg-gp-panel/70 hover:text-gp-text-main'}`}
            >
              {percentage}%
            </button>
          ))}
        </div>

        <label className={`flex h-9 w-28 shrink-0 items-center overflow-hidden rounded-md border bg-gp-black/55 transition-colors sm:w-32 ${adjustment.mode === 'FIXED' ? 'border-gp-red/60' : 'border-gp-border hover:border-gp-text-muted'}`}>
          <span className={`pl-3 text-[10px] font-black ${adjustment.mode === 'FIXED' ? 'text-gp-red' : 'text-gp-text-muted'}`}>+R</span>
          <input
            type="number"
            min="0"
            step="50"
            inputMode="decimal"
            value={adjustment.mode === 'FIXED' && adjustment.value ? adjustment.value : ''}
            onChange={(event) => onChange({ mode: 'FIXED', value: Math.max(0, Number(event.target.value) || 0) })}
            placeholder="Custom"
            className="h-full min-w-0 flex-1 appearance-none bg-transparent px-2 font-mono text-xs font-bold text-gp-text-main outline-none focus:outline-none focus:ring-0"
            aria-label="Custom Rand markup amount"
          />
        </label>
      </div>
    </div>
  );
};
