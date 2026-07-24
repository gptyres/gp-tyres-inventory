import React, { useEffect, useMemo, useRef, useState } from 'react';
import gpLogo from '../assets/gp-tyres-logo-transparent.png';
import {
  createWorkshopJob,
  deleteWorkshopJob,
  fetchWorkshopBoard,
  PAID_BY_OPTIONS,
  endWorkshopBreak,
  TECHNICIANS,
  startWorkshopBreak,
  WORKSHOP_AGENTS,
  updateWorkshopJob,
  WorkshopJob,
  WorkshopJobInput,
  WorkshopJobStatus,
  WorkshopPriority,
  WorkshopSummary,
  WorkshopTechnicianBreak,
  WorkshopBreakType
} from '../workshopTracker';
import { generateWorkshopReport, getWorkshopReportRange, WorkshopReportAction, WorkshopReportPeriod } from '../workshopReport';

interface WorkshopTrackerViewProps {
  currentUser: string;
  isAdmin: boolean;
}

const LANES: Array<{ status: WorkshopJobStatus; label: string; accent: string; previous?: WorkshopJobStatus; next?: WorkshopJobStatus }> = [
  { status: 'CHECK_IN', label: 'Check-in', accent: 'border-blue-500', next: 'IN_PROGRESS' },
  { status: 'IN_PROGRESS', label: 'In progress', accent: 'border-amber-500', previous: 'CHECK_IN', next: 'READY' },
  { status: 'READY', label: 'Ready', accent: 'border-emerald-500', previous: 'IN_PROGRESS', next: 'COLLECTED' }
];

const statusLabel = (status: WorkshopJobStatus) => status.replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const emptyForm = (): WorkshopJobInput => ({
  customer_name: '', customer_phone: '', vehicle_details: '', registration: '', service_type: 'Tyre fitment',
  technician: '', technicians: [], agent: '', job_date: new Date().toISOString().slice(0, 10), ticket_number: '', paid_by: '', tyre_quantity: 4, wheel_fitment: false, start_in_progress: false, notes: ''
});

const dateTimeForInput = (value: string | null) => value ? new Date(value).toISOString().slice(0, 16) : '';
const localDateKey = (value = new Date()) => {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
};
const timeLabel = (value: string | null) => value ? new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(value)) : 'Unscheduled';
const jobDateLabel = (value: string) => new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
const elapsedTimeLabel = (startedAt: string | null, completedAt: string | null, now: number) => {
  if (!startedAt) return 'Not started';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : now;
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};
const isTimerRunning = (job: WorkshopJob) => Boolean(job.started_at && !job.completed_at && job.status !== 'CANCELLED');
const technicianList = (job: WorkshopJob) => job.technicians?.length ? job.technicians : job.technician ? [job.technician] : [];
const breakLabel = (type: WorkshopBreakType) => ({ TEA_1: 'Tea 1', TEA_2: 'Tea 2', LUNCH: 'Lunch', TYRE_COLLECTION: 'Tyre collection', MISC_TASK: 'Misc task', ABSENT: 'Absent' }[type]);
const workflowPrevious = (status: WorkshopJobStatus): WorkshopJobStatus | undefined => ({ IN_PROGRESS: 'CHECK_IN', READY: 'IN_PROGRESS', COLLECTED: 'READY' }[status] as WorkshopJobStatus | undefined);
const workflowNext = (status: WorkshopJobStatus): WorkshopJobStatus | undefined => ({ CHECK_IN: 'IN_PROGRESS', IN_PROGRESS: 'READY', READY: 'COLLECTED' }[status] as WorkshopJobStatus | undefined);

const Metric: React.FC<{ label: string; value: number; tone?: string }> = ({ label, value, tone = 'text-white' }) => (
  <div className="min-w-[108px] rounded-xl border border-gp-border bg-gp-panel px-3 py-2.5 shadow-sm">
    <p className="text-[9px] font-black uppercase tracking-[0.15em] text-gp-text-muted">{label}</p>
    <p className={`mt-1 text-xl font-black tabular-nums ${tone}`}>{value}</p>
  </div>
);

