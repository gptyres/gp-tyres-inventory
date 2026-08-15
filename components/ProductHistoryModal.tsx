import React, { useEffect, useMemo, useState } from 'react';
import type { InventoryChangeEvent, InventoryChangeEventType, InventoryChangeSource, InventoryItem } from '../types';
import {
  fetchProductHistory,
  getHistoryActor,
  getHistoryLocation,
  getHistorySummary,
  type ProductHistoryFilters
} from '../inventoryHistory';
import { formatCurrency } from '../utils';

interface ProductHistoryModalProps {
  item: InventoryItem;
  onClose: () => void;
}

const EVENT_OPTIONS: Array<{ value: InventoryChangeEventType | ''; label: string }> = [
  { value: '', label: 'All activity' },
  { value: 'SALE', label: 'Sales' },
  { value: 'REFUND', label: 'Refunds' },
  { value: 'RESERVE', label: 'Reservations' },
  { value: 'RESTOCK', label: 'Restocks' },
  { value: 'EDIT', label: 'Edits' },
  { value: 'ADD', label: 'Added' },
  { value: 'DELETE', label: 'Deleted' }
];

const SOURCE_OPTIONS: Array<{ value: InventoryChangeSource | ''; label: string }> = [
  { value: '', label: 'All sources' },
  { value: 'GOOGLE_SHEET', label: 'Google Sheet' },
  { value: 'PORTAL', label: 'Inventory portal' },
  { value: 'POS', label: 'POS' },
  { value: 'BACKFILL', label: 'Historical import' },
  { value: 'SYSTEM', label: 'System' }
];

const eventTone: Record<InventoryChangeEventType, string> = {
  SALE: 'border-red-500/40 bg-red-500/10 text-red-300',
  REFUND: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  RESERVE: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  RESTOCK: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
  EDIT: 'border-slate-500/40 bg-slate-500/10 text-slate-300',
  ADD: 'border-green-500/40 bg-green-500/10 text-green-300',
  DELETE: 'border-red-700/50 bg-red-950/40 text-red-300'
};

const formatDateTime = (value: string) => new Intl.DateTimeFormat('en-ZA', {
  timeZone: 'Africa/Johannesburg',
  dateStyle: 'medium',
  timeStyle: 'short'
}).format(new Date(value));

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 'Blank';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const isToday = (value: string) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  return formatter.format(new Date(value)) === formatter.format(new Date());
};

