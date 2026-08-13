import React, { useState } from 'react';
import type { InventoryItem } from '../types';
import {
  buildInventoryReportRows,
  createInventoryReport,
  type BuildInventoryReportRowsOptions,
  type InventoryReportContext
} from '../inventoryReport';
import gpLogo from '../assets/gp-tyres-logo-transparent.png';

interface InventoryReportModalProps {
  items: InventoryItem[];
  context: Omit<InventoryReportContext, 'generatedAt' | 'resultCount'>;
  canShowCost: boolean;
  rowOptions: Omit<BuildInventoryReportRowsOptions, 'imageUrls'>;
  resolveImageUrls: () => Promise<Record<string, string>>;
  onClose: () => void;
}

type ReportAction = 'DOWNLOAD' | 'PRINT';

export const InventoryReportModal: React.FC<InventoryReportModalProps> = ({
  items,
  context,
  canShowCost,
  rowOptions,
  resolveImageUrls,
  onClose
}) => {
  const [generating, setGenerating] = useState<ReportAction | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [visibility, setVisibility] = useState(context.visibility);

  const columnOptions: Array<{ key: keyof InventoryReportContext['visibility']; label: string; disabled?: boolean }> = [
    { key: 'visual', label: 'Visual' },
    { key: 'type', label: 'Type' },
    { key: 'mainSpec', label: 'Main Spec' },
    { key: 'brandModel', label: 'Brand / Model' },
    ...(context.showSupplierName ? [{ key: 'supplier' as const, label: 'Supplier' }] : []),
    { key: 'specs', label: 'Details' },
    { key: 'location', label: 'Location' },
    { key: 'quantity', label: 'Qty' },
    { key: 'cost', label: 'Cost', disabled: !canShowCost },
    { key: 'sellingPrice', label: 'Selling Price' }
  ];

  const selectedColumnCount = Object.values(visibility).filter(Boolean).length;

  const toggleColumn = (key: keyof InventoryReportContext['visibility']) => {
    setVisibility((current) => ({ ...current, [key]: !current[key] }));
  };

  const generate = async (action: ReportAction) => {
    if (generating) return;
    const printWindow = action === 'PRINT' ? window.open('', '_blank') : null;
    setGenerating(action);
    setError('');
    setStatus(visibility.visual ? 'Matching stored visuals...' : 'Preparing stock rows...');

    try {
      const imageUrls = visibility.visual ? await resolveImageUrls() : {};
      const generatedAt = new Date().toISOString();
      const reportContext: InventoryReportContext = {
        ...context,
        visibility,
        generatedAt,
        resultCount: items.length
      };
      const rows = buildInventoryReportRows(items, { ...rowOptions, imageUrls });
      setStatus(visibility.visual ? 'Loading report visuals...' : 'Building A4 pages...');
      const { doc, fileName } = await createInventoryReport({
        rows,
        context: reportContext,
        logoUrl: gpLogo,
        onProgress: (completed, total) => setStatus(`Loading visuals ${completed} of ${total}...`)
      });
      setStatus('Finalizing PDF...');

      if (action === 'DOWNLOAD') {
        doc.save(fileName);
      } else {
        doc.autoPrint();
        const blobUrl = doc.output('bloburl');
        if (printWindow) {
          printWindow.location.href = blobUrl.toString();
          printWindow.focus();
        } else {
          window.open(blobUrl, '_blank', 'noopener,noreferrer')?.focus();
        }
      }
      onClose();
    } catch (reportError) {
      printWindow?.close();
      setError(reportError instanceof Error ? reportError.message : 'The inventory PDF could not be created.');
      setStatus('');
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:items-center" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-report-title"
        className="my-auto w-full max-w-lg overflow-hidden rounded-lg border border-gp-border bg-gp-dark shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-gp-border p-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gp-red">Landscape A4 report</p>
            <h2 id="inventory-report-title" className="mt-1 text-xl font-black uppercase text-white">Inventory stock sheet</h2>
            <p className="mt-1 text-xs leading-relaxed text-gp-text-muted">Download or print the complete filtered result, including rows beyond the current screen.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(generating)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gp-border text-xl text-gp-text-muted transition hover:border-gp-red hover:text-white disabled:opacity-40"
            aria-label="Close inventory report"
          >
            &times;
          </button>
        </header>

        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="rounded-md border border-gp-border bg-gp-panel p-3">
            <p className="text-[9px] font-black uppercase tracking-wider text-gp-text-muted">Stock source</p>
            <p className="mt-1 truncate text-sm font-black uppercase text-white">{context.catalogueLabel}</p>
          </div>
          <div className="rounded-md border border-gp-border bg-gp-panel p-3">
            <p className="text-[9px] font-black uppercase tracking-wider text-gp-text-muted">Matching rows</p>
            <p className="mt-1 font-mono text-xl font-black text-gp-red">{items.length}</p>
          </div>
          <div className="rounded-md border border-gp-border bg-gp-panel p-3 sm:col-span-2">
            <p className="text-[9px] font-black uppercase tracking-wider text-gp-text-muted">Active search</p>
            <p className="mt-1 break-words text-sm font-bold text-white">{context.searchQuery.trim() || 'All matching stock'}</p>
          </div>
          <fieldset className="rounded-md border border-gp-border bg-gp-panel p-3 sm:col-span-2">
            <legend className="px-1 text-[9px] font-black uppercase tracking-wider text-gp-text-muted">Sheet columns</legend>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {columnOptions.map((option) => (
                <label
                  key={option.key}
                  className={`flex min-h-9 items-center gap-2 rounded border px-2.5 py-2 text-[10px] font-black uppercase tracking-wide transition ${option.disabled ? 'cursor-not-allowed border-gp-border/50 text-gp-text-muted opacity-45' : visibility[option.key] ? 'cursor-pointer border-gp-red/60 bg-gp-red/10 text-white' : 'cursor-pointer border-gp-border bg-gp-black/30 text-gp-text-muted hover:border-gp-text-muted'}`}
                >
                  <input
                    type="checkbox"
                    checked={visibility[option.key]}
                    disabled={option.disabled}
                    onChange={() => toggleColumn(option.key)}
                    className="h-4 w-4 accent-red-600"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {(status || error) ? (
          <div className={`mx-4 mb-4 rounded-md border px-3 py-2 text-xs font-bold ${error ? 'border-gp-red/50 bg-gp-red/10 text-gp-red' : 'border-blue-500/30 bg-blue-500/10 text-blue-200'}`} aria-live="polite">
            {error || status}
          </div>
        ) : null}

        <footer className="grid gap-2 border-t border-gp-border p-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void generate('DOWNLOAD')}
            disabled={Boolean(generating) || items.length === 0 || selectedColumnCount === 0}
            className="h-11 rounded-md bg-gp-red px-4 text-xs font-black uppercase tracking-wider text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {generating === 'DOWNLOAD' ? 'Creating PDF...' : 'Download PDF'}
          </button>
          <button
            type="button"
            onClick={() => void generate('PRINT')}
            disabled={Boolean(generating) || items.length === 0 || selectedColumnCount === 0}
            className="h-11 rounded-md border border-gp-border bg-gp-panel px-4 text-xs font-black uppercase tracking-wider text-white transition hover:border-gp-red hover:text-gp-red disabled:cursor-not-allowed disabled:opacity-45"
          >
            {generating === 'PRINT' ? 'Opening PDF...' : 'Print PDF'}
          </button>
        </footer>
      </section>
    </div>
  );
};