export const WorkshopTrackerView: React.FC<WorkshopTrackerViewProps> = ({ currentUser, isAdmin }) => {
  const [jobs, setJobs] = useState<WorkshopJob[]>([]);
  const [summary, setSummary] = useState<WorkshopSummary>({ active: 0, today: 0, ready: 0, overdue: 0 });
  const [breaks, setBreaks] = useState<WorkshopTechnicianBreak[]>([]);
  const [agents, setAgents] = useState<string[]>(WORKSHOP_AGENTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [showCollected, setShowCollected] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [form, setForm] = useState<WorkshopJobInput>(emptyForm);
  const [selected, setSelected] = useState<WorkshopJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<WorkshopJobStatus | null>(null);
  const touchDragTimer = useRef<number | null>(null);

  const loadBoard = async () => {
    setLoading(true);
    setError('');
    try {
      const board = await fetchWorkshopBoard();
      setJobs(board.jobs);
      setSummary(board.summary);
      setBreaks(board.breaks || []);
      setAgents(board.agents?.length ? board.agents : WORKSHOP_AGENTS);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Workshop board could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadBoard(); }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const hasRunningTimer = useMemo(() => jobs.some(isTimerRunning) || breaks.some((item) => !item.ended_at && item.break_type !== 'ABSENT'), [jobs, breaks]);
  useEffect(() => {
    if (!hasRunningTimer) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasRunningTimer]);
  useEffect(() => () => {
    if (touchDragTimer.current !== null) window.clearTimeout(touchDragTimer.current);
  }, []);

  const visibleJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return jobs.filter((job) => {
      if (!showCollected && ['COLLECTED', 'CANCELLED'].includes(job.status)) return false;
      return !normalized || [job.job_number, job.customer_name, job.customer_phone, job.vehicle_details, job.registration, job.service_type, ...technicianList(job)]
        .some((field) => field?.toLowerCase().includes(normalized));
    });
  }, [jobs, query, showCollected]);

  const updateLocalJob = (next: WorkshopJob) => {
    setJobs((current) => current.map((job) => job.id === next.id ? next : job));
    setSelected(next);
    void loadBoard();
  };

  const moveJob = async (job: WorkshopJob, status: WorkshopJobStatus) => {
    if (busy || job.status === status) return;
    setBusy(true);
    try {
      const result = await updateWorkshopJob(job.id, { status });
      updateLocalJob(result.job);
      setToast(`${job.job_number} moved to ${statusLabel(status)}.`);
    } catch (moveError) {
      setToast(moveError instanceof Error ? moveError.message : 'The job could not be moved.');
    } finally { setBusy(false); }
  };

  const clearTouchDrag = () => {
    if (touchDragTimer.current !== null) {
      window.clearTimeout(touchDragTimer.current);
      touchDragTimer.current = null;
    }
    setDraggedJobId(null);
    setDragOverStatus(null);
  };

  const laneAtPoint = (clientX: number, clientY: number): WorkshopJobStatus | null => {
    const element = document.elementFromPoint(clientX, clientY);
    const lane = element?.closest<HTMLElement>('[data-workshop-lane]')?.dataset.workshopLane as WorkshopJobStatus | undefined;
    return lane && (LANES.some((item) => item.status === lane) || lane === 'COLLECTED') ? lane : null;
  };

  const startDesktopDrag = (event: React.DragEvent<HTMLElement>, job: WorkshopJob) => {
    if (busy) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', job.id);
    setDraggedJobId(job.id);
  };

  const dropInLane = (event: React.DragEvent<HTMLElement>, status: WorkshopJobStatus) => {
    event.preventDefault();
    const jobId = event.dataTransfer.getData('text/plain') || draggedJobId;
    const job = jobs.find((item) => item.id === jobId);
    setDraggedJobId(null);
    setDragOverStatus(null);
    if (job && !busy) void moveJob(job, status);
  };

  const startTouchDrag = (job: WorkshopJob) => {
    if (busy) return;
    clearTouchDrag();
    touchDragTimer.current = window.setTimeout(() => {
      touchDragTimer.current = null;
      setDraggedJobId(job.id);
    }, 280);
  };

  const moveTouchDrag = (clientX: number, clientY: number) => {
    if (!draggedJobId) {
      if (touchDragTimer.current !== null) {
        window.clearTimeout(touchDragTimer.current);
        touchDragTimer.current = null;
      }
      return false;
    }
    setDragOverStatus(laneAtPoint(clientX, clientY));
    return true;
  };

  const completeTouchDrag = (clientX: number, clientY: number) => {
    if (!draggedJobId) {
      clearTouchDrag();
      return false;
    }
    const job = jobs.find((item) => item.id === draggedJobId);
    const target = laneAtPoint(clientX, clientY);
    clearTouchDrag();
    if (job && target && !busy) void moveJob(job, target);
    return true;
  };

  const submitJob = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const normalized = { ...form, tyre_quantity: Number(form.tyre_quantity) || 0 };
      const result = await createWorkshopJob(normalized);
      setJobs((current) => [result.job, ...current]);
      setForm(emptyForm());
      setFormOpen(false);
      setToast(`${result.job.job_number} booked for ${result.job.customer_name}.`);
      void loadBoard();
    } catch (createError) {
      setToast(createError instanceof Error ? createError.message : 'The job could not be booked.');
    } finally { setBusy(false); }
  };

  const saveDetails = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const formData = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await updateWorkshopJob(selected.id, {
        customer_name: String(formData.get('customer_name') || ''),
        customer_phone: String(formData.get('customer_phone') || ''),
        vehicle_details: String(formData.get('vehicle_details') || ''),
        registration: String(formData.get('registration') || ''),
        service_type: String(formData.get('service_type') || ''),
        technicians: formData.getAll('technicians').map(String),
        agent: String(formData.get('agent') || ''),
        job_date: String(formData.get('job_date') || ''),
        ticket_number: String(formData.get('ticket_number') || ''),
        paid_by: String(formData.get('paid_by') || ''),
        notes: String(formData.get('notes') || ''),
        tyre_quantity: Number(formData.get('tyre_quantity') || 0),
        wheel_fitment: formData.get('wheel_fitment') === 'YES'
      });
      updateLocalJob(result.job);
      setToast('Job card updated.');
    } catch (saveError) {
      setToast(saveError instanceof Error ? saveError.message : 'Workshop details could not be saved.');
    } finally { setBusy(false); }
  };

  const removeJob = async () => {
    if (!selected || !isAdmin) return;
    const confirmed = window.confirm(
      `Delete job card ${selected.job_number} for ${selected.customer_name}?\n\nThis permanently removes the job and its saved workshop history. This cannot be undone.`
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await deleteWorkshopJob(selected.id);
      setJobs((current) => current.filter((job) => job.id !== selected.id));
      setSelected(null);
      setToast('Job card permanently deleted.');
      void loadBoard();
    } catch (deleteError) {
      setToast(deleteError instanceof Error ? deleteError.message : 'Workshop job could not be deleted.');
    } finally { setBusy(false); }
  };

  const activeBreaks = useMemo(() => new Map(breaks.filter((item) => !item.ended_at).map((item) => [item.technician, item])), [breaks]);
  const changeBreak = async (technician: string, nextBreak: WorkshopBreakType | '') => {
    const activeBreak = activeBreaks.get(technician);
    if (busy || (activeBreak?.break_type || '') === nextBreak) return;
    setBusy(true);
    try {
      if (activeBreak) await endWorkshopBreak(activeBreak.id);
      if (nextBreak) await startWorkshopBreak(technician, nextBreak);
      setToast(nextBreak === 'ABSENT' ? `${technician} is marked absent for the day.` : nextBreak ? `${technician} is now on ${nextBreak.replace('_', ' ')}.` : `${technician} is back from break.`);
      await loadBoard();
    } catch (breakError) {
      setToast(breakError instanceof Error ? breakError.message : 'Technician break could not be updated.');
    } finally { setBusy(false); }
  };

  const busyTechnicians = useMemo(() => new Set(jobs
    .filter((job) => ['CHECK_IN', 'IN_PROGRESS'].includes(job.status))
    .flatMap(technicianList)), [jobs]);
  const availableTechnicians = TECHNICIANS.filter((technician) => !busyTechnicians.has(technician));

  return (
    <div className="min-h-full bg-gp-black px-3 pb-24 pt-4 text-gp-text-main sm:px-5 lg:px-7">
      <div className="mx-auto max-w-[1680px]">
        <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gp-red"><span className="h-2 w-2 rounded-full bg-gp-red shadow-[0_0_10px_rgba(255,0,0,0.9)]" /> Live workshop floor</div>
            <h1 className="mt-1 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">Workshop Tracker</h1>
            <p className="mt-1 max-w-xl text-sm text-gp-text-muted">Scroll through every job card in one view. Move jobs forward or back at any stage; timers start at check-in and stop when a job is collected.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void loadBoard()} className="rounded-lg border border-gp-border bg-gp-panel px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-gp-text-muted transition hover:border-gp-text-muted hover:text-white">Refresh</button>
            <button onClick={() => setReportOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-gp-border bg-gp-panel px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-white transition hover:border-gp-red hover:text-gp-red" aria-label="Create workshop report"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2"><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4M9 12h6M9 16h6" /></svg>Reports</button>
            <button onClick={() => setFormOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-gp-red px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-gp-red/25 transition hover:bg-red-700" aria-label="Create new workshop job"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2"><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4M9 12h6M9 16h4" /></svg>New job</button>
          </div>
        </header>

        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          <Metric label="On floor" value={summary.active} />
          <Metric label="Today" value={summary.today} tone="text-blue-300" />
          <Metric label="Ready" value={summary.ready} tone="text-emerald-300" />
          <Metric label="Attention" value={summary.overdue} tone={summary.overdue ? 'text-gp-red' : 'text-white'} />
        </div>

        <WorkshopOperationsPanel jobs={jobs} breaks={breaks} busy={busy} now={now} onChangeBreak={changeBreak} />
        <div className="hidden">
        <section className="mb-4 rounded-xl border border-gp-border bg-gp-panel p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-gp-text-muted">Technician availability</p><p className="mt-0.5 text-xs text-gp-text-muted">Available technicians can be assigned to the next job.</p></div>
            <span className="text-xs font-black text-emerald-300">{availableTechnicians.length} available</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">{TECHNICIANS.map((technician) => {
            const busyTechnician = busyTechnicians.has(technician);
            return <span key={technician} className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${busyTechnician ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'}`}>{technician} · {busyTechnician ? 'Busy' : 'Available'}</span>;
          })}</div>
        </section>

        <section className="mb-4 rounded-xl border border-gp-border bg-gp-panel p-3">
          <div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-gp-text-muted">Technician break tracker</p><p className="mt-0.5 text-xs text-gp-text-muted">Use the dropdown to start Tea 1, Tea 2 or Lunch. Select Available to end the break.</p></div><span className="text-xs font-black text-amber-300">{activeBreaks.size} on break</span></div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{TECHNICIANS.map((technician) => {
            const activeBreak = activeBreaks.get(technician);
            return <div key={technician} className={`flex items-center gap-2 rounded-lg border p-2 ${activeBreak ? 'border-amber-500/40 bg-amber-500/10' : 'border-gp-border bg-gp-input'}`}><span className="min-w-0 flex-1 truncate text-xs font-black text-white">{technician}<span className="ml-2 font-mono text-[10px] text-amber-300">{activeBreak ? elapsedTimeLabel(activeBreak.started_at, null, now) : ''}</span></span><select aria-label={`${technician} break status`} disabled={busy} value={activeBreak?.break_type || ''} onChange={(event) => void changeBreak(technician, event.target.value as WorkshopBreakType | '')} className="w-28 rounded-md border border-gp-border bg-gp-dark px-2 py-1.5 text-[10px] font-black text-white outline-none focus:border-gp-red disabled:opacity-50"><option value="">Available</option><option value="TEA_1">Tea 1</option><option value="TEA_2">Tea 2</option><option value="LUNCH">Lunch</option></select></div>;
          })}</div>
        </section>

        </div>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <label className="flex flex-1 items-center gap-2 rounded-lg border border-gp-border bg-gp-panel px-3 py-2.5 text-gp-text-muted focus-within:border-gp-red">
            <span className="text-sm">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gp-text-muted" placeholder="Search customer, reg, vehicle or job number" />
          </label>
          <button onClick={() => setShowCollected((value) => !value)} className={`rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-wider ${showCollected ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-gp-border bg-gp-panel text-gp-text-muted'}`}>{showCollected ? 'Hide history' : 'Show history'}</button>
        </div>

        {error && <div className="mb-4 rounded-xl border border-gp-red/50 bg-gp-red/10 p-4 text-sm text-gp-red">{error}</div>}
        {loading ? <div className="flex min-h-72 items-center justify-center text-xs font-black uppercase tracking-wider text-gp-text-muted"><span className="mr-3 h-4 w-4 animate-spin rounded-full border-2 border-gp-red border-t-transparent" />Loading workshop board</div> : (
          <section className="space-y-4">
            {LANES.map((lane) => {
              const laneJobs = visibleJobs.filter((job) => job.status === lane.status);
              const isDropTarget = dragOverStatus === lane.status && Boolean(draggedJobId);
              return <div key={lane.status} data-workshop-lane={lane.status} onDragOver={(event) => { event.preventDefault(); if (draggedJobId) setDragOverStatus(lane.status); }} onDrop={(event) => dropInLane(event, lane.status)} className={`min-w-0 rounded-2xl border border-gp-border border-t-4 ${lane.accent} bg-gp-dark/70 p-3 transition ${isDropTarget ? 'scale-[1.01] bg-gp-red/10 ring-2 ring-gp-red/70' : ''}`}>
                <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-black uppercase tracking-wider text-white">{lane.label}</h2><span className="rounded-full bg-gp-input px-2 py-0.5 text-[10px] font-black text-gp-text-muted">{laneJobs.length}</span></div>
                <div className="grid grid-flow-dense gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {laneJobs.map((job) => <JobCard key={job.id} job={job} previous={lane.previous} next={lane.next} onOpen={() => setSelected(job)} onMove={(status) => void moveJob(job, status)} busy={busy} now={now} dragging={draggedJobId === job.id} onDesktopDragStart={startDesktopDrag} onDesktopDragEnd={clearTouchDrag} onTouchDragStart={startTouchDrag} onTouchDragMove={moveTouchDrag} onTouchDrop={completeTouchDrag} onTouchDragCancel={clearTouchDrag} />)}
                  {!laneJobs.length && <div className={`rounded-xl border border-dashed p-4 text-center text-[10px] font-bold uppercase tracking-wider ${isDropTarget ? 'border-gp-red text-gp-red' : 'border-gp-border text-gp-text-muted'}`}>{isDropTarget ? 'Drop job here' : 'Clear lane'}</div>}
                </div>
              </div>;
            })}
          </section>
        )}
{showCollected && !loading && <section className="mt-4 rounded-2xl border border-gp-border bg-gp-dark/70 p-3"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-xs font-black uppercase tracking-wider text-white">Job history</h2><p className="mt-0.5 text-[10px] text-gp-text-muted">Collected and cancelled jobs are retained in Supabase for recall and can still be edited.</p></div><span className="rounded-full bg-gp-input px-2 py-0.5 text-[10px] font-black text-gp-text-muted">{visibleJobs.filter((job) => ['COLLECTED', 'CANCELLED'].includes(job.status)).length}</span></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visibleJobs.filter((job) => ['COLLECTED', 'CANCELLED'].includes(job.status)).map((job) => <JobCard key={job.id} job={job} previous={workflowPrevious(job.status)} onOpen={() => setSelected(job)} onMove={(status) => void moveJob(job, status)} busy={busy} now={now} dragging={draggedJobId === job.id} isHistory onDesktopDragStart={startDesktopDrag} onDesktopDragEnd={clearTouchDrag} onTouchDragStart={startTouchDrag} onTouchDragMove={moveTouchDrag} onTouchDrop={completeTouchDrag} onTouchDragCancel={clearTouchDrag} />)}{!visibleJobs.some((job) => ['COLLECTED', 'CANCELLED'].includes(job.status)) && <p className="rounded-xl border border-dashed border-gp-border p-4 text-center text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">No matching historic jobs</p>}</div></section>}
      </div>

       {!loading && <TechnicianHistoryPanel jobs={jobs} breaks={breaks} now={now} />}
       {toast && <div role="status" className="fixed bottom-5 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-gp-border bg-gp-panel px-4 py-3 text-center text-sm font-bold text-white shadow-2xl">{toast}</div>}
      {formOpen && <JobForm currentUser={currentUser} agents={agents} form={form} setForm={setForm} onClose={() => setFormOpen(false)} onSubmit={submitJob} busy={busy} />}
      {reportOpen && <WorkshopReportModal jobs={jobs} breaks={breaks} onClose={() => setReportOpen(false)} />}
      {selected && <JobDetail job={selected} agents={agents} isAdmin={isAdmin} busy={busy} now={now} onClose={() => setSelected(null)} onMove={(status) => void moveJob(selected, status)} onSave={saveDetails} onDelete={() => void removeJob()} />}
    </div>
  );
};