export const ProductHistoryModal: React.FC<ProductHistoryModalProps> = ({ item, onClose }) => {
  const [filters, setFilters] = useState<ProductHistoryFilters>({ days: 15, eventType: '', source: '' });
  const [events, setEvents] = useState<InventoryChangeEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void fetchProductHistory(item.id, filters)
      .then((result) => {
        if (cancelled) return;
        setEvents(result.events);
        setNextCursor(result.nextCursor);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'History could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [filters, item.id]);

  const summary = useMemo(() => getHistorySummary(events), [events]);
  const soldToday = useMemo(() => events
    .filter((event) => event.eventType === 'SALE' && isToday(event.occurredAt))
    .reduce((total, event) => total + Math.abs(event.quantityDelta), 0), [events]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchProductHistory(item.id, filters, nextCursor);
      setEvents((current) => [...current, ...result.events]);
      setNextCursor(result.nextCursor);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'More history could not be loaded.');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-start justify-center overflow-y-auto bg-black/85 p-3 backdrop-blur-sm sm:items-center sm:p-5" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="product-history-title" className="my-auto flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-gp-border bg-gp-dark shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-gp-border bg-gp-black px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gp-red">Available stock audit trail</p>
            <h2 id="product-history-title" className="mt-1 break-words font-display text-xl font-black uppercase text-white sm:text-2xl">{item.id}</h2>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-gp-text-muted">Verified portal activity and reconstructed Google Sheet history</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gp-border text-xl text-gp-text-muted transition hover:border-gp-red hover:text-white" aria-label="Close stock history">&times;</button>
        </header>

        <div className="grid gap-2 border-b border-gp-border p-4 sm:grid-cols-4 sm:p-5">
          {[
            ['Current Qty', item.quantity],
            ['Sold Today', soldToday],
            ['Net Movement', summary.netMovement > 0 ? `+${summary.netMovement}` : summary.netMovement],
            ['Current Price', formatCurrency(item.sellingPrice)]
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-gp-border bg-gp-panel p-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-gp-text-muted">{label}</p>
              <p className="mt-1 font-mono text-xl font-black text-white">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-2 border-b border-gp-border bg-gp-panel/70 p-4 sm:grid-cols-[1fr_1fr_auto] sm:px-5">
          <select value={filters.eventType} onChange={(event) => setFilters((current) => ({ ...current, eventType: event.target.value as InventoryChangeEventType | '' }))} className="h-10 rounded border border-gp-border bg-gp-input px-3 text-xs font-bold text-white focus:border-gp-red focus:outline-none" aria-label="Filter history by activity">
            {EVENT_OPTIONS.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
          </select>
          <select value={filters.source} onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value as InventoryChangeSource | '' }))} className="h-10 rounded border border-gp-border bg-gp-input px-3 text-xs font-bold text-white focus:border-gp-red focus:outline-none" aria-label="Filter history by source">
            {SOURCE_OPTIONS.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
          </select>
          <div className="grid grid-cols-5 gap-1 rounded border border-gp-border bg-gp-black p-1">
            {(['today', 5, 15, 30, 'all'] as const).map((days) => (
              <button key={days} type="button" onClick={() => setFilters((current) => ({ ...current, days }))} className={`min-w-10 rounded px-2 py-1.5 text-[10px] font-black uppercase ${filters.days === days ? 'bg-gp-red text-white' : 'text-gp-text-muted hover:text-white'}`}>{days === 'today' ? 'Today' : days}</button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {loading ? <p className="py-12 text-center text-xs font-black uppercase tracking-wider text-gp-text-muted">Loading stock history...</p> : null}
          {error ? <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm font-bold text-red-300">{error}</div> : null}
          {!loading && !error && events.length === 0 ? <p className="py-12 text-center text-sm font-bold text-gp-text-muted">No recorded changes for this period.</p> : null}
          <div className="space-y-3">
            {events.map((event) => (
              <article key={event.id} className="rounded-md border border-gp-border bg-gp-panel p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${eventTone[event.eventType]}`}>{event.eventType}</span>
                    <span className="rounded border border-gp-border bg-gp-black px-2 py-1 text-[9px] font-black uppercase tracking-wider text-gp-text-muted">{event.source.replaceAll('_', ' ')}</span>
                    {event.confidence === 'RECONSTRUCTED' ? <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[9px] font-black uppercase text-amber-300">Reconstructed</span> : null}
                  </div>
                  <time className="text-[10px] font-bold uppercase text-gp-text-muted">{formatDateTime(event.occurredAt)}</time>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  <div><p className="text-[9px] font-black uppercase text-gp-text-muted">Quantity</p><p className="mt-1 font-mono font-black text-white">{event.quantityBefore ?? '-'} &rarr; {event.quantityAfter ?? '-'}</p></div>
                  <div><p className="text-[9px] font-black uppercase text-gp-text-muted">Movement</p><p className={`mt-1 font-mono font-black ${event.quantityDelta < 0 ? 'text-red-300' : event.quantityDelta > 0 ? 'text-green-300' : 'text-white'}`}>{event.quantityDelta > 0 ? '+' : ''}{event.quantityDelta}</p></div>
                  <div><p className="text-[9px] font-black uppercase text-gp-text-muted">Cost / Selling</p><p className="mt-1 font-mono font-black text-white">{formatCurrency(event.costPriceAtChange)} / {formatCurrency(event.sellingPriceAtChange)}</p></div>
                  <div><p className="text-[9px] font-black uppercase text-gp-text-muted">Recorded By</p><p className="mt-1 break-words text-xs font-black text-white">{getHistoryActor(event)}</p><p className="mt-0.5 text-[10px] text-gp-text-muted">{getHistoryLocation(event)}</p></div>
                </div>
                {event.changedFields.length ? (
                  <div className="mt-3 border-t border-gp-border pt-3">
                    <p className="text-[9px] font-black uppercase tracking-wider text-gp-text-muted">Changed fields</p>
                    <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      {event.changedFields.slice(0, 12).map((field) => (
                        <div key={field} className="rounded border border-gp-border bg-gp-black/60 px-2 py-1.5 text-[10px]">
                          <strong className="uppercase text-gp-text-muted">{field}:</strong>{' '}
                          <span className="text-red-200">{formatValue(event.oldValues[field])}</span>{' '}
                          <span className="text-gp-text-muted">&rarr;</span>{' '}
                          <span className="text-green-200">{formatValue(event.newValues[field])}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
          {nextCursor ? <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="mt-4 h-10 w-full rounded border border-gp-border bg-gp-panel text-xs font-black uppercase text-white transition hover:border-gp-red disabled:opacity-50">{loadingMore ? 'Loading...' : 'Load older history'}</button> : null}
        </div>
      </section>
    </div>
  );
};
