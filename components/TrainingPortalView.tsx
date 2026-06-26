import React, { useMemo, useState } from 'react';
import {
  TERMINAL_STAFF_NAMES,
  TRAINING_PROGRESS_EVENT,
  TRAINING_TASKS,
  TrainingProgressStore,
  getStaffTrainingProgress,
  loadTrainingProgressStore,
  notifyTrainingProgressChanged,
  saveTrainingProgressStore
} from '../trainingProgress';

interface TrainingPortalViewProps {
  currentUser: string;
}

interface TrainingSection {
  id: string;
  navLabel: string;
  title: string;
  summary: string;
  steps: string[];
  checks: string[];
}

const trainingSections: TrainingSection[] = [
  {
    id: 'intro',
    navLabel: 'Overview',
    title: 'GP Tyres & Mags SOP',
    summary: 'Use this portal as the live operating guide for daily inventory, quote, sales and admin workflows.',
    steps: [
      'Use GP internal available stock as the first source for customers.',
      'Use supplier stock as secondary stock when GP stock is not available.',
      'Quotes do not move stock. Completed sales and refunds must create a stock movement.',
      'Customer-facing quote and invoice lines must not mention supplier names.',
      'Admin-only controls are reserved for stock corrections, reporting and system logs.'
    ],
    checks: [
      'Confirm the logged-in terminal before taking action.',
      'Verify stock quantity, size and price before quoting.',
      'Capture customer details before generating a quote or invoice.'
    ]
  },
  {
    id: 'login',
    navLabel: 'Login & Dashboard',
    title: 'Login And Dashboard Flow',
    summary: 'Staff should start on the dashboard, confirm system status, then move into stock, sales or training from the side menu.',
    steps: [
      'Enter the assigned terminal ID and access code.',
      'Check total stock, low stock alerts and quick access cards.',
      'Use the sidebar for Products, Supplier Catalogues, Orders and Training Portal.',
      'Admin users can unlock restricted controls only when required.'
    ],
    checks: [
      'Current user name is shown correctly.',
      'Dashboard stock totals look reasonable before trading starts.',
      'Training progress is reviewed during onboarding and refreshers.'
    ]
  },
  {
    id: 'stock',
    navLabel: 'Stock Search',
    title: 'Searching Internal And Supplier Stock',
    summary: 'Search available stock first, then supplier stock. Keep supplier source details internal to staff.',
    steps: [
      'Search by tyre size, brand, wheel code, PCD, location or pattern.',
      'Confirm quantity and location before promising stock to a customer.',
      'Open All Supplier Stock when GP available stock does not have the item.',
      'Use the Quick POS supplier source for quote-only lines or supplier-assisted sales.'
    ],
    checks: [
      'Internal stock appears above supplier stock in POS.',
      'Supplier items can be added to a quote without exposing the supplier name.',
      'Zero-quantity items are not treated as available stock.'
    ]
  },
  {
    id: 'sales',
    navLabel: 'Quotes & Sales',
    title: 'Quotes, Sales And Invoice Rules',
    summary: 'The Quick POS is the main staff flow for building quotes, adding services and completing sales.',
    steps: [
      'Open Quick POS with the red plus button.',
      'Capture full name, contact detail and vehicle details where applicable.',
      'Add internal stock, supplier stock, services or manual lines.',
      'Generate Quote to create a PDF without changing stock.',
      'Complete Sale only when the customer has paid and stock should move.'
    ],
    checks: [
      'Fitment, balancing, wheel alignment and coilover installation can be added.',
      'Line totals and discounts are checked before generating documents.',
      'Sale processing deducts stock and logs the order.'
    ]
  },
  {
    id: 'orders',
    navLabel: 'Orders',
    title: 'Reservations, Backorders And History',
    summary: 'Use the order tools to keep promised stock, supplier requests and sales history traceable.',
    steps: [
      'Create a reservation when GP stock must be held for a customer.',
      'Create a backorder when stock must be sourced from a supplier.',
      'Review order history before processing refunds or corrections.',
      'Use reference numbers when following up on customer paperwork.'
    ],
    checks: [
      'Customer name and contact detail are captured for reservations.',
      'Expected dates are added to backorders.',
      'Refunds and corrections are handled by an authorised user.'
    ]
  },
  {
    id: 'admin-inventory',
    navLabel: 'Admin Stock',
    title: 'Admin Inventory Controls',
    summary: 'Admin controls should protect stock accuracy across terminals and devices.',
    steps: [
      'Add new stock only when item details, cost and selling price are confirmed.',
      'Edit stock records when size, brand, location or pricing needs correction.',
      'Use receiving controls when incoming stock arrives.',
      'Review sync status before making large stock updates.'
    ],
    checks: [
      'Cost price visibility remains admin-only.',
      'Stock corrections are deliberate and traceable.',
      'Supplier catalogues stay read-only unless imported through the supplier workflow.'
    ]
  },
  {
    id: 'admin-financials',
    navLabel: 'Admin Sales',
    title: 'Admin Sales And Financial Controls',
    summary: 'Admin users should keep sales history, access logs and cash-up actions clean.',
    steps: [
      'Use the Sales screen to review completed transactions.',
      'Process refunds from the original sale where possible.',
      'Use system logs to audit terminal access.',
      'Complete end-of-shift reconciliation before handover.'
    ],
    checks: [
      'Admin mode is used only for restricted tasks.',
      'Cash-up is completed at the end of each shift.',
      'Unusual stock or sales movement is investigated before close.'
    ]
  },
  {
    id: 'checklist',
    navLabel: 'Checklist',
    title: 'Training Completion Checklist',
    summary: 'Tick each item as the staff member completes it. Progress is saved on this browser.',
    steps: [
      'Work through the checklist in order during onboarding.',
      'Use the dashboard to see each staff member progress at a glance.',
      'Reset only the current staff member if training needs to be repeated.'
    ],
    checks: [
      'All ten training tasks are completed.',
      'Staff member can quote, sell, reserve and cash up without guidance.',
      'Admin users understand restricted controls before receiving access.'
    ]
  }
];