const WorkshopReportModal: React.FC<{ jobs: WorkshopJob[]; breaks: WorkshopTechnicianBreak[]; onClose: () => void }> = ({ jobs, breaks, onClose }) => {
  const [period, setPeriod] = useState<WorkshopReportPeriod>('DAILY');
  const [reportDate, setReportDate] = useState(localDateKey());
  const [generating, setGenerating] = useState<WorkshopReportAction | null>(null);
  const [error, setError] = useState('');
  const range = getWorkshopReportRange(period, reportDate);
  const periodLabel = period === 'DAILY' ? 'Daily report' : 'Weekly report';

  const createReport = async (action: WorkshopReportAction) => {
    setGenerating(action);
    setError('');
    try {
      await generateWorkshopReport({ action, period, reportDate, jobs, breaks, logoUrl: gpLogo });
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'The workshop report could not be created.');
    } finally {
      setGenerating(null);
    }
  };

  return <div className="fixed inset-0 z-[80] flex items-end bg-black/80 p-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
    <section role="dialog" aria-modal="true" aria-labelledby="workshop-report-title" className="w-full max-w-lg rounded-2xl border border-gp-border bg-gp-dark shadow-2xl">
      <header className="flex items-start justify-between border-b border-gp-border p-4"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-gp-red">A4 PDF reports</p><h2 id="workshop-report-title" className="mt-1 text-xl font-black uppercase text-white">Workshop reports</h2><p className="mt-1 text-xs text-gp-text-muted">Includes GP Tyres branding, technician activity and full job-card details.</p></div><button type="button" onClick={onClose} className="text-xl text-gp-text-muted hover:text-white" aria-label="Close workshop reports">×</button></header>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setPeriod('DAILY')} className={`rounded-lg border px-3 py-3 text-left text-xs font-black uppercase tracking-wider ${period === 'DAILY' ? 'border-gp-red bg-gp-red/15 text-white' : 'border-gp-border bg-gp-panel text-gp-text-muted'}`}>Daily report</button><button type="button" onClick={() => setPeriod('WEEKLY')} className={`rounded-lg border px-3 py-3 text-left text-xs font-black uppercase tracking-wider ${period === 'WEEKLY' ? 'border-gp-red bg-gp-red/15 text-white' : 'border-gp-border bg-gp-panel text-gp-text-muted'}`}>Weekly report</button></div>
        <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-gp-text-muted">{period === 'DAILY' ? 'Report date' : 'Any day in the reporting week'}</span><input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} className="w-full rounded-lg border border-gp-border bg-gp-input px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-gp-red" /></label>
        <div className="rounded-xl border border-gp-border bg-gp-panel p-3"><p className="text-[10px] font-black uppercase tracking-wider text-gp-text-muted">Report period</p><p className="mt-1 text-sm font-black text-white">{periodLabel} · {range.label}</p><p className="mt-2 text-xs leading-relaxed text-gp-text-muted">The landscape A4 report records jobs, time in and elapsed time, assigned technicians, service and payment details, plus each technician's job totals and breaks or tasks.</p></div>
        {error && <p role="alert" className="rounded-lg border border-gp-red/50 bg-gp-red/10 px-3 py-2 text-xs font-bold text-gp-red">{error}</p>}
      </div>
      <footer className="grid gap-2 border-t border-gp-border p-4 sm:grid-cols-2"><button type="button" disabled={generating !== null} onClick={() => void createReport('DOWNLOAD')} className="rounded-lg bg-gp-red px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">{generating === 'DOWNLOAD' ? 'Creating PDF…' : 'Download A4 PDF'}</button><button type="button" disabled={generating !== null} onClick={() => void createReport('PRINT')} className="rounded-lg border border-gp-border bg-gp-panel px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">{generating === 'PRINT' ? 'Opening PDF…' : 'Print PDF'}</button></footer>
    </section>
  </div>;
};

