import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRight, ArrowUpRight, Search, Package, ReceiptText, Truck, Wrench, CircleAlert } from 'lucide-react';
import { AppView, Backorder, InventoryItem, InventoryStats } from '../types';
import { stockCounts, overdueBackorders, WorkspaceNavigate } from '../stockWorkspace';
import { StatsDashboard } from './StatsDashboard';
import { StockMovementDashboard } from './StockMovementDashboard';
import { useWorkshopOverview } from './useWorkshopOverview';
import { STAFF_NAMES } from '../config';
import {
  TERMINAL_STAFF_NAMES, TRAINING_PROGRESS_EVENT, TrainingProgressSummary,
  refreshTrainingProgressFromSupabase, getAllStaffTrainingProgress,
  loadTrainingProgressStore, subscribeToTrainingProgressChanges
} from '../trainingProgress';

interface DashboardViewProps {
  currentUser: string;
  stats: InventoryStats;
  items: InventoryItem[];
  backorders: Backorder[];
  isAdmin: boolean;
  onNavigate: WorkspaceNavigate;
  onOpenPOS: () => void;
  onSearchSuppliers: (query: string) => void;
  onPortalSelect: (name: string, url: string, view: AppView) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser, stats, items, backorders, isAdmin, onNavigate, onOpenPOS, onSearchSuppliers, onPortalSelect
}) => {
  const [now, setNow] = useState(() => new Date());
  const [query, setQuery] = useState('');
  const [trainingProgress, setTrainingProgress] = useState<TrainingProgressSummary[]>(() =>
    getAllStaffTrainingProgress(STAFF_NAMES, loadTrainingProgressStore()));
  const workshop = useWorkshopOverview();
  const counts = useMemo(() => stockCounts(items), [items]);
  const lateOrders = useMemo(() => overdueBackorders(backorders, now), [backorders, now]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => setTrainingProgress(getAllStaffTrainingProgress(STAFF_NAMES, loadTrainingProgressStore()));
    refresh();
    void refreshTrainingProgressFromSupabase().then(store => {
      if (active && store) setTrainingProgress(getAllStaffTrainingProgress(STAFF_NAMES, store));
    }).catch(error => console.error('Dashboard training progress sync failed', error));
    window.addEventListener('storage', refresh);
    window.addEventListener(TRAINING_PROGRESS_EVENT, refresh);
    const unsubscribe = subscribeToTrainingProgressChanges(store => {
      if (active) setTrainingProgress(getAllStaffTrainingProgress(STAFF_NAMES, store));
    }, error => console.error('Dashboard training progress realtime failed', error));
    return () => {
      active = false;
      window.removeEventListener('storage', refresh);
      window.removeEventListener(TRAINING_PROGRESS_EVENT, refresh);
      unsubscribe();
    };
  }, []);

  const displayName = TERMINAL_STAFF_NAMES[currentUser] || currentUser;
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', hour: 'numeric', hourCycle: 'h23' }).format(now));
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const summary = workshop.board?.summary;
  const attention = [
    { label: 'Out of stock', detail: 'Products with no units available', count: counts.OUT_OF_STOCK, icon: Package,
      action: () => onNavigate('INVENTORY', 'ALL', { stockFilter: 'OUT_OF_STOCK' }) },
    { label: 'Low stock', detail: 'Products with 1–3 units remaining', count: counts.LOW_STOCK, icon: CircleAlert,
      action: () => onNavigate('INVENTORY', 'ALL', { stockFilter: 'LOW_STOCK' }) },
    { label: 'Late deliveries', detail: lateOrders.length ? `Oldest expected ${lateOrders[0].expectedDate}` : 'Pending deliveries past their expected date', count: lateOrders.length, icon: Truck,
      action: () => onNavigate('BACKORDERS', 'ALL', { query: '' }) },
    { label: 'Overdue workshop jobs', detail: workshop.error ? (workshop.board ? 'Last known activity · refresh failed' : 'Activity unavailable') : 'Review jobs taking longer than expected', count: summary?.overdue, icon: Wrench,
      action: () => onNavigate('WORKSHOP_TRACKER') }
  ];

  return <div className="workspace-dashboard">
    <header className="workspace-heading">
      <div>
        <p className="workspace-eyebrow">GP TYRES & MAGS <span aria-hidden="true">/</span> DAILY OPERATIONS</p>
        <h1>{greeting}, <span>{displayName}.</span></h1>
        <p className="text-sm text-gp-text-muted mt-2">Your stock, your counter, your next move.</p>
      </div>
      <time className="workspace-date" dateTime={now.toISOString()}>
        {new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'long', day: 'numeric', month: 'long' }).format(now)}
      </time>
    </header>

    <section className="workspace-counter" aria-labelledby="counter-title">
      <div className="workspace-counter-heading"><div><p className="workspace-eyebrow">AT THE COUNTER</p>
        <h2 id="counter-title">Find the right stock. Keep things moving.</h2></div><Package size={28} aria-hidden="true" /></div>
      <form className="workspace-search" onSubmit={event => { event.preventDefault(); onNavigate('INVENTORY', 'ALL', { query: query.trim(), stockFilter: 'ALL' }); }}>
        <Search size={20} aria-hidden="true" />
        <input aria-label="Find stock from dashboard" placeholder="Try 205 55 16, a brand, or a wheel size…" value={query} onChange={event => setQuery(event.target.value)} />
        <button className="workspace-primary" type="submit">Find stock <ArrowRight size={16} aria-hidden="true" /></button>
      </form>
      <div className="workspace-counter-actions">
        <button type="button" onClick={onOpenPOS}><ReceiptText size={16} aria-hidden="true" /> Open POS</button>
        <button type="button" onClick={() => onNavigate('QUOTE_MODULE')}><ArrowUpRight size={16} aria-hidden="true" /> Build a quote</button>
        <button type="button" onClick={() => onSearchSuppliers(query.trim())}><Truck size={16} aria-hidden="true" /> Search suppliers</button>
        <span className="workspace-key-hint"><kbd>Ctrl / ⌘ K</kbd> to search</span>
      </div>
    </section>

    <StatsDashboard stats={stats} visible={isAdmin} compact
      onStockClick={() => onNavigate('INVENTORY', 'ALL')}
      onLowStockClick={() => onNavigate('INVENTORY', 'ALL', { stockFilter: 'LOW_STOCK' })} />

    <div className="workspace-operation-grid">
      <section className="workspace-panel" aria-labelledby="attention-title">
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">NEXT UP</p><h2 id="attention-title">Needs attention</h2></div><CircleAlert size={20} aria-hidden="true" /></div>
        <div className="workspace-attention-list">
          {attention.map(entry => <button key={entry.label} type="button" className="workspace-attention" onClick={entry.action}>
            <entry.icon size={18} aria-hidden="true" />
            <span className="min-w-0"><strong>{entry.label}</strong><small>{entry.detail}</small></span>
            <span className={`workspace-count ${entry.count ? 'has-attention' : ''}`}>{entry.count ?? '—'}</span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </button>)}
        </div>
        <p className="workspace-panel-footnote">Stock alerts reflect owned inventory. Supplier availability is shown separately.</p>
      </section>

      <section className="workspace-panel" aria-labelledby="workshop-title">
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">ON THE FLOOR</p><h2 id="workshop-title">Workshop activity</h2></div>
          <button className="workspace-icon-button" type="button" aria-label="Open workshop tracker" onClick={() => onNavigate('WORKSHOP_TRACKER')}><ArrowUpRight size={20} /></button></div>
        <div className="workspace-workshop-metrics" aria-busy={workshop.loading}>
          {[
            { label: 'Jobs on floor', value: summary?.active }, { label: 'Ready for collection', value: summary?.ready },
            { label: 'Jobs today', value: summary?.today },
            { label: 'Technicians unavailable', value: workshop.board ? (workshop.board.breaks || []).filter(entry => !entry.ended_at).length : undefined }
          ].map(metric => <div key={metric.label}><span>{metric.label}</span><strong>{metric.value ?? '—'}</strong></div>)}
        </div>
        <div className={`workspace-refresh ${workshop.error ? 'workspace-refresh-error' : ''}`} role="status">
          <span>{workshop.error ? workshop.error : workshop.loading ? 'Refreshing activity…' : 'Refreshes every minute'}
            {workshop.updatedAt && <small>Last received {new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit' }).format(new Date(workshop.updatedAt))}</small>}
          </span>
          <button type="button" className="workspace-text-button" disabled={workshop.loading} onClick={workshop.retry}
            aria-label={workshop.error ? 'Retry workshop' : 'Refresh workshop'}>
            {workshop.loading ? 'Refreshing…' : workshop.error ? 'Retry workshop' : 'Refresh'}
          </button>
        </div>
      </section>
    </div>

    <StockMovementDashboard currentUser={currentUser} isAdmin={isAdmin} />

    <section className="workspace-panel" aria-labelledby="training-title">
      <div className="workspace-section-heading"><div><p className="workspace-eyebrow">THE TEAM</p><h2 id="training-title">Training progress</h2></div>
        <button type="button" className="workspace-text-button" onClick={() => onNavigate('TRAINING_PORTAL')}>Open training <ArrowUpRight size={15} /></button></div>
      <div className="workspace-training-grid">{trainingProgress.map(progress => <div key={progress.staffName}>
        <div className="flex justify-between gap-3 text-sm"><strong>{progress.staffName}</strong><span className="text-gp-text-muted">{progress.percentage}%</span></div>
        <progress aria-label={`${progress.staffName} training completion`} max={progress.total || 1} value={progress.completed} />
        <p className="text-xs text-gp-text-muted">{progress.completed} of {progress.total} tasks</p>
      </div>)}</div>
    </section>

    <nav className="workspace-links" aria-label="More workspace tools">
      <button onClick={() => onNavigate('CUSTOMER_HUB')}>Customers <ArrowUpRight size={14} /></button>
      <button onClick={() => onNavigate('ORDERS')}>Sales & orders <ArrowUpRight size={14} /></button>
      <button onClick={() => onNavigate('BACKORDERS')}>Incoming stock <ArrowUpRight size={14} /></button>
      <button onClick={() => onPortalSelect('Tyre Size Comparison', 'https://tiresize.com/comparison/', 'TOOLS_PORTAL')}>Tyre tools <ArrowUpRight size={14} /></button>
      <button onClick={() => onPortalSelect('The Courier Guy', 'https://portal.thecourierguy.co.za/', 'SHIPPING_PORTAL')}>Shipping & payment <ArrowUpRight size={14} /></button>
    </nav>
  </div>;
};
