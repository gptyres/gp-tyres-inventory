import React, { useMemo, useState } from 'react';
import {
  TERMINAL_STAFF_NAMES,
  TRAINING_PROGRESS_EVENT,
  TRAINING_TASKS,
  TrainingProgressStore,
  getStaffTrainingProgress,
  refreshTrainingProgressFromSupabase,
  loadTrainingProgressStore,
  notifyTrainingProgressChanged,
  resetStaffTrainingProgressInSupabase,
  saveStaffTrainingProgressToSupabase,
  saveTrainingProgressStore,
  subscribeToTrainingProgressChanges
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
    title: 'GP Tyres & Mags Simple Staff Guide',
    summary: 'This is the simple guide for daily stock, quotes, sales, customer records, supplier visuals and admin work.',
    steps: [
      'Start with GP available stock first.',
      'Use supplier stock second when GP stock is not available.',
      'A quote is only a price document. It does not remove stock.',
      'A completed sale removes stock and saves the sale.',
      'Customer quotes and invoices must not show supplier names or stock location.',
      'Training progress is saved online so all portals show the same progress.'
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
    summary: 'Start here every day. The dashboard shows the main stock numbers, quick buttons and staff training progress.',
    steps: [
      'Enter the assigned terminal ID and access code.',
      'Check total stock, low stock alerts and quick access cards.',
      'Use the sidebar for Products, Supplier Catalogues, Quote Module, Training Portal and Customer Hub.',
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
    summary: 'Search GP stock first. If GP stock is not enough, search supplier stock next.',
    steps: [
      'Search by tyre size, brand, wheel code, PCD, location or pattern.',
      'Confirm quantity and location before promising stock to a customer.',
      'Open All Supplier Stock when GP available stock does not have the item.',
      'Use supplier stock in Quick POS when quoting, but keep supplier details internal.'
    ],
    checks: [
      'Internal stock appears above supplier stock in POS.',
      'Supplier items can be added to a quote without exposing the supplier name.',
      'Zero-quantity items are not treated as available stock.'
    ]
  },
  {
    id: 'inventory-operations',
    navLabel: 'Inventory SOP',
    title: 'Inventory Accuracy And Stock Movement SOP',
    summary: 'Follow this process whenever you search, receive, reserve, sell or correct stock. Accurate stock is more important than a fast promise to a customer.',
    steps: [
      'Search the exact tyre size, wheel specification, brand or stock code before checking availability.',
      'Open the stock record and verify the description, quantity, location, selling price and whether it is GP stock or supplier stock.',
      'Physically count the item before confirming availability or moving it from the shelf.',
      'Use a reservation when stock must be held; do not rely on a verbal promise or a note outside the portal.',
      'Complete a sale only after payment is confirmed. A quote does not deduct stock.',
      'When stock arrives, confirm the delivery against the supplier paperwork before an authorised user receives or edits the inventory record.',
      'Do not make a manual quantity correction to hide a variance. Escalate damaged, missing or incorrect stock to an admin and record the reason.'
    ],
    checks: [
      'The physical count, portal quantity and stock location agree before stock is promised.',
      'Reservations and completed sales can be found again in history.',
      'Supplier stock is never presented to a customer as GP available stock.',
      'Any variance has an authorised explanation before the shift handover.'
    ]
  },
  {
    id: 'sales',
    navLabel: 'Quotes & Sales',
    title: 'Quotes, Sales And Invoice Rules',
    summary: 'Quick POS is where staff create quotes, invoices and sales.',
    steps: [
      'Open Quick POS with the red plus button.',
      'Capture full name, contact detail and vehicle details where applicable.',
      'Add internal stock, supplier stock, services or manual lines.',
      'Generate Quote to create a PDF without changing stock.',
      'Complete Sale only when the customer has paid and stock must be deducted.',
      'Use Download PDF when the customer needs a saved copy.'
    ],
    checks: [
      'Fitment, balancing, wheel alignment and coilover installation can be added.',
      'Line totals and discounts are checked before generating documents.',
      'Sale processing deducts stock and logs the order.'
    ]
  },
  {
    id: 'quote-module',
    navLabel: 'Quote Module',
    title: 'Quote Module And Pricing Processor',
    summary: 'Use the Quote Module when supplier prices arrive as messy pasted text and need to become clean quote lines.',
    steps: [
      'Open Quote Module from the app navigation.',
      'Paste the supplier price text into the processor.',
      'Check the tyre size, brand, pattern, stock and price that the app finds.',
      'Edit any line that looks wrong before using it.',
      'Push selected lines into Quick POS to generate a quote PDF.'
    ],
    checks: [
      'The tyre size and pattern are correct.',
      'The selling price is correct before pushing to POS.',
      'Only customer-ready lines are sent into the quote.'
    ]
  },
  {
    id: 'customer-hub',
    navLabel: 'Customer Hub',
    title: 'Customer Hub And Saved Documents',
    summary: 'Customer Hub keeps customer details, uploaded customer lists, quotes and invoices in one place.',
    steps: [
      'Search for an existing customer before creating a new one.',
      'Add the customer name, phone or email and vehicle details.',
      'Upload customer CSV or Excel files when importing old customer data.',
      'Open a customer to view saved quotes and invoices.',
      'Reprint, download or edit saved documents when needed.'
    ],
    checks: [
      'Full name and contact detail are captured.',
      'Vehicle details are added when useful.',
      'Saved quotes and invoices can be found again later.'
    ]
  },
  {
    id: 'visuals',
    navLabel: 'Visuals',
    title: 'Supplier Tyre And Wheel Visuals',
    summary: 'Visuals help staff show customers the right tyre tread or wheel design.',
    steps: [
      'Turn on Enable Visuals in supplier stock or wheel catalogues.',
      'If an image is available, the card will show it automatically.',
      'If an image is missing, use Load Visual or upload the correct image.',
      'Use Replace when an image is wrong.',
      'When replacing a tyre image, confirm the brand and tread pattern so the same tyre updates everywhere.'
    ],
    checks: [
      'The image matches the tyre brand and tread pattern.',
      'The image is not a logo, advert or wrong product.',
      'The same pattern shows the replacement image across that supplier catalogue.'
    ]
  },
  {
    id: 'wheel-catalog',
    navLabel: 'Wheel Catalogue',
    title: 'Wheel Catalogue And Customer Visuals',
    summary: 'Use the wheel catalogue to find real wheel photos by size, PCD, supplier and design name.',
    steps: [
      'Open Wheel Catalog from the sidebar.',
      'Search by size, PCD, wheel name or supplier.',
      'Turn on visuals to show the correct wheel image.',
      'Use the image when helping customers compare designs.',
      'Do not duplicate images when the same wheel appears in different sizes.'
    ],
    checks: [
      'The wheel design name matches the image.',
      'The PCD and size are checked before quoting.',
      'Missing images are reported or uploaded for later use.'
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
    id: 'courier-logistics',
    navLabel: 'Courier SOP',
    title: 'Courier Logistics And Dispatch SOP',
    summary: 'Use the Courier Logistics Assistant to produce a clear courier declaration for wheels, tyres and complete wheel-and-tyre sets. The final packed measurement always wins over an estimate.',
    steps: [
      'Confirm the customer order, contact number, delivery address and collection or dispatch instruction before booking a courier.',
      'Select the correct parcel type: rims only, tyres only, or rims and tyres together.',
      'Enter the confirmed wheel size, tyre size and number of parcels in Courier Logistics Assistant. Read a pasted customer message only as a starting point, then verify it.',
      'Use the generated dimensions and chargeable-weight estimate to prepare the courier portal declaration.',
      'After packing, count every parcel and replace the estimate with the measured weight where a scale is available.',
      'Copy the final declaration into the courier portal, save the estimate in the portal, then record the courier reference or tracking number on the customer order.',
      'Before handover, verify the recipient address, number of pieces, packaging condition and tracking reference with a second staff member where possible.'
    ],
    checks: [
      'Courier booking shows the correct item type, quantity and address.',
      'Measured package details are used when they differ from the portal estimate.',
      'The customer can be given the correct tracking reference after dispatch.',
      'No stock is released from the workshop or storeroom without an order reference.'
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
    summary: 'Tick each item as the staff member completes it. Progress is saved online and syncs across all portals.',
    steps: [
      'Work through the checklist in order during onboarding.',
      'Use the dashboard to see each staff member progress at a glance.',
      'Reset only the current staff member if training needs to be repeated.',
      'If the internet is slow, the app saves locally first and syncs again when Supabase responds.'
    ],
    checks: [
      'All training tasks are completed.',
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
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'synced' | 'local' | 'error'>('local');
  const [syncMessage, setSyncMessage] = useState('Saved on this device until Supabase syncs.');

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

    setSyncStatus('syncing');
    setSyncMessage('Saving progress online...');
    saveStaffTrainingProgressToSupabase(staffName, nextStaffTasks, currentUser)
      .then(() => {
        setSyncStatus('synced');
        setSyncMessage('Progress synced across all portals.');
      })
      .catch((error) => {
        console.error('Training progress sync failed', error);
        setSyncStatus('error');
        setSyncMessage('Saved here, but online sync failed. It will try again when reopened.');
      });
  };

  const handleResetProgress = () => {
    const confirmed = window.confirm(`Reset training progress for ${staffName}?`);
    if (!confirmed) return;

    const nextStore = { ...progressStore };
    delete nextStore[staffName];
    updateProgressStore(nextStore);

    setSyncStatus('syncing');
    setSyncMessage('Resetting online progress...');
    resetStaffTrainingProgressInSupabase(staffName)
      .then(() => {
        setSyncStatus('synced');
        setSyncMessage('Progress reset and synced across all portals.');
      })
      .catch((error) => {
        console.error('Training progress reset sync failed', error);
        setSyncStatus('error');
        setSyncMessage('Reset locally, but online reset failed.');
      });
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

  React.useEffect(() => {
    let isMounted = true;

    const refreshRemoteProgress = async () => {
      setSyncStatus('syncing');
      setSyncMessage('Loading synced training progress...');

      try {
        const remoteStore = await refreshTrainingProgressFromSupabase();
        if (!isMounted) return;
        if (remoteStore) {
          setProgressStore(remoteStore);
          setSyncStatus('synced');
          setSyncMessage('Progress synced across all portals.');
        } else {
          setSyncStatus('local');
          setSyncMessage('Supabase is not configured, using local progress only.');
        }
      } catch (error) {
        console.error('Training progress remote load failed', error);
        if (!isMounted) return;
        setSyncStatus('error');
        setSyncMessage('Using local progress. Online sync could not load.');
      }
    };

    void refreshRemoteProgress();

    const unsubscribe = subscribeToTrainingProgressChanges(
      (remoteStore) => {
        if (!isMounted) return;
        setProgressStore(remoteStore);
        setSyncStatus('synced');
        setSyncMessage('Progress synced from another portal.');
      },
      (error) => {
        console.error('Training progress realtime sync failed', error);
        if (!isMounted) return;
        setSyncStatus('error');
        setSyncMessage('Live sync paused. Local progress is still saved.');
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
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
              <div className={`mt-3 rounded border px-3 py-2 text-xs font-bold ${
                syncStatus === 'synced'
                  ? 'border-green-500/30 bg-green-500/10 text-green-300'
                  : syncStatus === 'syncing'
                    ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                    : syncStatus === 'error'
                      ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
                      : 'border-gp-border bg-gp-input text-gp-text-muted'
              }`}>
                {syncMessage}
              </div>
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