const WorkshopOperationsPanel: React.FC<{
  jobs: WorkshopJob[];
  breaks: WorkshopTechnicianBreak[];
  busy: boolean;
  now: number;
  onChangeBreak: (technician: string, breakType: WorkshopBreakType | '') => void;
}> = ({ jobs, breaks, busy, now, onChangeBreak }) => {
  const today = localDateKey();
  const activeBreaks = new Map<string, WorkshopTechnicianBreak>(breaks.filter((item) => !item.ended_at).map((item) => [item.technician, item]));
  const activeJobTechnicians = new Set(jobs.filter((job) => ['CHECK_IN', 'IN_PROGRESS'].includes(job.status)).flatMap(technicianList));
  const lunchTaken = new Set(breaks.filter((item) => item.break_type === 'LUNCH' && localDateKey(new Date(item.started_at)) === today).map((item) => item.technician));
  const leaderboard = TECHNICIANS.map((technician) => ({
    technician,
    jobs: jobs.filter((job) => job.job_date === today && job.status !== 'CANCELLED' && technicianList(job).includes(technician)).length
  })).sort((left, right) => right.jobs - left.jobs || left.technician.localeCompare(right.technician));
  const availableCount = TECHNICIANS.filter((technician) => !activeJobTechnicians.has(technician) && !activeBreaks.has(technician)).length;

  return <>
    <section className="mb-4 rounded-xl border border-gp-border bg-gp-panel p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-gp-text-muted">Technician availability</p><p className="mt-0.5 text-xs text-gp-text-muted">Jobs, breaks and tyre collection all make a technician unavailable.</p></div>
        <span className="text-xs font-black text-emerald-300">{availableCount} available</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">{TECHNICIANS.map((technician) => {
        const activeBreak = activeBreaks.get(technician);
        const busyOnJob = activeJobTechnicians.has(technician);
        const status = activeBreak?.break_type === 'ABSENT' ? 'Absent for the day' : activeBreak ? `${breakLabel(activeBreak.break_type)} · ${elapsedTimeLabel(activeBreak.started_at, null, now)}` : busyOnJob ? 'Busy on job' : 'Available';
        const tone = activeBreak?.break_type === 'ABSENT' ? 'border-gp-red/60 bg-gp-red/15 text-gp-red' : activeBreak ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : busyOnJob ? 'border-blue-500/40 bg-blue-500/10 text-blue-300' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
        return <span key={technician} className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${tone}`}>{technician} · {status}</span>;
      })}</div>
    </section>

    <section className="mb-4 rounded-xl border border-gp-border bg-gp-panel p-3">
      <div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-gp-text-muted">Technician availability actions</p><p className="mt-0.5 text-xs text-gp-text-muted">Use the dropdown for Tea 1, Tea 2, Lunch, Collect tyres, Misc task or Absent. Available ends the current activity.</p></div><span className="text-xs font-black text-amber-300">{activeBreaks.size} unavailable</span></div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{TECHNICIANS.map((technician) => {
        const activeBreak = activeBreaks.get(technician);
        const hasTakenLunch = lunchTaken.has(technician);
        return <div key={technician} className={`rounded-lg border p-2 ${activeBreak?.break_type === 'ABSENT' ? 'border-gp-red/60 bg-gp-red/10' : activeBreak ? 'border-amber-500/40 bg-amber-500/10' : 'border-gp-border bg-gp-input'}`}>
          <div className="mb-2 flex items-center justify-between gap-2"><span className="min-w-0 truncate text-xs font-black text-white">{technician}</span><span className={`rounded px-1.5 py-0.5 text-[9px] font-black ${hasTakenLunch ? 'bg-emerald-500/15 text-emerald-300' : 'bg-gp-dark text-gp-text-muted'}`}>{hasTakenLunch ? 'Lunch logged' : 'Lunch pending'}</span></div>
          <div className="flex items-center gap-2"><select aria-label={`${technician} availability status`} disabled={busy} value={activeBreak?.break_type || ''} onChange={(event) => onChangeBreak(technician, event.target.value as WorkshopBreakType | '')} className="min-w-0 flex-1 rounded-md border border-gp-border bg-gp-dark px-2 py-1.5 text-[10px] font-black text-white outline-none focus:border-gp-red disabled:opacity-50"><option value="">Available</option><option value="TEA_1">Tea 1</option><option value="TEA_2">Tea 2</option><option value="LUNCH">Lunch</option><option value="TYRE_COLLECTION">Collect tyres</option><option value="MISC_TASK">Misc task</option><option value="ABSENT">Absent</option></select>{activeBreak && activeBreak.break_type !== 'ABSENT' && <span className="font-mono text-[10px] text-amber-300">{elapsedTimeLabel(activeBreak.started_at, null, now)}</span>}</div>
        </div>;
      })}</div>
    </section>

    <section className="mb-4 rounded-xl border border-gp-border bg-gp-panel p-3">
      <div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-gp-text-muted">Daily jobs leaderboard</p><p className="mt-0.5 text-xs text-gp-text-muted">Jobs assigned today, including shared jobs.</p></div><span className="text-[10px] font-black text-gp-text-muted">{today}</span></div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{leaderboard.map((entry, index) => <div key={entry.technician} className="flex items-center gap-3 rounded-lg border border-gp-border bg-gp-input px-3 py-2"><span className="w-5 text-center text-xs font-black text-gp-text-muted">{index + 1}</span><span className="min-w-0 flex-1 truncate text-xs font-black text-white">{entry.technician}</span><span className="text-lg font-black tabular-nums text-gp-red">{entry.jobs}</span><span className="text-[9px] font-black uppercase tracking-wider text-gp-text-muted">jobs</span></div>)}</div>
    </section>
  </>;
};

const TechnicianHistoryPanel: React.FC<{ jobs: WorkshopJob[]; breaks: WorkshopTechnicianBreak[]; now: number }> = ({ jobs, breaks, now }) => {
  const [technician, setTechnician] = useState('');
  const [date, setDate] = useState(localDateKey());
  const jobHistory = useMemo(() => jobs.filter((job) => job.job_date === date && (!technician || technicianList(job).includes(technician)) && job.started_at).sort((left, right) => new Date(right.started_at || 0).getTime() - new Date(left.started_at || 0).getTime()), [jobs, date, technician]);
  const breakHistory = useMemo(() => breaks.filter((item) => localDateKey(new Date(item.started_at)) === date && (!technician || item.technician === technician)).sort((left, right) => new Date(right.started_at).getTime() - new Date(left.started_at).getTime()), [breaks, date, technician]);
  return <section className="mt-4 rounded-2xl border border-gp-border bg-gp-dark/70 p-3">
    <div className="mb-3"><h2 className="text-xs font-black uppercase tracking-wider text-white">Technician activity history</h2><p className="mt-0.5 text-[10px] text-gp-text-muted">Search saved job and availability records to see who was busy, when, and for how long.</p></div>
    <div className="mb-3 grid gap-2 sm:grid-cols-2"><select aria-label="Search technician history" value={technician} onChange={(event) => setTechnician(event.target.value)} className="rounded-lg border border-gp-border bg-gp-input px-3 py-2 text-sm font-bold text-white outline-none focus:border-gp-red"><option value="">All technicians</option>{TECHNICIANS.map((name) => <option key={name} value={name}>{name}</option>)}</select><input aria-label="History date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-lg border border-gp-border bg-gp-input px-3 py-2 text-sm font-bold text-white outline-none focus:border-gp-red" /></div>
    <div className="grid gap-3 xl:grid-cols-2">
      <div><p className="mb-2 text-[10px] font-black uppercase tracking-wider text-gp-text-muted">Job time</p><div className="space-y-2">{jobHistory.map((job) => <div key={job.id} className="rounded-lg border border-gp-border bg-gp-panel p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-black text-white">{technicianList(job).join(', ') || 'Unassigned'} · {job.customer_name}</p><p className="mt-0.5 truncate text-[10px] text-gp-text-muted">{job.job_number} · {job.service_type}</p></div><span className="font-mono text-xs font-black text-amber-300">{elapsedTimeLabel(job.started_at, job.completed_at, now)}</span></div><p className="mt-2 text-[10px] text-gp-text-muted">Started {timeLabel(job.started_at)} · {job.completed_at ? `Finished ${timeLabel(job.completed_at)}` : 'Still active'}</p></div>)}{!jobHistory.length && <p className="rounded-lg border border-dashed border-gp-border p-3 text-center text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">No job activity found</p>}</div></div>
      <div><p className="mb-2 text-[10px] font-black uppercase tracking-wider text-gp-text-muted">Availability activity</p><div className="space-y-2">{breakHistory.map((item) => {
        const absent = item.break_type === 'ABSENT';
        return <div key={item.id} className={`rounded-lg border p-3 ${absent ? 'border-gp-red/40 bg-gp-red/10' : 'border-gp-border bg-gp-panel'}`}><div className="flex items-start justify-between gap-3"><p className="text-xs font-black text-white">{item.technician} · {breakLabel(item.break_type)}</p>{absent ? <span className="text-[10px] font-black uppercase tracking-wider text-gp-red">All day</span> : <span className="font-mono text-xs font-black text-amber-300">{elapsedTimeLabel(item.started_at, item.ended_at, now)}</span>}</div><p className="mt-2 text-[10px] text-gp-text-muted">{absent ? 'Marked absent for the day' : `Started ${timeLabel(item.started_at)} · ${item.ended_at ? `Returned ${timeLabel(item.ended_at)}` : 'Still unavailable'}`}</p></div>;
      })}{!breakHistory.length && <p className="rounded-lg border border-dashed border-gp-border p-3 text-center text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">No availability activity found</p>}</div></div>
    </div>
  </section>;
};

interface JobCardProps {
  job: WorkshopJob;
  previous?: WorkshopJobStatus;
  next?: WorkshopJobStatus;
  onOpen: () => void;
  onMove: (status: WorkshopJobStatus) => void;
  busy: boolean;
  now: number;
  dragging: boolean;
  isHistory?: boolean;
  onDesktopDragStart: (event: React.DragEvent<HTMLElement>, job: WorkshopJob) => void;
  onDesktopDragEnd: () => void;
  onTouchDragStart: (job: WorkshopJob) => void;
  onTouchDragMove: (clientX: number, clientY: number) => boolean;
  onTouchDrop: (clientX: number, clientY: number) => boolean;
  onTouchDragCancel: () => void;
}

const JobCard: React.FC<JobCardProps> = ({ job, previous, next, onOpen, onMove, busy, now, dragging, isHistory = false, onDesktopDragStart, onDesktopDragEnd, onTouchDragStart, onTouchDragMove, onTouchDrop, onTouchDragCancel }) => {
  const technicians = technicianList(job);
  const suppressCardClick = useRef(false);
  const handleTouchPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch' || busy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    onTouchDragStart(job);
  };
  const handleTouchPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') return;
    if (onTouchDragMove(event.clientX, event.clientY)) {
      suppressCardClick.current = true;
      event.preventDefault();
    }
  };
  const handleTouchPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') return;
    if (onTouchDrop(event.clientX, event.clientY)) {
      suppressCardClick.current = true;
      window.setTimeout(() => { suppressCardClick.current = false; }, 350);
    }
  };

  return <article draggable={!busy} onDragStart={(event) => onDesktopDragStart(event, job)} onDragEnd={onDesktopDragEnd} onPointerDown={handleTouchPointerDown} onPointerMove={handleTouchPointerMove} onPointerUp={handleTouchPointerUp} onPointerCancel={onTouchDragCancel} style={{ touchAction: dragging ? 'none' : 'pan-y' }} className={`w-full select-none rounded-xl border border-gp-border bg-gp-panel p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-gp-text-muted ${dragging ? 'scale-[0.98] cursor-grabbing opacity-45' : 'cursor-grab'}`}>
    <button onClick={(event) => { if (suppressCardClick.current) { event.preventDefault(); return; } onOpen(); }} className="w-full text-left" aria-label={`Edit ${job.job_number}`}>
      <div className="flex items-start justify-between gap-2"><span className="font-mono text-[10px] font-bold text-gp-text-muted">{job.job_number}</span><span className="rounded bg-gp-input px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-gp-text-muted">{statusLabel(job.status)}</span></div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-wider text-gp-text-muted"><span className="truncate">Agent · {job.agent || 'Unassigned'}</span><span className="shrink-0">Ticket · {job.ticket_number || '—'}</span></div>
      <h3 className="mt-2 truncate text-sm font-black text-white">{job.customer_name}</h3><p className="mt-0.5 truncate text-xs text-gp-text-muted">{job.vehicle_details}{job.registration ? ` · ${job.registration}` : ''}</p>
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-gp-border pt-2 text-[10px] font-bold text-gp-text-muted"><span className="mr-auto truncate">{job.service_type}</span><span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-300">{job.tyre_quantity || 0} tyres</span>{job.wheel_fitment && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">Wheel fitment</span>}</div>
      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] font-bold uppercase tracking-wide text-gp-text-muted"><span className="truncate">Date · {jobDateLabel(job.job_date)}</span><span className="truncate text-right">Paid by · {job.paid_by || '—'}</span><span className="col-span-2 truncate text-right">Status · {statusLabel(job.status)}</span></div>
      {job.notes && <p className="mt-2 line-clamp-2 border-t border-gp-border pt-2 text-[10px] leading-relaxed text-gp-text-muted">{job.notes}</p>}
      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-bold"><span className={`truncate ${technicians.length ? 'text-amber-300' : 'text-gp-text-muted'}`}>{technicians.length ? `Technicians · ${technicians.join(', ')}` : 'Technicians unassigned'}</span><span className={`shrink-0 font-mono ${isTimerRunning(job) ? 'text-amber-300' : 'text-gp-text-muted'}`}>{job.started_at ? elapsedTimeLabel(job.started_at, job.completed_at, now) : 'Time in —'}</span></div>
    </button>
    <button type="button" disabled={busy} onClick={onOpen} className="mt-3 w-full rounded-lg border border-gp-red/50 bg-gp-red/10 px-2 py-2 text-[10px] font-black uppercase tracking-wider text-gp-red transition hover:bg-gp-red hover:text-white disabled:opacity-50">
      {isHistory ? 'Edit completed job' : 'Edit job'}
    </button>
    <div className="mt-2 flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-gp-text-muted"><span>⋮⋮ Drag job</span>{job.started_at && <span>{isTimerRunning(job) ? 'Timer running' : 'Time recorded'}</span>}</div>
    {previous && <button disabled={busy} onClick={() => onMove(previous)} className="mt-3 w-full rounded-lg border border-gp-border bg-gp-input px-2 py-2 text-[10px] font-black uppercase tracking-wider text-gp-text-muted transition hover:border-gp-text-muted hover:text-white disabled:opacity-50">Move back to {statusLabel(previous)}</button>}
    {next && <button disabled={busy} onClick={() => onMove(next)} className="mt-3 w-full rounded-lg bg-gp-input px-2 py-2 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-gp-red disabled:opacity-50">Move to {statusLabel(next)} →</button>}
  </article>;
};

const TechnicianPicker: React.FC<{ selected: string[]; onChange: (technicians: string[]) => void }> = ({ selected, onChange }) => <div className="grid grid-cols-2 gap-2">{TECHNICIANS.map((technician) => {
  const selectedTechnician = selected.includes(technician);
  return <button key={technician} type="button" onClick={() => onChange(selectedTechnician ? selected.filter((item) => item !== technician) : [...selected, technician])} className={`rounded-lg border px-2.5 py-2 text-left text-[10px] font-black ${selectedTechnician ? 'border-gp-red bg-gp-red/15 text-white' : 'border-gp-border bg-gp-input text-gp-text-muted'}`}>{selectedTechnician ? '✓ ' : ''}{technician}</button>;
})}</div>;

const MultiTechnicianJobForm: React.FC<{ currentUser: string; agents: string[]; form: WorkshopJobInput; setForm: React.Dispatch<React.SetStateAction<WorkshopJobInput>>; onClose: () => void; onSubmit: (event: React.FormEvent) => void; busy: boolean }> = ({ currentUser, agents, form, setForm, onClose, onSubmit, busy }) => {
  const set = (field: keyof WorkshopJobInput, value: string | number) => setForm((current) => ({ ...current, [field]: value }));
  return <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6"><form onSubmit={onSubmit} className="mx-auto my-3 max-w-2xl rounded-2xl border border-gp-border bg-gp-dark shadow-2xl"><div className="flex items-center justify-between border-b border-gp-border p-4"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-gp-red">Quick intake</p><h2 className="text-xl font-black uppercase text-white">Book workshop job</h2></div><button type="button" onClick={onClose} className="text-xl text-gp-text-muted hover:text-white">×</button></div><div className="grid gap-4 p-4 sm:grid-cols-2"><Field label="Job date *"><input required type="date" value={form.job_date} onChange={(e) => set('job_date', e.target.value)} /></Field><Field label="Agent *"><select required value={form.agent} onChange={(e) => set('agent', e.target.value)}><option value="">Select agent</option>{agents.map((agent) => <option key={agent} value={agent}>{agent}</option>)}</select></Field><Field label="Ticket #"><input value={form.ticket_number} onChange={(e) => set('ticket_number', e.target.value)} placeholder="Auto-generated when blank" /></Field><Field label="Paid by"><select value={form.paid_by} onChange={(e) => set('paid_by', e.target.value)}><option value="">Not recorded</option>{PAID_BY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field><Field label="Customer name *"><input required value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} placeholder="Customer full name" /></Field><Field label="Mobile / phone"><input value={form.customer_phone} onChange={(e) => set('customer_phone', e.target.value)} placeholder="082 000 0000" inputMode="tel" /></Field><Field label="Vehicle *"><input required value={form.vehicle_details} onChange={(e) => set('vehicle_details', e.target.value)} placeholder="2022 VW Polo GTI" /></Field><Field label="Registration"><input value={form.registration} onChange={(e) => set('registration', e.target.value.toUpperCase())} placeholder="ABC 123 GP" /></Field><div className="sm:col-span-2"><Field label="Technicians"><TechnicianPicker selected={form.technicians || []} onChange={(technicians) => setForm((current) => ({ ...current, technicians }))} /></Field></div><Field label="Service *"><select value={form.service_type} onChange={(e) => set('service_type', e.target.value)}><option>Tyre fitment</option><option>Wheel alignment</option><option>Wheel balancing</option><option>Puncture repair</option><option>Wheel repair</option><option>Suspension fitment</option><option>Inspection / quotation</option></select></Field><Field label="Priority"><select value={form.priority} onChange={(e) => set('priority', e.target.value)}>{(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as WorkshopPriority[]).map((priority) => <option key={priority}>{priority}</option>)}</select></Field><Field label="Scheduled for"><input type="datetime-local" value={form.scheduled_for} onChange={(e) => set('scheduled_for', e.target.value)} /></Field><Field label="Estimated minutes"><input type="number" min="5" max="1440" value={form.estimated_minutes || ''} onChange={(e) => set('estimated_minutes', Number(e.target.value))} /></Field><Field label="Logged by"><div className="rounded-lg border border-gp-border bg-gp-input px-3 py-2.5 text-sm font-bold text-gp-text-muted">{currentUser}</div></Field><div className="sm:col-span-2"><Field label="Service notes"><textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} placeholder="Tyre size, customer request, parts needed or fitment notes" /></Field></div></div><div className="flex gap-2 border-t border-gp-border p-4"><button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gp-border px-4 py-3 text-xs font-black uppercase tracking-wider text-gp-text-muted">Cancel</button><button disabled={busy} className="flex-[1.5] rounded-lg bg-gp-red px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">{busy ? 'Saving…' : 'Book job'}</button></div></form></div>;
};

const QuickIntakeForm: React.FC<{ currentUser: string; agents: string[]; form: WorkshopJobInput; setForm: React.Dispatch<React.SetStateAction<WorkshopJobInput>>; onClose: () => void; onSubmit: (event: React.FormEvent) => void; busy: boolean }> = ({ currentUser, agents, form, setForm, onClose, onSubmit, busy }) => {
  const [walkInPuncture, setWalkInPuncture] = useState(form.customer_name === 'Walk-in puncture');
  const set = (field: keyof WorkshopJobInput, value: string | number) => setForm((current) => ({ ...current, [field]: value }));
  const toggleWalkInPuncture = (checked: boolean) => {
    setWalkInPuncture(checked);
    setForm((current) => checked ? { ...current, customer_name: 'Walk-in puncture', customer_phone: '', service_type: 'Puncture repair' } : { ...current, customer_name: current.customer_name === 'Walk-in puncture' ? '' : current.customer_name });
  };
  return <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6"><form onSubmit={onSubmit} className="mx-auto my-3 max-w-2xl rounded-2xl border border-gp-border bg-gp-dark shadow-2xl"><div className="flex items-center justify-between border-b border-gp-border p-4"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-gp-red">Quick intake</p><h2 className="text-xl font-black uppercase text-white">Book workshop job</h2></div><button type="button" onClick={onClose} className="text-xl text-gp-text-muted hover:text-white">×</button></div><div className="grid gap-4 p-4 sm:grid-cols-2"><div className="sm:col-span-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"><label className="flex cursor-pointer items-center gap-3"><input type="checkbox" checked={walkInPuncture} onChange={(event) => toggleWalkInPuncture(event.target.checked)} className="h-4 w-4 accent-red-600" /><span><span className="block text-xs font-black text-white">Quick walk-in puncture</span><span className="block text-[10px] text-gp-text-muted">No customer name required; saves as “Walk-in puncture”.</span></span></label></div><Field label="Job date *"><input required type="date" value={form.job_date} onChange={(event) => set('job_date', event.target.value)} /></Field><Field label="Agent *"><select required value={form.agent} onChange={(event) => set('agent', event.target.value)}><option value="">Select agent</option>{agents.map((agent) => <option key={agent} value={agent}>{agent}</option>)}</select></Field><Field label="Ticket #"><input value={form.ticket_number} onChange={(event) => set('ticket_number', event.target.value)} placeholder="Auto-generated when blank" /></Field><Field label="Paid by"><select value={form.paid_by} onChange={(event) => set('paid_by', event.target.value)}><option value="">Not recorded</option>{PAID_BY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field>{walkInPuncture ? <div className="rounded-lg border border-gp-border bg-gp-input px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-gp-text-muted">Customer</p><p className="mt-1 text-sm font-bold text-white">Walk-in puncture</p></div> : <Field label="Customer name *"><input required value={form.customer_name} onChange={(event) => set('customer_name', event.target.value)} placeholder="Customer full name" /></Field>}<Field label="Mobile / phone"><input disabled={walkInPuncture} value={form.customer_phone} onChange={(event) => set('customer_phone', event.target.value)} placeholder="082 000 0000" inputMode="tel" /></Field><Field label="Vehicle *"><input required value={form.vehicle_details} onChange={(event) => set('vehicle_details', event.target.value)} placeholder="2022 VW Polo GTI" /></Field><Field label="Registration"><input value={form.registration} onChange={(event) => set('registration', event.target.value.toUpperCase())} placeholder="ABC 123 GP" /></Field><div className="sm:col-span-2"><Field label="Technicians"><TechnicianPicker selected={form.technicians || []} onChange={(technicians) => setForm((current) => ({ ...current, technicians }))} /></Field></div><Field label="Service *"><select value={form.service_type} disabled={walkInPuncture} onChange={(event) => set('service_type', event.target.value)}><option>Tyre fitment</option><option>Wheel alignment</option><option>Wheel balancing</option><option>Puncture repair</option><option>Wheel repair</option><option>Suspension fitment</option><option>Inspection / quotation</option></select></Field><Field label="Priority"><select value={form.priority} onChange={(event) => set('priority', event.target.value)}>{(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as WorkshopPriority[]).map((priority) => <option key={priority}>{priority}</option>)}</select></Field><Field label="Scheduled for"><input type="datetime-local" value={form.scheduled_for} onChange={(event) => set('scheduled_for', event.target.value)} /></Field><Field label="Estimated minutes"><input type="number" min="5" max="1440" value={form.estimated_minutes || ''} onChange={(event) => set('estimated_minutes', Number(event.target.value))} /></Field><Field label="Logged by"><div className="rounded-lg border border-gp-border bg-gp-input px-3 py-2.5 text-sm font-bold text-gp-text-muted">{currentUser}</div></Field><div className="sm:col-span-2"><Field label="Service notes"><textarea value={form.notes} onChange={(event) => set('notes', event.target.value)} rows={3} placeholder="Tyre size, customer request, parts needed or fitment notes" /></Field></div></div><div className="flex gap-2 border-t border-gp-border p-4"><button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gp-border px-4 py-3 text-xs font-black uppercase tracking-wider text-gp-text-muted">Cancel</button><button disabled={busy} className="flex-[1.5] rounded-lg bg-gp-red px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">{busy ? 'Saving…' : 'Book job'}</button></div></form></div>;
};

const FastIntakeForm: React.FC<{ currentUser: string; agents: string[]; form: WorkshopJobInput; setForm: React.Dispatch<React.SetStateAction<WorkshopJobInput>>; onClose: () => void; onSubmit: (event: React.FormEvent) => void; busy: boolean }> = ({ currentUser, agents, form, setForm, onClose, onSubmit, busy }) => {
  const [walkInPuncture, setWalkInPuncture] = useState(false);
  const set = <K extends keyof WorkshopJobInput>(field: K, value: WorkshopJobInput[K]) => setForm((current) => ({ ...current, [field]: value }));
  const setWalkIn = (checked: boolean) => {
    setWalkInPuncture(checked);
    setForm((current) => checked
      ? { ...current, customer_name: 'Walk-in puncture', customer_phone: '', service_type: 'Puncture repair', tyre_quantity: 1, wheel_fitment: false }
      : { ...current, customer_name: current.customer_name === 'Walk-in puncture' ? '' : current.customer_name });
  };
  const quickServices = ['Tyre fitment', 'Wheel alignment', 'Wheel balancing', 'Puncture repair', 'Wheel repair', 'Inspection / quotation'];
  return <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6">
    <form onSubmit={onSubmit} className="mx-auto my-3 max-w-2xl rounded-2xl border border-gp-border bg-gp-dark shadow-2xl">
      <div className="flex items-center justify-between border-b border-gp-border p-4"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-gp-red">Fast workshop intake</p><h2 className="text-xl font-black uppercase text-white">Book workshop job</h2></div><button type="button" onClick={onClose} className="text-xl text-gp-text-muted hover:text-white">×</button></div>
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <div className="sm:col-span-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"><label className="flex cursor-pointer items-center gap-3"><input type="checkbox" checked={walkInPuncture} onChange={(event) => setWalkIn(event.target.checked)} className="h-4 w-4 accent-red-600" /><span><span className="block text-xs font-black text-white">Quick walk-in puncture</span><span className="block text-[10px] text-gp-text-muted">Adds the puncture service and one tyre automatically.</span></span></label></div>
        <Field label="Job date *"><input required type="date" value={form.job_date} onChange={(event) => set('job_date', event.target.value)} /></Field>
        <Field label="Agent *"><select required value={form.agent} onChange={(event) => set('agent', event.target.value)}><option value="">Select agent</option>{agents.map((agent) => <option key={agent} value={agent}>{agent}</option>)}</select></Field>
        <Field label="Ticket #"><input value={form.ticket_number} onChange={(event) => set('ticket_number', event.target.value)} placeholder="Auto-generated when blank" /></Field>
        <Field label="Paid by"><select value={form.paid_by} onChange={(event) => set('paid_by', event.target.value)}><option value="">Not recorded</option>{PAID_BY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field>
        {walkInPuncture ? <div className="rounded-lg border border-gp-border bg-gp-input px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-gp-text-muted">Customer</p><p className="mt-1 text-sm font-bold text-white">Walk-in puncture</p></div> : <Field label="Customer name *"><input required value={form.customer_name} onChange={(event) => set('customer_name', event.target.value)} placeholder="Customer full name" /></Field>}
        <Field label="Mobile / phone"><input disabled={walkInPuncture} value={form.customer_phone} onChange={(event) => set('customer_phone', event.target.value)} placeholder="082 000 0000" inputMode="tel" /></Field>
        <Field label="Vehicle *"><input required value={form.vehicle_details} onChange={(event) => set('vehicle_details', event.target.value)} placeholder="2022 VW Polo GTI" /></Field>
        <Field label="Registration"><input value={form.registration} onChange={(event) => set('registration', event.target.value.toUpperCase())} placeholder="ABC 123 GP" /></Field>
        <div className="sm:col-span-2"><Field label="Technicians"><TechnicianPicker selected={form.technicians || []} onChange={(technicians) => set('technicians', technicians)} /></Field></div>
        <div className="sm:col-span-2 rounded-xl border border-gp-border bg-gp-panel p-3"><p className="text-[10px] font-black uppercase tracking-wider text-gp-text-muted">Quick service</p><div className="mt-2 flex flex-wrap gap-2">{quickServices.map((service) => <button key={service} type="button" disabled={walkInPuncture} onClick={() => set('service_type', service)} className={`rounded-lg border px-2.5 py-2 text-[10px] font-black ${form.service_type === service ? 'border-gp-red bg-gp-red/15 text-white' : 'border-gp-border bg-gp-input text-gp-text-muted'}`}>{service}</button>)}</div></div>
        <Field label="Service *"><select value={form.service_type} disabled={walkInPuncture} onChange={(event) => set('service_type', event.target.value)}>{quickServices.map((service) => <option key={service}>{service}</option>)}<option>Suspension fitment</option></select></Field>
        <Field label="Tyres being fitted"><select value={String(form.tyre_quantity ?? 0)} onChange={(event) => set('tyre_quantity', Number(event.target.value))}>{[0, 1, 2, 3, 4, 5, 6, 8].map((quantity) => <option key={quantity} value={quantity}>{quantity} tyre{quantity === 1 ? '' : 's'}</option>)}</select></Field>
        <div className="sm:col-span-2 rounded-xl border border-gp-border bg-gp-panel p-3"><p className="text-[10px] font-black uppercase tracking-wider text-gp-text-muted">Quick fitment toggle</p><button type="button" onClick={() => set('wheel_fitment', !form.wheel_fitment)} className={`mt-2 w-full rounded-lg border px-3 py-2.5 text-left text-xs font-black ${form.wheel_fitment ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-gp-border bg-gp-input text-gp-text-muted'}`}>{form.wheel_fitment ? '✓ Wheels are being fitted' : 'Wheels are not being fitted'}</button></div>
        <div className="sm:col-span-2 rounded-xl border border-gp-border bg-gp-panel p-3"><p className="text-[10px] font-black uppercase tracking-wider text-gp-text-muted">Workflow start</p><button type="button" onClick={() => set('start_in_progress', !form.start_in_progress)} className={`mt-2 w-full rounded-lg border px-3 py-2.5 text-left text-xs font-black ${form.start_in_progress ? 'border-amber-500/50 bg-amber-500/10 text-amber-300' : 'border-gp-border bg-gp-input text-gp-text-muted'}`}>{form.start_in_progress ? 'Start straight in progress' : 'Start in Check-in'}</button><p className="mt-1.5 text-[10px] text-gp-text-muted">Starting in progress begins the job timer immediately.</p></div>
        <Field label="Logged by"><div className="rounded-lg border border-gp-border bg-gp-input px-3 py-2.5 text-sm font-bold text-gp-text-muted">{currentUser}</div></Field>
        <div className="sm:col-span-2"><Field label="Service notes"><textarea value={form.notes} onChange={(event) => set('notes', event.target.value)} rows={3} placeholder="Tyre size, customer request, parts needed or fitment notes" /></Field></div>
      </div>
      <div className="flex gap-2 border-t border-gp-border p-4"><button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gp-border px-4 py-3 text-xs font-black uppercase tracking-wider text-gp-text-muted">Cancel</button><button disabled={busy} className="flex-[1.5] rounded-lg bg-gp-red px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">{busy ? 'Saving…' : 'Book job'}</button></div>
    </form>
  </div>;
};

const JobForm: React.FC<{ currentUser: string; agents: string[]; form: WorkshopJobInput; setForm: React.Dispatch<React.SetStateAction<WorkshopJobInput>>; onClose: () => void; onSubmit: (event: React.FormEvent) => void; busy: boolean }> = ({ currentUser, agents, form, setForm, onClose, onSubmit, busy }) => {
  const set = (field: keyof WorkshopJobInput, value: string | number) => setForm((current) => ({ ...current, [field]: value }));
  return <FastIntakeForm currentUser={currentUser} agents={agents} form={form} setForm={setForm} onClose={onClose} onSubmit={onSubmit} busy={busy} />;
  return <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6"><form onSubmit={onSubmit} className="mx-auto my-3 max-w-2xl rounded-2xl border border-gp-border bg-gp-dark shadow-2xl"><div className="flex items-center justify-between border-b border-gp-border p-4"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-gp-red">Quick intake</p><h2 className="text-xl font-black uppercase text-white">Book workshop job</h2></div><button type="button" onClick={onClose} className="text-xl text-gp-text-muted hover:text-white">×</button></div><div className="grid gap-4 p-4 sm:grid-cols-2"><Field label="Job date *"><input required type="date" value={form.job_date} onChange={(e) => set('job_date', e.target.value)} /></Field><Field label="Agent *"><select required value={form.agent} onChange={(e) => set('agent', e.target.value)}><option value="">Select agent</option>{agents.map((agent) => <option key={agent} value={agent}>{agent}</option>)}</select></Field><Field label="Ticket #"><input value={form.ticket_number} onChange={(e) => set('ticket_number', e.target.value)} placeholder="Auto-generated when blank" /></Field><Field label="Paid by"><select value={form.paid_by} onChange={(e) => set('paid_by', e.target.value)}><option value="">Not recorded</option>{PAID_BY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field><Field label="Customer name *"><input required value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} placeholder="Customer full name" /></Field><Field label="Mobile / phone"><input value={form.customer_phone} onChange={(e) => set('customer_phone', e.target.value)} placeholder="082 000 0000" inputMode="tel" /></Field><Field label="Vehicle *"><input required value={form.vehicle_details} onChange={(e) => set('vehicle_details', e.target.value)} placeholder="2022 VW Polo GTI" /></Field><Field label="Registration"><input value={form.registration} onChange={(e) => set('registration', e.target.value.toUpperCase())} placeholder="ABC 123 GP" /></Field><Field label="Technician"><select value={form.technician} onChange={(e) => set('technician', e.target.value)}><option value="">Assign later</option>{TECHNICIANS.map((technician) => <option key={technician} value={technician}>{technician}</option>)}</select></Field><Field label="Service *"><select value={form.service_type} onChange={(e) => set('service_type', e.target.value)}><option>Tyre fitment</option><option>Wheel alignment</option><option>Wheel balancing</option><option>Puncture repair</option><option>Wheel repair</option><option>Suspension fitment</option><option>Inspection / quotation</option></select></Field><Field label="Priority"><select value={form.priority} onChange={(e) => set('priority', e.target.value)}>{(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as WorkshopPriority[]).map((priority) => <option key={priority}>{priority}</option>)}</select></Field><Field label="Scheduled for"><input type="datetime-local" value={form.scheduled_for} onChange={(e) => set('scheduled_for', e.target.value)} /></Field><Field label="Estimated minutes"><input type="number" min="5" max="1440" value={form.estimated_minutes || ''} onChange={(e) => set('estimated_minutes', Number(e.target.value))} /></Field><Field label="Logged by"><div className="rounded-lg border border-gp-border bg-gp-input px-3 py-2.5 text-sm font-bold text-gp-text-muted">{currentUser}</div></Field><div className="sm:col-span-2"><Field label="Service notes"><textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} placeholder="Tyre size, customer request, parts needed or fitment notes" /></Field></div></div><div className="flex gap-2 border-t border-gp-border p-4"><button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gp-border px-4 py-3 text-xs font-black uppercase tracking-wider text-gp-text-muted">Cancel</button><button disabled={busy} className="flex-[1.5] rounded-lg bg-gp-red px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">{busy ? 'Saving…' : 'Book job'}</button></div></form></div>;
};