const ProgressBar: React.FC<{ percentage: number; className?: string }> = ({ percentage, className = '' }) => (
  <div className={`h-2 overflow-hidden rounded-full bg-gp-input border border-gp-border ${className}`}>
    <div
      className="h-full rounded-full bg-gp-red transition-all duration-300"
      style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
    />
  </div>
);

export const TrainingPortalView: React.FC<TrainingPortalViewProps> = ({ currentUser }) => {
  const [activeSectionId, setActiveSectionId] = useState('intro');
  const [searchQuery, setSearchQuery] = useState('');
  const [progressStore, setProgressStore] = useState<TrainingProgressStore>(() => loadTrainingProgressStore());

  const staffName = TERMINAL_STAFF_NAMES[currentUser] || currentUser || 'Staff';
  const currentProgress = useMemo(
    () => getStaffTrainingProgress(staffName, progressStore),
    [staffName, progressStore]
  );
  const taskState = progressStore[staffName] || {};
  const activeSection = trainingSections.find((section) => section.id === activeSectionId) || trainingSections[0];
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const displayedSections = normalizedSearch
    ? trainingSections.filter((section) => {
        const searchableText = [
          section.navLabel,
          section.title,
          section.summary,
          ...section.steps,
          ...section.checks
        ].join(' ').toLowerCase();
        return searchableText.includes(normalizedSearch);
      })
    : [activeSection];

  const updateProgressStore = (nextStore: TrainingProgressStore) => {
    saveTrainingProgressStore(nextStore);
    setProgressStore(nextStore);
    notifyTrainingProgressChanged();
  };

  const handleTaskToggle = (taskId: string) => {
    const nextStaffTasks = {
      ...(progressStore[staffName] || {}),
      [taskId]: !taskState[taskId]
    };

    updateProgressStore({
      ...progressStore,
      [staffName]: nextStaffTasks
    });
  };

  const handleResetProgress = () => {
    const confirmed = window.confirm(`Reset training progress for ${staffName}?`);
    if (!confirmed) return;

    const nextStore = { ...progressStore };
    delete nextStore[staffName];
    updateProgressStore(nextStore);
  };

  React.useEffect(() => {
    const refreshProgress = () => setProgressStore(loadTrainingProgressStore());
    window.addEventListener('storage', refreshProgress);
    window.addEventListener(TRAINING_PROGRESS_EVENT, refreshProgress);

    return () => {
      window.removeEventListener('storage', refreshProgress);
      window.removeEventListener(TRAINING_PROGRESS_EVENT, refreshProgress);
    };
  }, []);

  return (
    <div className="min-h-full bg-gp-black p-4 md:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 xl:flex-row">
        <aside className="xl:sticky xl:top-20 xl:h-[calc(100vh-6rem)] xl:w-80 xl:shrink-0">
          <div className="flex h-full flex-col rounded-xl border border-gp-border bg-gp-panel shadow-lg">
            <div className="border-b border-gp-border p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-gp-red">Training Portal</p>
              <h1 className="mt-2 font-display text-2xl font-black uppercase text-gp-text-main">Staff SOP</h1>
              <p className="mt-2 text-sm leading-relaxed text-gp-text-muted">
                Daily operating guide, onboarding checklist and staff progress tracker.
              </p>
            </div>

            <div className="border-b border-gp-border p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gp-text-muted">Current Staff</p>
                  <p className="mt-1 text-lg font-black text-gp-text-main">{staffName}</p>
                </div>
                <div className="rounded-lg border border-gp-red/40 bg-gp-red/10 px-3 py-2 text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gp-text-muted">Progress</p>
                  <p className="text-2xl font-black text-gp-red">{currentProgress.percentage}%</p>
                </div>
              </div>
              <ProgressBar percentage={currentProgress.percentage} className="mt-4" />
              <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gp-text-muted">
                {currentProgress.completed} of {currentProgress.total} tasks complete
              </p>
            </div>

            <div className="border-b border-gp-border p-4">
              <label htmlFor="training-search" className="sr-only">Search training content</label>
              <div className="relative">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gp-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  id="training-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search SOP content"
                  className="w-full rounded-lg border border-gp-border bg-gp-input py-2 pl-9 pr-3 text-sm text-gp-text-main placeholder:text-gp-text-muted focus:border-gp-red focus:outline-none focus:ring-1 focus:ring-gp-red"
                />
              </div>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Training sections">
              {trainingSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => {
                    setActiveSectionId(section.id);
                    setSearchQuery('');
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-bold transition-colors ${
                    activeSectionId === section.id && !normalizedSearch
                      ? 'bg-gp-red text-white'
                      : 'text-gp-text-muted hover:bg-gp-border hover:text-gp-text-main'
                  }`}
                >
                  <span>{section.navLabel}</span>
                  <svg className="h-4 w-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </nav>
          </div>
        </aside>

        <section className="min-w-0 flex-1 space-y-5">
          <div className="rounded-xl border border-gp-border bg-gp-panel p-5 shadow-lg">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gp-red">Operational Training</p>
                <h2 className="mt-2 font-display text-2xl font-black uppercase text-gp-text-main md:text-3xl">
                  {normalizedSearch ? 'Search Results' : activeSection.title}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gp-text-muted">
                  {normalizedSearch
                    ? `Showing SOP sections that match "${searchQuery.trim()}".`
                    : activeSection.summary}
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetProgress}
                className="rounded-lg border border-gp-border bg-gp-input px-4 py-2 text-xs font-black uppercase tracking-wider text-gp-text-muted transition-colors hover:border-gp-red hover:text-gp-text-main"
              >
                Reset My Progress
              </button>
            </div>
          </div>

          {displayedSections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gp-border bg-gp-panel p-8 text-center">
              <p className="font-bold text-gp-text-main">No matching training content found.</p>
              <p className="mt-2 text-sm text-gp-text-muted">Try searching for quote, stock, supplier, reservation or admin.</p>
            </div>
          ) : (
            displayedSections.map((section) => (
              <article key={section.id} className="rounded-xl border border-gp-border bg-gp-panel shadow-lg">
                <div className="border-b border-gp-border p-5">
                  <p className="text-xs font-bold uppercase tracking-widest text-gp-text-muted">{section.navLabel}</p>
                  <h3 className="mt-2 font-display text-xl font-black uppercase text-gp-text-main">{section.title}</h3>
                  <p className="mt-2 max-w-4xl text-sm leading-relaxed text-gp-text-muted">{section.summary}</p>
                </div>

                <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-gp-red">Standard Steps</h4>
                    <div className="mt-3 divide-y divide-gp-border overflow-hidden rounded-lg border border-gp-border bg-gp-black">
                      {section.steps.map((step, index) => (
                        <div key={step} className="flex gap-3 p-4">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-gp-input text-xs font-black text-gp-red">
                            {index + 1}
                          </span>
                          <p className="text-sm leading-relaxed text-gp-text-main">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-gp-red">Before Moving On</h4>
                    <div className="mt-3 space-y-3 rounded-lg border border-gp-border bg-gp-black p-4">
                      {section.checks.map((check) => (
                        <div key={check} className="flex gap-3 text-sm text-gp-text-muted">
                          <svg className="mt-0.5 h-4 w-4 shrink-0 text-gp-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{check}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}

          <section className="rounded-xl border border-gp-border bg-gp-panel shadow-lg">
            <div className="border-b border-gp-border p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-gp-red">Checklist</p>
              <h3 className="mt-2 font-display text-xl font-black uppercase text-gp-text-main">Training Tasks</h3>
              <p className="mt-2 text-sm text-gp-text-muted">
                Progress is saved for {staffName}. Tick only tasks that have been completed in the live app.
              </p>
            </div>

            <div className="divide-y divide-gp-border">
              {TRAINING_TASKS.map((task) => {
                const isComplete = Boolean(taskState[task.id]);

                return (
                  <label
                    key={task.id}
                    className="flex cursor-pointer items-start gap-4 p-4 transition-colors hover:bg-gp-input/60"
                  >
                    <input
                      type="checkbox"
                      checked={isComplete}
                      onChange={() => handleTaskToggle(task.id)}
                      className="mt-1 h-5 w-5 rounded border-gp-border bg-gp-black text-gp-red focus:ring-gp-red"
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-black ${isComplete ? 'text-gp-red' : 'text-gp-text-main'}`}>
                        {task.title}
                      </span>
                      <span className="mt-1 block text-sm leading-relaxed text-gp-text-muted">{task.detail}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        </section>
      </div>
    </div>
  );
};
