import React, { useRef, useState } from 'react';
import {
  ManualSupplierParseResult,
  parseManualSupplierFile,
  publishManualSupplierRows
} from '../manualSupplierImport';
import type { SupplierImportCatalog } from '../supplierCatalogMapping';

interface ManualSupplierImportProps {
  terminal: string;
  catalog: SupplierImportCatalog;
  supplierLabel: string;
  visible: boolean;
  canOpen?: boolean;
  onAdminRequired?: () => void;
  onPublished: () => void;
}

const formatCount = (value: number) => new Intl.NumberFormat('en-ZA').format(value);
const formatMoney = (value: number) => new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR'
}).format(value);

export function ManualSupplierImport({
  terminal,
  catalog,
  supplierLabel,
  visible,
  canOpen = true,
  onAdminRequired,
  onPublished
}: ManualSupplierImportProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ManualSupplierParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  if (!visible) return null;

  const reset = () => {
    setFile(null);
    setResult(null);
    setError('');
    setMessage('');
    setDragActive(false);
    dragDepthRef.current = 0;
    if (inputRef.current) inputRef.current.value = '';
  };

  const close = () => {
    if (publishing) return;
    setOpen(false);
    reset();
  };

  const openImport = () => {
    if (!canOpen) {
      onAdminRequired?.();
      return;
    }
    setOpen(true);
  };

  const handleFile = async (selectedFile?: File) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setResult(null);
    setError('');
    setMessage('');
    setParsing(true);
    try {
      setResult(await parseManualSupplierFile(catalog, selectedFile));
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'The supplier document could not be read.');
    } finally {
      setParsing(false);
    }
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (parsing || publishing) return;
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (parsing || publishing) return;
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setDragActive(false);
    if (parsing || publishing) return;
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) void handleFile(droppedFile);
  };

  const publish = async () => {
    if (!file || !result?.rows.length) return;
    setPublishing(true);
    setError('');
    setMessage('Writing the supplier stock to Google Sheets, then publishing the portal catalogue…');
    try {
      const published = await publishManualSupplierRows(catalog, terminal, file.name, result.rows);
      setMessage(`${formatCount(published.rowsPublished || result.rows.length)} rows written to ${published.sheetName} and published live.`);
      onPublished();
    } catch (publishError) {
      setMessage('');
      setError(publishError instanceof Error ? publishError.message : 'The supplier document import failed.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openImport}
        aria-label={canOpen ? `Upload ${supplierLabel} stock` : `Admin access required to upload ${supplierLabel} stock`}
        title={canOpen ? `Upload ${supplierLabel} stock` : 'Admin access required'}
        className="inline-flex h-11 w-full min-w-0 self-start items-center justify-center whitespace-nowrap rounded-lg border border-amber-300/70 bg-amber-500 px-4 text-xs font-black uppercase tracking-wider text-black shadow-lg shadow-amber-900/20 transition hover:-translate-y-px hover:bg-amber-400 active:translate-y-0"
      >
        Upload Stock
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${supplierLabel} stock document import`}>
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-amber-400/40 bg-gp-panel p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">Admin Supplier File Import</p>
                <h2 className="mt-1 font-display text-2xl font-black uppercase text-gp-text-main">Import {supplierLabel} Stock</h2>
                <p className="mt-2 max-w-3xl text-xs text-gp-text-muted">
                  Upload a CSV, text-based PDF, XLS, or XLSX file. Review the detected pricing, location, and stock before publishing. The current supplier catalogue is replaced only after its Google Sheet tab is updated successfully.
                </p>
              </div>
              <button type="button" onClick={close} disabled={publishing} aria-label="Close supplier import" className="text-2xl text-gp-text-muted hover:text-white disabled:opacity-40">×</button>
            </div>

            <div
              data-testid="supplier-file-dropzone"
              aria-label="Drop supplier stock document here or choose a file"
              aria-busy={parsing || publishing}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`mt-5 rounded-lg border-2 border-dashed p-6 text-center transition-all ${
                dragActive
                  ? 'scale-[1.01] border-amber-300 bg-amber-500/15 shadow-[0_0_30px_rgba(245,158,11,0.18)]'
                  : 'border-amber-400/40 bg-gp-black/50'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.csv,.xls,.xlsx"
                className="hidden"
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
              <div
                aria-hidden="true"
                className={`mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border text-xl transition-colors ${
                  dragActive
                    ? 'border-amber-300 bg-amber-400 text-black'
                    : 'border-amber-400/40 bg-gp-panel text-amber-400'
                }`}
              >
                {dragActive ? '↓' : '↑'}
              </div>
              <p className="text-sm font-black uppercase tracking-wider text-gp-text-main">
                {dragActive ? 'Drop file to import' : 'Drag & drop your supplier file here'}
              </p>
              <p className="mb-4 mt-1 text-[10px] font-bold uppercase tracking-widest text-gp-text-muted">
                CSV, PDF, XLS or XLSX · Maximum 20 MB
              </p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={parsing || publishing}
                className="rounded bg-amber-500 px-5 py-3 text-xs font-black uppercase tracking-widest text-black hover:bg-amber-400 disabled:opacity-50"
              >
                {parsing ? 'Extracting Stock…' : file ? 'Choose Another File' : 'Choose Supplier Document'}
              </button>
              {file && <p className="mt-2 text-xs font-bold text-gp-text-main">{file.name}</p>}
            </div>

            {error && <div className="mt-4 rounded border border-gp-red/40 bg-gp-red/10 p-3 text-sm font-bold text-gp-red">{error}</div>}
            {message && <div className="mt-4 rounded border border-green-500/40 bg-green-500/10 p-3 text-sm font-bold text-green-300">{message}</div>}

            {result && (
              <div className="mt-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded border border-gp-border bg-gp-black p-3">
                    <p className="text-[10px] uppercase tracking-widest text-gp-text-muted">Ready to import</p>
                    <p className="mt-1 text-2xl font-black text-green-400">{formatCount(result.rows.length)}</p>
                  </div>
                  <div className="rounded border border-gp-border bg-gp-black p-3">
                    <p className="text-[10px] uppercase tracking-widest text-gp-text-muted">Rejected</p>
                    <p className="mt-1 text-2xl font-black text-amber-400">{formatCount(result.rejectedRows)}</p>
                  </div>
                  <div className="rounded border border-gp-border bg-gp-black p-3">
                    <p className="text-[10px] uppercase tracking-widest text-gp-text-muted">Detected fields</p>
                    <p className="mt-1 text-xs font-bold uppercase text-gp-text-main">{result.detectedColumns.join(', ')}</p>
                  </div>
                </div>

                {result.warnings.map((warning) => (
                  <p key={warning} className="rounded border border-amber-400/30 bg-amber-500/10 p-2 text-xs font-bold text-amber-200">{warning}</p>
                ))}

                <div className="overflow-x-auto rounded border border-gp-border">
                  <table className="w-full min-w-[850px] text-left text-xs">
                    <thead className="bg-gp-black text-[10px] uppercase tracking-wider text-gp-text-muted">
                      <tr>
                        <th className="p-2">SKU</th><th className="p-2">Brand / Product</th><th className="p-2">Size</th><th className="p-2">Stock</th><th className="p-2">Cost (VAT incl.)</th><th className="p-2">Selling (VAT incl.)</th><th className="p-2">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.slice(0, 20).map((row) => (
                        <tr key={row.sourceKey} className="border-t border-gp-border/70 text-gp-text-main">
                          <td className="p-2 font-mono">{row.supplierSku}</td>
                          <td className="p-2"><span className="font-bold">{row.brand}</span><span className="block text-gp-text-muted">{row.productName}</span></td>
                          <td className="p-2 font-bold">{row.size}</td>
                          <td className="p-2">{formatCount(row.stockUnits)}</td>
                          <td className="p-2">{formatMoney(row.costPrice)}</td>
                          <td className="p-2">{formatMoney(row.sellingPrice)}</td>
                          <td className="p-2">{row.stockLocation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {result.rows.length > 20 && <p className="text-right text-[10px] text-gp-text-muted">Previewing 20 of {formatCount(result.rows.length)} rows.</p>}

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={close} disabled={publishing} className="rounded border border-gp-border px-4 py-2 text-xs font-black uppercase text-gp-text-main hover:border-gp-text-muted disabled:opacity-40">Cancel</button>
                  <button
                    type="button"
                    onClick={() => void publish()}
                    disabled={publishing}
                    className="rounded bg-green-600 px-5 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-green-500 disabled:cursor-wait disabled:opacity-50"
                  >
                    {publishing ? 'Publishing…' : `Publish ${formatCount(result.rows.length)} Rows`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