const MultiTechnicianJobDetail: React.FC<{ job: WorkshopJob; agents: string[]; isAdmin: boolean; busy: boolean; now: number; onClose: () => void; onMove: (status: WorkshopJobStatus) => void; onSave: (event: React.FormEvent<HTMLFormElement>) => void; onDelete: () => void }> = ({ job, agents, isAdmin, busy, now, onClose, onMove, onSave, onDelete }) => {
  const [technicians, setTechnicians] = useState(() => technicianList(job));
  useEffect(() => setTechnicians(technicianList(job)), [job]);
  const next = LANES.find((lane) => lane.status === job.status)?.next;
  return <div className="fixed inset-0 z-[60] flex items-end bg-black/80 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"><section className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-gp-border bg-gp-dark shadow-2xl sm:rounded-2xl"><header className="flex items-start justify-between border-b border-gp-border p-4"><div><p className="font-mono text-[10px] font-bold text-gp-red">{job.job_number}</p><h2 className="mt-1 text-xl font-black uppercase text-white">{job.customer_name}</h2><p className="text-sm text-gp-text-muted">{job.vehicle_details}{job.registration ? ` · ${job.registration}` : ''}</p></div><button onClick={onClose} className="text-xl text-gp-text-muted hover:text-white">×</button></header><div className="grid grid-cols-2 gap-px bg-gp-border"><Info label="Agent" value={job.agent || 'Not added'} /><Info label="Job date" value={jobDateLabel(job.job_date)} /><Info label="Ticket #" value={job.ticket_number || 'Not added'} /><Info label="Paid by" value={job.paid_by || 'Not added'} /><Info label="Technicians" value={technicians.join(', ') || 'Not assigned'} /><Info label="Time in" value={job.started_at ? timeLabel(job.started_at) : 'Not checked in'} /><Info label="Elapsed" value={elapsedTimeLabel(job.started_at, job.completed_at, now)} /></div><form onSubmit={onSave} className="space-y-4 p-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="Agent *"><select required name="agent" defaultValue={job.agent || ''}><option value="">Select agent</option>{agents.map((agent) => <option key={agent} value={agent}>{agent}</option>)}</select></Field><Field label="Job date *"><input required name="job_date" type="date" defaultValue={job.job_date} /></Field><Field label="Ticket #"><input name="ticket_number" defaultValue={job.ticket_number || ''} placeholder="Auto-generated when blank" /></Field><Field label="Paid by"><select name="paid_by" defaultValue={job.paid_by || ''}><option value="">Not recorded</option>{PAID_BY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field><div className="sm:col-span-2"><Field label="Technicians"><TechnicianPicker selected={technicians} onChange={setTechnicians} />{technicians.map((technician) => <input key={technician} type="hidden" name="technicians" value={technician} />)}</Field></div><Field label="Priority"><select name="priority" defaultValue={job.priority}>{(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as WorkshopPriority[]).map((priority) => <option key={priority}>{priority}</option>)}</select></Field><Field label="Scheduled for"><input name="scheduled_for" type="datetime-local" defaultValue={dateTimeForInput(job.scheduled_for)} /></Field><Field label="Estimated minutes"><input name="estimated_minutes" type="number" min="5" max="1440" defaultValue={job.estimated_minutes || 60} /></Field></div><Field label="Service notes"><textarea name="notes" defaultValue={job.notes || ''} rows={4} placeholder="Add fitting, inspection or customer notes" /></Field><button disabled={busy} className="w-full rounded-lg border border-gp-border bg-gp-panel px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">Save details</button></form><div className="space-y-2 border-t border-gp-border p-4">{next && <button disabled={busy} onClick={() => onMove(next)} className="w-full rounded-lg bg-gp-red px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">Move to {statusLabel(next)} →</button>}{job.status === 'READY' && <button disabled={busy} onClick={() => onMove('COLLECTED')} className="w-full rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-emerald-300">Mark collected</button>}{isAdmin && <button disabled={busy} onClick={onDelete} className="w-full py-2 text-[10px] font-black uppercase tracking-wider text-gp-red/80 hover:text-gp-red">Delete job</button>}</div></section></div>;
};

