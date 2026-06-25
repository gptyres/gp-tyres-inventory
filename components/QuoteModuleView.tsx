import React, { useEffect, useMemo, useState } from 'react';
import { hasGeminiNanoPromptApi } from '../pricing-processor/ai-provider';
import { setPercentageMarkup } from '../pricing-processor/calculate-price';
import { DEFAULT_PRICING_RULES, PERCENTAGE_MARKUPS } from '../pricing-processor/constants';
import { canonicalSizeKey, normalizeTyreSize } from '../pricing-processor/extract-size';
import { buildPOSQuoteLines } from '../pricing-processor/pos-lines';
import { processPricing } from '../pricing-processor/process-pricing';
import {
  clearPricingSession,
  createEmptyPricingSession,
  loadPricingSession,
  savePricingSession
} from '../pricing-processor/session';
import { PricingPOSQuoteLine, PricingProcessorSessionState, PricingRules, ProcessingMode, TyreRecord } from '../pricing-processor/types';

const inputClassName = 'w-full rounded-lg border border-gp-border bg-gp-black px-3 py-3 text-sm text-gp-text-main placeholder-gp-text-muted outline-none transition-colors focus:border-gp-red focus:ring-1 focus:ring-gp-red';
const panelClassName = 'rounded-lg border border-gp-border bg-gp-panel shadow-sm';
const actionButtonClassName = 'min-h-11 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-gp-red focus:ring-offset-2 focus:ring-offset-gp-black';

const getSelectedOutput = (state: PricingProcessorSessionState): string => {
  if (!state.result) return '';
  if (state.selectedPanel === 'staggered') return state.result.staggeredOutput ?? '';
  if (state.selectedPanel === 'review') {
    return state.result.reviewRecords.map((record) => [
      `${record.id}: ${record.issues.join(' ')}`,
      record.rawText
    ].join('\n')).join('\n\n');
  }
  return state.result.standardOutput;
};

const buildStatusText = (state: PricingProcessorSessionState, status: string): string => {
  if (status) return status;
  if (!state.result) return 'Ready to process supplier data.';
  const reviewCount = state.result.reviewRecords.length;
  return `${state.result.records.length} records processed, ${state.result.validRecords.length} ready, ${reviewCount} for review.`;
};

interface QuoteModuleViewProps {
  onPushToPOSQuote: (lines: PricingPOSQuoteLine[]) => void;
}

const getQuoteModulePOSRecords = (state: PricingProcessorSessionState): TyreRecord[] => {
  if (!state.result) return [];
  if (state.mode !== 'staggered') return state.result.validRecords;

  const frontKey = canonicalSizeKey(normalizeTyreSize(state.frontSize));
  const rearKey = canonicalSizeKey(normalizeTyreSize(state.rearSize));
  const targetKeys = new Set([frontKey, rearKey].filter(Boolean));
  if (!targetKeys.size) return state.result.validRecords;

  return state.result.validRecords.filter((record) => targetKeys.has(canonicalSizeKey(record.size)));
};