const WorkshopJobDetail: React.FC<{ job: WorkshopJob; agents: string[]; isAdmin: boolean; busy: boolean; now: number; onClose: () => void; onMove: (status: WorkshopJobStatus) => void; onSave: (event: React.FormEvent<HTMLFormElement>) => void; onDelete: () => void }> = ({ job, agents, isAdmin, busy, now, onClose, onMove, onSave, onDelete }) => {
  const [technicians, setTechnicians] = useState(() => technicianList(job));
  useEffect(() => setTechnicians(technicianList(job)), [job]);
  const previous = workflowPrevious(job.status);
  const next = workflowNext(job.status);
  return <div className="fixed inset-0 z-[60] flex items-end bg-black/80 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
    <section className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-gp-border bg-gp-dark shadow-2xl sm:rounded-2xl">
      <header className="flex items-start justify-between border-b border-gp-border p-4"><div><p className="font-mono text-[10px] font-bold text-gp-red">{job.job_number}</p><h2 className="mt-1 text-xl font-black uppercase text-white">{job.customer_name}</h2><p className="text-sm text-gp-text-muted">{job.vehicle_details}{job.registration ? ` · ${job.registration}` : ''}</p></div><button onClick={onClose} className="text-xl text-gp-text-muted hover:text-white">×</button></header>
      <div className="grid grid-cols-2 gap-px bg-gp-border"><Info label="Agent" value={job.agent || 'Not added'} /><Info label="Job date" value={jobDateLabel(job.job_date)} /><Info label="Ticket #" value={job.ticket_number || 'Not added'} /><Info label="Paid by" value={job.paid_by || 'Not added'} /><Info label="Technicians" value={technicians.join(', ') || 'Not assigned'} /><Info label="Fitment" value={`${job.tyre_quantity || 0} tyres${job.wheel_fitment ? ' · Wheels' : ''}`} /><Info label="Time in" value={job.started_at ? timeLabel(job.started_at) : 'Not checked in'} /><Info label="Elapsed" value={elapsedTimeLabel(job.started_at, job.completed_at, now)} /></div>
      <form onSubmit={onSave} className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Agent *"><select required name="agent" defaultValue={job.agent || ''}><option value="">Select agent</option>{agents.map((agent) => <option key={agent} value={agent}>{agent}</option>)}</select></Field>
          <Field label="Job date *"><input required name="job_date" type="date" defaultValue={job.job_date} /></Field>
          <Field label="Ticket #"><input name="ticket_number" defaultValue={job.ticket_number || ''} placeholder="Auto-generated when blank" /></Field>
          <Field label="Paid by"><select name="paid_by" defaultValue={job.paid_by || ''}><option value="">Not recorded</option>{PAID_BY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field>
          <Field label="Customer name *"><input required name="customer_name" defaultValue={job.customer_name} placeholder="Customer full name" /></Field>
          <Field label="Mobile / phone"><input name="customer_phone" defaultValue={job.customer_phone || ''} placeholder="082 000 0000" inputMode="tel" /></Field>
          <Field label="Vehicle *"><input required name="vehicle_details" defaultValue={job.vehicle_details} placeholder="Vehicle details" /></Field>
          <Field label="Registration"><input name="registration" defaultValue={job.registration || ''} placeholder="ABC 123 GP" className="uppercase" /></Field>
          <Field label="Service *"><select required name="service_type" defaultValue={job.service_type}><option>Tyre fitment</option><option>Wheel alignment</option><option>Wheel balancing</option><option>Puncture repair</option><option>Wheel repair</option><option>Suspension fitment</option><option>Inspection / quotation</option></select></Field>
          <div className="sm:col-span-2"><Field label="Technicians"><TechnicianPicker selected={technicians} onChange={setTechnicians} />{technicians.map((technician) => <input key={technician} type="hidden" name="technicians" value={technician} />)}</Field></div>
          <Field label="Tyres being fitted"><select name="tyre_quantity" defaultValue={String(job.tyre_quantity || 0)}>{[0, 1, 2, 3, 4, 5, 6, 8].map((quantity) => <option key={quantity} value={quantity}>{quantity} tyre{quantity === 1 ? '' : 's'}</option>)}</select></Field>
          <Field label="Wheel fitment"><select name="wheel_fitment" defaultValue={job.wheel_fitment ? 'YES' : 'NO'}><option value="NO">No wheels</option><option value="YES">Wheels fitted</option></select></Field>
        </div>
        <Field label="Service notes"><textarea name="notes" defaultValue={job.notes || ''} rows={4} placeholder="Add fitting, inspection or customer notes" /></Field>
        <button disabled={busy} className="w-full rounded-lg border border-gp-border bg-gp-panel px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save job changes'}</button>
      </form>
      <div className="grid gap-2 border-t border-gp-border p-4 sm:grid-cols-2">{previous && <button disabled={busy} onClick={() => onMove(previous)} className="rounded-lg border border-gp-border bg-gp-input px-4 py-3 text-xs font-black uppercase tracking-wider text-gp-text-muted hover:text-white disabled:opacity-60">← Move back to {statusLabel(previous)}</button>}{next && <button disabled={busy} onClick={() => onMove(next)} className="rounded-lg bg-gp-red px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">Move to {statusLabel(next)} →</button>}{isAdmin && <button disabled={busy} onClick={onDelete} className="sm:col-span-2 rounded-lg border border-gp-red/50 bg-gp-red/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-gp-red transition hover:bg-gp-red hover:text-white disabled:opacity-60">Delete job card</button>}</div>
    </section>
  </div>;
};

const JobDetail: React.FC<{ job: WorkshopJob; agents: string[]; isAdmin: boolean; busy: boolean; now: number; onClose: () => void; onMove: (status: WorkshopJobStatus) => void; onSave: (event: React.FormEvent<HTMLFormElement>) => void; onDelete: () => void }> = ({ job, agents, isAdmin, busy, now, onClose, onMove, onSave, onDelete }) => {
  const next = LANES.find((lane) => lane.status === job.status)?.next;
  return <WorkshopJobDetail job={job} agents={agents} isAdmin={isAdmin} busy={busy} now={now} onClose={onClose} onMove={onMove} onSave={onSave} onDelete={onDelete} />;
  return <div className="fixed inset-0 z-[60] flex items-end bg-black/80 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"><section className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-gp-border bg-gp-dark shadow-2xl sm:rounded-2xl"><header className="flex items-start justify-between border-b border-gp-border p-4"><div><p className="font-mono text-[10px] font-bold text-gp-red">{job.job_number}</p><h2 className="mt-1 text-xl font-black uppercase text-white">{job.customer_name}</h2><p className="text-sm text-gp-text-muted">{job.vehicle_details}{job.registration ? ` · ${job.registration}` : ''}</p></div><button onClick={onClose} className="text-xl text-gp-text-muted hover:text-white">×</button></header><div className="grid grid-cols-2 gap-px bg-gp-border"><Info label="Agent" value={job.agent || 'Not added'} /><Info label="Job date" value={jobDateLabel(job.job_date)} /><Info label="Ticket #" value={job.ticket_number || 'Not added'} /><Info label="Paid by" value={job.paid_by || 'Not added'} /><Info label="Technician" value={job.technician || 'Not assigned'} /><Info label="Time in" value={job.started_at ? timeLabel(job.started_at) : 'Not checked in'} /><Info label="Elapsed" value={elapsedTimeLabel(job.started_at, job.completed_at, now)} /></div><form onSubmit={onSave} className="space-y-4 p-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="Agent *"><select required name="agent" defaultValue={job.agent || ''}><option value="">Select agent</option>{agents.map((agent) => <option key={agent} value={agent}>{agent}</option>)}</select></Field><Field label="Job date *"><input required name="job_date" type="date" defaultValue={job.job_date} /></Field><Field label="Ticket #"><input name="ticket_number" defaultValue={job.ticket_number || ''} placeholder="Auto-generated when blank" /></Field><Field label="Paid by"><select name="paid_by" defaultValue={job.paid_by || ''}><option value="">Not recorded</option>{PAID_BY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field><Field label="Technician"><select name="technician" defaultValue={job.technician || ''}><option value="">Unassigned</option>{TECHNICIANS.map((technician) => <option key={technician} value={technician}>{technician}</option>)}</select></Field><Field label="Priority"><select name="priority" defaultValue={job.priority}>{(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as WorkshopPriority[]).map((priority) => <option key={priority}>{priority}</option>)}</select></Field><Field label="Scheduled for"><input name="scheduled_for" type="datetime-local" defaultValue={dateTimeForInput(job.scheduled_for)} /></Field><Field label="Estimated minutes"><input name="estimated_minutes" type="number" min="5" max="1440" defaultValue={job.estimated_minutes || 60} /></Field></div><Field label="Service notes"><textarea name="notes" defaultValue={job.notes || ''} rows={4} placeholder="Add fitting, inspection or customer notes" /></Field><button disabled={busy} className="w-full rounded-lg border border-gp-border bg-gp-panel px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">Save details</button></form><div className="space-y-2 border-t border-gp-border p-4">{next && <button disabled={busy} onClick={() => onMove(next)} className="w-full rounded-lg bg-gp-red px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">Move to {statusLabel(next)} →</button>}{job.status === 'READY' && <button disabled={busy} onClick={() => onMove('COLLECTED')} className="w-full rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-emerald-300">Mark collected</button>}{isAdmin && <button disabled={busy} onClick={onDelete} className="w-full py-2 text-[10px] font-black uppercase tracking-wider text-gp-red/80 hover:text-gp-red">Delete job</button>}</div></section></div>;
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-gp-text-muted">{label}</span><div className="[&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-gp-border [&_input]:bg-gp-input [&_input]:px-3 [&_input]:py-2.5 [&_input]:text-sm [&_input]:text-white [&_input]:outline-none [&_input:focus]:border-gp-red [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-gp-border [&_select]:bg-gp-input [&_select]:px-3 [&_select]:py-2.5 [&_select]:text-sm [&_select]:text-white [&_textarea]:w-full [&_textarea]:resize-none [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-gp-border [&_textarea]:bg-gp-input [&_textarea]:px-3 [&_textarea]:py-2.5 [&_textarea]:text-sm [&_textarea]:text-white [&_textarea]:outline-none [&_textarea:focus]:border-gp-red">{children}</div></label>;

const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => <div className="bg-gp-panel p-3"><p className="text-[9px] font-black uppercase tracking-wider text-gp-text-muted">{label}</p><p className="mt-1 truncate text-xs font-bold text-white">{value}</p></div>;