export const QuoteModuleView: React.FC<QuoteModuleViewProps> = ({ onPushToPOSQuote }) => {
  const [state, setState] = useState<PricingProcessorSessionState>(() => loadPricingSession());
  const [status, setStatus] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const hasNano = hasGeminiNanoPromptApi();

  useEffect(() => {
    const timer = window.setTimeout(() => savePricingSession(state), 250);
    return () => window.clearTimeout(timer);
  }, [state]);

  const selectedOutput = useMemo(() => getSelectedOutput(state), [state]);
  const statusText = buildStatusText(state, status);
  const normalizedFront = normalizeTyreSize(state.frontSize);
  const normalizedRear = normalizeTyreSize(state.rearSize);
  const posQuoteLines = useMemo(() => (
    buildPOSQuoteLines(getQuoteModulePOSRecords(state), state.rules)
  ), [state]);

  const updateRules = (patch: Partial<PricingRules>) => {
    setState((current) => ({
      ...current,
      rules: {
        ...current.rules,
        ...patch
      }
    }));
  };

  const setMode = (mode: ProcessingMode) => {
    setState((current) => ({
      ...current,
      mode,
      selectedPanel: mode === 'staggered' ? 'staggered' : 'standard'
    }));
  };

  const handleProcess = () => {
    setCopyStatus('');
    const result = processPricing({
      rawData: state.rawData,
      rules: {
        ...state.rules,
        fixedMarkup: Math.max(0, Number(state.rules.fixedMarkup) || 0)
      },
      mode: state.mode,
      frontSize: state.frontSize,
      rearSize: state.rearSize
    });

    setState((current) => ({
      ...current,
      result,
      selectedPanel: current.mode === 'staggered' ? 'staggered' : 'standard'
    }));
    setStatus(result.reviewRecords.length ? 'Processed with review items.' : 'Processed successfully.');
  };

  const handleCopy = async () => {
    if (!selectedOutput) {
      setCopyStatus('Nothing to copy yet.');
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedOutput);
      setCopyStatus('Output copied.');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = selectedOutput;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      setCopyStatus('Output copied.');
    }
  };

  const handlePushToPOS = () => {
    if (!posQuoteLines.length) {
      setStatus('Process supplier data before pushing lines to POS.');
      return;
    }

    onPushToPOSQuote(posQuoteLines);
    setStatus(`${posQuoteLines.length} quote line${posQuoteLines.length === 1 ? '' : 's'} pushed to POS.`);
  };

  const handleClear = () => {
    clearPricingSession();
    setState(createEmptyPricingSession());
    setStatus('Session cleared.');
    setCopyStatus('');
  };

  const reviewCount = state.result?.reviewRecords.length ?? 0;
  const readyCount = state.result?.validRecords.length ?? 0;
  const totalCount = state.result?.records.length ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 md:px-5 md:py-6">
      <header className="flex flex-col gap-3 border-b border-gp-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gp-red shadow-[0_0_12px_rgba(255,0,0,0.8)]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gp-text-muted">QUOTE_MODULE</span>
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-gp-text-main md:text-3xl">Pricing Processor</h1>
          <p className="mt-1 max-w-2xl text-sm text-gp-text-muted">
            Convert messy supplier tyre data into customer-ready standard quotes or staggered fitment options.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center sm:flex sm:items-center">
          <div className="rounded-lg border border-gp-border bg-gp-input px-4 py-3">
            <div className="text-xl font-black text-gp-text-main">{totalCount}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">Records</div>
          </div>
          <div className="rounded-lg border border-green-900/50 bg-green-950/20 px-4 py-3">
            <div className="text-xl font-black text-green-400">{readyCount}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">Ready</div>
          </div>
          <div className="rounded-lg border border-gp-red/40 bg-gp-red/10 px-4 py-3">
            <div className="text-xl font-black text-gp-red">{reviewCount}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">Review</div>
          </div>
        </div>
      </header>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className={`${panelClassName} min-w-0 p-4`} aria-labelledby="quote-module-input-heading">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="quote-module-input-heading" className="text-sm font-black uppercase tracking-wider text-gp-text-main">Input & Rules</h2>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-gp-border bg-gp-black p-1">
              <button
                type="button"
                onClick={() => setMode('standard')}
                className={`min-h-10 rounded px-4 text-xs font-bold uppercase transition-colors ${state.mode === 'standard' ? 'bg-gp-red text-white' : 'text-gp-text-muted hover:bg-gp-border hover:text-gp-text-main'}`}
              >
                Standard
              </button>
              <button
                type="button"
                onClick={() => setMode('staggered')}
                className={`min-h-10 rounded px-4 text-xs font-bold uppercase transition-colors ${state.mode === 'staggered' ? 'bg-gp-red text-white' : 'text-gp-text-muted hover:bg-gp-border hover:text-gp-text-main'}`}
              >
                Staggered
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gp-text-muted">Fixed Rand Markup</span>
              <input
                type="number"
                min={0}
                inputMode="decimal"
                className={inputClassName}
                value={state.rules.fixedMarkup}
                onChange={(event) => updateRules({ fixedMarkup: Math.max(0, Number(event.target.value) || 0) })}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gp-text-muted">AI Identification</span>
              <div className="flex min-h-11 items-center rounded-lg border border-gp-border bg-gp-black px-3 text-xs font-bold uppercase tracking-wider text-gp-text-muted">
                {hasNano ? 'Gemini Nano Available' : 'Deterministic Mode'}
              </div>
            </label>
          </div>

          {state.mode === 'staggered' && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gp-text-muted">Front Size</span>
                <input
                  type="text"
                  className={inputClassName}
                  placeholder="225/40R18"
                  value={state.frontSize}
                  onChange={(event) => setState((current) => ({ ...current, frontSize: event.target.value }))}
                />
                {state.frontSize && (
                  <span className="mt-1 block text-[11px] text-gp-text-muted">{normalizedFront ?? 'Invalid size'}</span>
                )}
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gp-text-muted">Rear Size</span>
                <input
                  type="text"
                  className={inputClassName}
                  placeholder="255/35R18"
                  value={state.rearSize}
                  onChange={(event) => setState((current) => ({ ...current, rearSize: event.target.value }))}
                />
                {state.rearSize && (
                  <span className="mt-1 block text-[11px] text-gp-text-muted">{normalizedRear ?? 'Invalid size'}</span>
                )}
              </label>
            </div>
          )}

          <div className="mt-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gp-text-muted">Pricing Rules</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => updateRules({ roundTo50: !state.rules.roundTo50 })}
                className={`min-h-11 rounded-lg border px-3 text-xs font-bold uppercase transition-colors ${state.rules.roundTo50 ? 'border-gp-red bg-gp-red text-white' : 'border-gp-border bg-gp-black text-gp-text-muted hover:text-gp-text-main'}`}
              >
                Round R50
              </button>
              {PERCENTAGE_MARKUPS.map((percent) => (
                <button
                  key={percent}
                  type="button"
                  onClick={() => setState((current) => ({ ...current, rules: setPercentageMarkup(current.rules, percent) }))}
                  className={`min-h-11 rounded-lg border px-3 text-xs font-bold uppercase transition-colors ${state.rules.percentageMarkup === percent ? 'border-gp-red bg-gp-red text-white' : 'border-gp-border bg-gp-black text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  {percent}% Markup
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gp-text-muted">Output Fields</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                ['showCategory', 'Tyre Category'],
                ['showRating', 'Tyre Rating'],
                ['showOemSpec', 'OEM Specs'],
                ['showStock', 'Units in Stock'],
                ['showLeadTime', 'Lead Time']
              ].map(([key, label]) => (
                <label key={key} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border border-gp-border bg-gp-black px-3 text-sm text-gp-text-main">
                  <span className="font-bold">{label}</span>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-gp-red"
                    checked={Boolean(state.rules[key as keyof PricingRules])}
                    onChange={(event) => updateRules({ [key]: event.target.checked } as Partial<PricingRules>)}
                  />
                </label>
              ))}
            </div>
          </div>

          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gp-text-muted">Raw Supplier Data</span>
            <textarea
              className={`${inputClassName} min-h-[280px] resize-y font-mono text-xs leading-relaxed`}
              placeholder="Paste supplier data here..."
              value={state.rawData}
              onChange={(event) => setState((current) => ({ ...current, rawData: event.target.value }))}
              spellCheck={false}
            />
          </label>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-4">
            <button
              type="button"
              onClick={handleProcess}
              className={`${actionButtonClassName} bg-gp-red text-white shadow-[0_0_14px_rgba(255,0,0,0.35)] hover:bg-red-700`}
            >
              Process
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className={`${actionButtonClassName} border border-gp-border bg-gp-black text-gp-text-main hover:border-gp-red`}
            >
              Copy Output
            </button>
            <button
              type="button"
              onClick={handlePushToPOS}
              disabled={!posQuoteLines.length}
              className={`${actionButtonClassName} border border-green-700 bg-green-950/30 text-green-300 hover:bg-green-900/40 disabled:cursor-not-allowed disabled:opacity-40`}
            >
              Push to POS
            </button>
            <button
              type="button"
              onClick={handleClear}
              className={`${actionButtonClassName} border border-gp-border bg-gp-input text-gp-text-muted hover:text-gp-text-main`}
            >
              Clear
            </button>
          </div>

          <div aria-live="polite" className="mt-3 min-h-6 text-sm text-gp-text-muted">
            {statusText}
            {copyStatus && <span className="ml-2 text-green-400">{copyStatus}</span>}
          </div>
        </section>

        <section className={`${panelClassName} flex min-w-0 flex-col overflow-hidden`} aria-labelledby="quote-module-output-heading">
          <div className="flex flex-col gap-3 border-b border-gp-border p-4 lg:flex-row lg:items-center lg:justify-between">
            <h2 id="quote-module-output-heading" className="text-sm font-black uppercase tracking-wider text-gp-text-main">Customer Output</h2>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-gp-border bg-gp-black p-1">
              <button
                type="button"
                onClick={() => setState((current) => ({ ...current, selectedPanel: 'standard' }))}
                className={`min-h-10 rounded px-3 text-xs font-bold uppercase transition-colors ${state.selectedPanel === 'standard' ? 'bg-gp-red text-white' : 'text-gp-text-muted hover:bg-gp-border hover:text-gp-text-main'}`}
              >
                Standard
              </button>
              <button
                type="button"
                onClick={() => setState((current) => ({ ...current, selectedPanel: 'staggered' }))}
                className={`min-h-10 rounded px-3 text-xs font-bold uppercase transition-colors ${state.selectedPanel === 'staggered' ? 'bg-gp-red text-white' : 'text-gp-text-muted hover:bg-gp-border hover:text-gp-text-main'}`}
              >
                Staggered
              </button>
              <button
                type="button"
                onClick={() => setState((current) => ({ ...current, selectedPanel: 'review' }))}
                className={`min-h-10 rounded px-3 text-xs font-bold uppercase transition-colors ${state.selectedPanel === 'review' ? 'bg-gp-red text-white' : 'text-gp-text-muted hover:bg-gp-border hover:text-gp-text-main'}`}
              >
                Review
              </button>
            </div>
          </div>

          <div className="min-h-[360px] flex-1 overflow-auto bg-gp-black p-4">
            {state.selectedPanel === 'review' && state.result ? (
              <div className="space-y-3">
                {state.result.reviewRecords.length === 0 ? (
                  <div className="rounded-lg border border-green-900/50 bg-green-950/20 p-4 text-sm text-green-300">No unresolved records.</div>
                ) : state.result.reviewRecords.map((record) => (
                  <article key={record.id} className="rounded-lg border border-gp-border bg-gp-panel p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded bg-gp-red px-2 py-1 text-[10px] font-bold uppercase text-white">{record.id}</span>
                      <span className="text-xs text-gp-text-muted">{record.size ?? 'No size'} / {record.brand ?? 'No brand'} / {record.pattern ?? 'No pattern'}</span>
                    </div>
                    <ul className="mb-3 space-y-1 text-sm text-gp-red">
                      {record.issues.map((issue) => <li key={issue}>{issue}</li>)}
                    </ul>
                    <pre className="whitespace-pre-wrap break-words rounded bg-gp-black p-3 text-xs text-gp-text-muted">{record.rawText}</pre>
                  </article>
                ))}
              </div>
            ) : (
              <pre className="min-h-[320px] whitespace-pre-wrap break-words rounded-lg border border-gp-border bg-gp-panel p-4 font-mono text-sm leading-relaxed text-gp-text-main">
                {selectedOutput || 'Process supplier data to generate customer-ready pricing.'}
              </pre>
            )}
          </div>

          {state.result?.errors.length ? (
            <div className="border-t border-gp-border bg-gp-input p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gp-text-muted">Validation</div>
              <div className="max-h-32 space-y-1 overflow-auto text-xs">
                {state.result.errors.slice(0, 8).map((error, index) => (
                  <div key={`${error.recordId}-${index}`} className={error.severity === 'warning' ? 'text-yellow-300' : 'text-gp-red'}>
                    {error.recordId}: {error.message}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
};
