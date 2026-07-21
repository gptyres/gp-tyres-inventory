import React, { useEffect, useMemo, useRef, useState } from 'react';
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

interface WorkshopTrackerViewProps {
  currentUser: string;
  isAdmin: boolean;
}

const LANES: Array<{ status: WorkshopJobStatus; label: string; accent: string; next?: WorkshopJobStatus }> = [
  { status: 'CHECK_IN', label: 'Check-in', accent: 'border-blue-500', next: 'IN_PROGRESS' },
  { status: 'IN_PROGRESS', label: 'In progress', accent: 'border-amber-500', next: 'READY' },
  { status: 'READY', label: 'Ready', accent: 'border-emerald-500', next: 'COLLECTED' }
];

const PRIORITY_STYLE: Record<WorkshopPriority, string> = {
  LOW: 'bg-slate-700 text-slate-200',
  NORMAL: 'bg-blue-500/15 text-blue-300',
  HIGH: 'bg-amber-500/15 text-amber-300',
  URGENT: 'bg-gp-red/15 text-gp-red'
};

const statusLabel = (status: WorkshopJobStatus) => status.replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const emptyForm = (): WorkshopJobInput => ({
  customer_name: '', customer_phone: '', vehicle_details: '', registration: '', service_type: 'Tyre fitment',
  priority: 'NORMAL', technician: '', technicians: [], agent: '', job_date: new Date().toISOString().slice(0, 10), ticket_number: '', paid_by: '', scheduled_for: '', estimated_minutes: 60, notes: ''
});

const dateTimeForInput = (value: string | null) => value ? new Date(value).toISOString().slice(0, 16) : '';
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

  const hasRunningTimer = useMemo(() => jobs.some(isTimerRunning) || breaks.some((item) => !item.ended_at), [jobs, breaks]);
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
      const normalized = { ...form, scheduled_for: form.scheduled_for || undefined, estimated_minutes: Number(form.estimated_minutes) || undefined };
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
        technicians: formData.getAll('technicians').map(String),
        agent: String(formData.get('agent') || ''),
        job_date: String(formData.get('job_date') || ''),
        ticket_number: String(formData.get('ticket_number') || ''),
        paid_by: String(formData.get('paid_by') || ''),
        notes: String(formData.get('notes') || ''),
        priority: String(formData.get('priority') || 'NORMAL') as WorkshopPriority,
        scheduled_for: String(formData.get('scheduled_for') || ''),
        estimated_minutes: Number(formData.get('estimated_minutes') || 60)
      });
      updateLocalJob(result.job);
      setToast('Workshop details saved.');
    } catch (saveError) {
      setToast(saveError instanceof Error ? saveError.message : 'Workshop details could not be saved.');
    } finally { setBusy(false); }
  };

  const removeJob = async () => {
    if (!selected || !isAdmin || !window.confirm(`Delete ${selected.job_number}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteWorkshopJob(selected.id);
      setJobs((current) => current.filter((job) => job.id !== selected.id));
      setSelected(null);
      setToast('Workshop job deleted.');
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
      setToast(nextBreak ? `${technician} is now on ${nextBreak.replace('_', ' ')}.` : `${technician} is back from break.`);
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
            <p className="mt-1 max-w-xl text-sm text-gp-text-muted">Drag jobs between stages. On touch screens, hold a card briefly, then drag it to a lane. Timers start at check-in and stop when a job is collected.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void loadBoard()} className="rounded-lg border border-gp-border bg-gp-panel px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-gp-text-muted transition hover:border-gp-text-muted hover:text-white">Refresh</button>
            <button onClick={() => setFormOpen(true)} className="rounded-lg bg-gp-red px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-gp-red/25 transition hover:bg-red-700">+ New job</button>
          </div>
        </header>

        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          <Metric label="On floor" value={summary.active} />
          <Metric label="Today" value={summary.today} tone="text-blue-300" />
          <Metric label="Ready" value={summary.ready} tone="text-emerald-300" />
          <Metric label="Attention" value={summary.overdue} tone={summary.overdue ? 'text-gp-red' : 'text-white'} />
        </div>

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

        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <label className="flex flex-1 items-center gap-2 rounded-lg border border-gp-border bg-gp-panel px-3 py-2.5 text-gp-text-muted focus-within:border-gp-red">
            <span className="text-sm">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gp-text-muted" placeholder="Search customer, reg, vehicle or job number" />
          </label>
          <button onClick={() => setShowCollected((value) => !value)} className={`rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-wider ${showCollected ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-gp-border bg-gp-panel text-gp-text-muted'}`}>{showCollected ? 'Hide history' : 'Show history'}</button>
        </div>

        {error && <div className="mb-4 rounded-xl border border-gp-red/50 bg-gp-red/10 p-4 text-sm text-gp-red">{error}</div>}
        {loading ? <div className="flex min-h-72 items-center justify-center text-xs font-black uppercase tracking-wider text-gp-text-muted"><span className="mr-3 h-4 w-4 animate-spin rounded-full border-2 border-gp-red border-t-transparent" />Loading workshop board</div> : (
          <section className="grid gap-4 xl:grid-cols-3">
            {LANES.map((lane) => {
              const laneJobs = visibleJobs.filter((job) => job.status === lane.status);
              const isDropTarget = dragOverStatus === lane.status && Boolean(draggedJobId);
              return <div key={lane.status} data-workshop-lane={lane.status} onDragOver={(event) => { event.preventDefault(); if (draggedJobId) setDragOverStatus(lane.status); }} onDrop={(event) => dropInLane(event, lane.status)} className={`min-w-0 rounded-2xl border border-gp-border border-t-4 ${lane.accent} bg-gp-dark/70 p-3 transition ${isDropTarget ? 'scale-[1.01] bg-gp-red/10 ring-2 ring-gp-red/70' : ''}`}>
                <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-black uppercase tracking-wider text-white">{lane.label}</h2><span className="rounded-full bg-gp-input px-2 py-0.5 text-[10px] font-black text-gp-text-muted">{laneJobs.length}</span></div>
                <div className="flex gap-3 overflow-x-auto pb-2 xl:flex-col xl:overflow-visible">
                  {laneJobs.map((job) => <JobCard key={job.id} job={job} next={lane.next} onOpen={() => setSelected(job)} onMove={() => lane.next && void moveJob(job, lane.next)} busy={busy} now={now} dragging={draggedJobId === job.id} onDesktopDragStart={startDesktopDrag} onDesktopDragEnd={clearTouchDrag} onTouchDragStart={startTouchDrag} onTouchDragMove={moveTouchDrag} onTouchDrop={completeTouchDrag} onTouchDragCancel={clearTouchDrag} />)}
                  {!laneJobs.length && <div className={`min-w-[185px] rounded-xl border border-dashed p-4 text-center text-[10px] font-bold uppercase tracking-wider xl:min-w-0 ${isDropTarget ? 'border-gp-red text-gp-red' : 'border-gp-border text-gp-text-muted'}`}>{isDropTarget ? 'Drop job here' : 'Clear lane'}</div>}
                </div>
              </div>;
            })}
          </section>
        )}
        {showCollected && !loading && <section className="mt-4 rounded-2xl border border-gp-border bg-gp-dark/70 p-3"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-xs font-black uppercase tracking-wider text-white">Job history</h2><p className="mt-0.5 text-[10px] text-gp-text-muted">Collected and cancelled jobs are retained in Supabase for recall.</p></div><span className="rounded-full bg-gp-input px-2 py-0.5 text-[10px] font-black text-gp-text-muted">{visibleJobs.filter((job) => ['COLLECTED', 'CANCELLED'].includes(job.status)).length}</span></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visibleJobs.filter((job) => ['COLLECTED', 'CANCELLED'].includes(job.status)).map((job) => <JobCard key={job.id} job={job} onOpen={() => setSelected(job)} onMove={() => undefined} busy={busy} now={now} dragging={draggedJobId === job.id} onDesktopDragStart={startDesktopDrag} onDesktopDragEnd={clearTouchDrag} onTouchDragStart={startTouchDrag} onTouchDragMove={moveTouchDrag} onTouchDrop={completeTouchDrag} onTouchDragCancel={clearTouchDrag} />)}{!visibleJobs.some((job) => ['COLLECTED', 'CANCELLED'].includes(job.status)) && <p className="rounded-xl border border-dashed border-gp-border p-4 text-center text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">No matching historic jobs</p>}</div></section>}
      </div>

      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-gp-border bg-gp-panel px-4 py-3 text-center text-sm font-bold text-white shadow-2xl">{toast}</div>}
      {formOpen && <JobForm currentUser={currentUser} agents={agents} form={form} setForm={setForm} onClose={() => setFormOpen(false)} onSubmit={submitJob} busy={busy} />}
      {selected && <JobDetail job={selected} agents={agents} isAdmin={isAdmin} busy={busy} now={now} onClose={() => setSelected(null)} onMove={(status) => void moveJob(selected, status)} onSave={saveDetails} onDelete={() => void removeJob()} />}
    </div>
  );
};

interface JobCardProps {
  job: WorkshopJob;
  next?: WorkshopJobStatus;
  onOpen: () => void;
  onMove: () => void;
  busy: boolean;
  now: number;
  dragging: boolean;
  onDesktopDragStart: (event: React.DragEvent<HTMLElement>, job: WorkshopJob) => void;
  onDesktopDragEnd: () => void;
  onTouchDragStart: (job: WorkshopJob) => void;
  onTouchDragMove: (clientX: number, clientY: number) => boolean;
  onTouchDrop: (clientX: number, clientY: number) => boolean;
  onTouchDragCancel: () => void;
}

const JobCard: React.FC<JobCardProps> = ({ job, next, onOpen, onMove, busy, now, dragging, onDesktopDragStart, onDesktopDragEnd, onTouchDragStart, onTouchDragMove, onTouchDrop, onTouchDragCancel }) => {
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

  return <article draggable={!busy} onDragStart={(event) => onDesktopDragStart(event, job)} onDragEnd={onDesktopDragEnd} onPointerDown={handleTouchPointerDown} onPointerMove={handleTouchPointerMove} onPointerUp={handleTouchPointerUp} onPointerCancel={onTouchDragCancel} style={{ touchAction: dragging ? 'none' : 'pan-y' }} className={`min-w-[248px] select-none rounded-xl border border-gp-border bg-gp-panel p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-gp-text-muted xl:min-w-0 ${dragging ? 'scale-[0.98] cursor-grabbing opacity-45' : 'cursor-grab'}`}>
    <button onClick={(event) => { if (suppressCardClick.current) { event.preventDefault(); return; } onOpen(); }} className="w-full text-left">
      <div className="flex items-start justify-between gap-2"><span className="font-mono text-[10px] font-bold text-gp-text-muted">{job.job_number}</span><span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${PRIORITY_STYLE[job.priority]}`}>{job.priority}</span></div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-wider text-gp-text-muted"><span className="truncate">Agent · {job.agent || 'Unassigned'}</span><span className="shrink-0">Ticket · {job.ticket_number || '—'}</span></div>
      <h3 className="mt-2 truncate text-sm font-black text-white">{job.customer_name}</h3><p className="mt-0.5 truncate text-xs text-gp-text-muted">{job.vehicle_details}{job.registration ? ` · ${job.registration}` : ''}</p>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-gp-border pt-2 text-[10px] font-bold text-gp-text-muted"><span className="truncate">{job.service_type}</span><span className="shrink-0">{timeLabel(job.scheduled_for)}</span></div>
      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] font-bold uppercase tracking-wide text-gp-text-muted"><span className="truncate">Date · {jobDateLabel(job.job_date)}</span><span className="truncate text-right">Paid by · {job.paid_by || '—'}</span><span className="col-span-2 truncate text-right">Status · {statusLabel(job.status)}</span></div>
      {job.notes && <p className="mt-2 line-clamp-2 border-t border-gp-border pt-2 text-[10px] leading-relaxed text-gp-text-muted">{job.notes}</p>}
      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-bold"><span className={`truncate ${technicians.length ? 'text-amber-300' : 'text-gp-text-muted'}`}>{technicians.length ? `Technicians · ${technicians.join(', ')}` : 'Technicians unassigned'}</span><span className={`shrink-0 font-mono ${isTimerRunning(job) ? 'text-amber-300' : 'text-gp-text-muted'}`}>{job.started_at ? elapsedTimeLabel(job.started_at, job.completed_at, now) : 'Time in —'}</span></div>
    </button>
    <div className="mt-2 flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-gp-text-muted"><span>⋮⋮ Drag job</span>{job.started_at && <span>{isTimerRunning(job) ? 'Timer running' : 'Time recorded'}</span>}</div>
    {next && <button disabled={busy} onClick={onMove} className="mt-3 w-full rounded-lg bg-gp-input px-2 py-2 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-gp-red disabled:opacity-50">Move to {statusLabel(next)} →</button>}
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

const JobForm: React.FC<{ currentUser: string; agents: string[]; form: WorkshopJobInput; setForm: React.Dispatch<React.SetStateAction<WorkshopJobInput>>; onClose: () => void; onSubmit: (event: React.FormEvent) => void; busy: boolean }> = ({ currentUser, agents, form, setForm, onClose, onSubmit, busy }) => {
  const set = (field: keyof WorkshopJobInput, value: string | number) => setForm((current) => ({ ...current, [field]: value }));
  return <MultiTechnicianJobForm currentUser={currentUser} agents={agents} form={form} setForm={setForm} onClose={onClose} onSubmit={onSubmit} busy={busy} />;
  return <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6"><form onSubmit={onSubmit} className="mx-auto my-3 max-w-2xl rounded-2xl border border-gp-border bg-gp-dark shadow-2xl"><div className="flex items-center justify-between border-b border-gp-border p-4"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-gp-red">Quick intake</p><h2 className="text-xl font-black uppercase text-white">Book workshop job</h2></div><button type="button" onClick={onClose} className="text-xl text-gp-text-muted hover:text-white">×</button></div><div className="grid gap-4 p-4 sm:grid-cols-2"><Field label="Job date *"><input required type="date" value={form.job_date} onChange={(e) => set('job_date', e.target.value)} /></Field><Field label="Agent *"><select required value={form.agent} onChange={(e) => set('agent', e.target.value)}><option value="">Select agent</option>{agents.map((agent) => <option key={agent} value={agent}>{agent}</option>)}</select></Field><Field label="Ticket #"><input value={form.ticket_number} onChange={(e) => set('ticket_number', e.target.value)} placeholder="Auto-generated when blank" /></Field><Field label="Paid by"><select value={form.paid_by} onChange={(e) => set('paid_by', e.target.value)}><option value="">Not recorded</option>{PAID_BY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field><Field label="Customer name *"><input required value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} placeholder="Customer full name" /></Field><Field label="Mobile / phone"><input value={form.customer_phone} onChange={(e) => set('customer_phone', e.target.value)} placeholder="082 000 0000" inputMode="tel" /></Field><Field label="Vehicle *"><input required value={form.vehicle_details} onChange={(e) => set('vehicle_details', e.target.value)} placeholder="2022 VW Polo GTI" /></Field><Field label="Registration"><input value={form.registration} onChange={(e) => set('registration', e.target.value.toUpperCase())} placeholder="ABC 123 GP" /></Field><Field label="Technician"><select value={form.technician} onChange={(e) => set('technician', e.target.value)}><option value="">Assign later</option>{TECHNICIANS.map((technician) => <option key={technician} value={technician}>{technician}</option>)}</select></Field><Field label="Service *"><select value={form.service_type} onChange={(e) => set('service_type', e.target.value)}><option>Tyre fitment</option><option>Wheel alignment</option><option>Wheel balancing</option><option>Puncture repair</option><option>Wheel repair</option><option>Suspension fitment</option><option>Inspection / quotation</option></select></Field><Field label="Priority"><select value={form.priority} onChange={(e) => set('priority', e.target.value)}>{(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as WorkshopPriority[]).map((priority) => <option key={priority}>{priority}</option>)}</select></Field><Field label="Scheduled for"><input type="datetime-local" value={form.scheduled_for} onChange={(e) => set('scheduled_for', e.target.value)} /></Field><Field label="Estimated minutes"><input type="number" min="5" max="1440" value={form.estimated_minutes || ''} onChange={(e) => set('estimated_minutes', Number(e.target.value))} /></Field><Field label="Logged by"><div className="rounded-lg border border-gp-border bg-gp-input px-3 py-2.5 text-sm font-bold text-gp-text-muted">{currentUser}</div></Field><div className="sm:col-span-2"><Field label="Service notes"><textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} placeholder="Tyre size, customer request, parts needed or fitment notes" /></Field></div></div><div className="flex gap-2 border-t border-gp-border p-4"><button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gp-border px-4 py-3 text-xs font-black uppercase tracking-wider text-gp-text-muted">Cancel</button><button disabled={busy} className="flex-[1.5] rounded-lg bg-gp-red px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">{busy ? 'Saving…' : 'Book job'}</button></div></form></div>;
};

const MultiTechnicianJobDetail: React.FC<{ job: WorkshopJob; agents: string[]; isAdmin: boolean; busy: boolean; now: number; onClose: () => void; onMove: (status: WorkshopJobStatus) => void; onSave: (event: React.FormEvent<HTMLFormElement>) => void; onDelete: () => void }> = ({ job, agents, isAdmin, busy, now, onClose, onMove, onSave, onDelete }) => {
  const [technicians, setTechnicians] = useState(() => technicianList(job));
  useEffect(() => setTechnicians(technicianList(job)), [job]);
  const next = LANES.find((lane) => lane.status === job.status)?.next;
  return <div className="fixed inset-0 z-[60] flex items-end bg-black/80 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"><section className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-gp-border bg-gp-dark shadow-2xl sm:rounded-2xl"><header className="flex items-start justify-between border-b border-gp-border p-4"><div><p className="font-mono text-[10px] font-bold text-gp-red">{job.job_number}</p><h2 className="mt-1 text-xl font-black uppercase text-white">{job.customer_name}</h2><p className="text-sm text-gp-text-muted">{job.vehicle_details}{job.registration ? ` · ${job.registration}` : ''}</p></div><button onClick={onClose} className="text-xl text-gp-text-muted hover:text-white">×</button></header><div className="grid grid-cols-2 gap-px bg-gp-border"><Info label="Agent" value={job.agent || 'Not added'} /><Info label="Job date" value={jobDateLabel(job.job_date)} /><Info label="Ticket #" value={job.ticket_number || 'Not added'} /><Info label="Paid by" value={job.paid_by || 'Not added'} /><Info label="Technicians" value={technicians.join(', ') || 'Not assigned'} /><Info label="Time in" value={job.started_at ? timeLabel(job.started_at) : 'Not checked in'} /><Info label="Elapsed" value={elapsedTimeLabel(job.started_at, job.completed_at, now)} /></div><form onSubmit={onSave} className="space-y-4 p-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="Agent *"><select required name="agent" defaultValue={job.agent || ''}><option value="">Select agent</option>{agents.map((agent) => <option key={agent} value={agent}>{agent}</option>)}</select></Field><Field label="Job date *"><input required name="job_date" type="date" defaultValue={job.job_date} /></Field><Field label="Ticket #"><input name="ticket_number" defaultValue={job.ticket_number || ''} placeholder="Auto-generated when blank" /></Field><Field label="Paid by"><select name="paid_by" defaultValue={job.paid_by || ''}><option value="">Not recorded</option>{PAID_BY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field><div className="sm:col-span-2"><Field label="Technicians"><TechnicianPicker selected={technicians} onChange={setTechnicians} />{technicians.map((technician) => <input key={technician} type="hidden" name="technicians" value={technician} />)}</Field></div><Field label="Priority"><select name="priority" defaultValue={job.priority}>{(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as WorkshopPriority[]).map((priority) => <option key={priority}>{priority}</option>)}</select></Field><Field label="Scheduled for"><input name="scheduled_for" type="datetime-local" defaultValue={dateTimeForInput(job.scheduled_for)} /></Field><Field label="Estimated minutes"><input name="estimated_minutes" type="number" min="5" max="1440" defaultValue={job.estimated_minutes || 60} /></Field></div><Field label="Service notes"><textarea name="notes" defaultValue={job.notes || ''} rows={4} placeholder="Add fitting, inspection or customer notes" /></Field><button disabled={busy} className="w-full rounded-lg border border-gp-border bg-gp-panel px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">Save details</button></form><div className="space-y-2 border-t border-gp-border p-4">{next && <button disabled={busy} onClick={() => onMove(next)} className="w-full rounded-lg bg-gp-red px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">Move to {statusLabel(next)} →</button>}{job.status === 'READY' && <button disabled={busy} onClick={() => onMove('COLLECTED')} className="w-full rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-emerald-300">Mark collected</button>}{isAdmin && <button disabled={busy} onClick={onDelete} className="w-full py-2 text-[10px] font-black uppercase tracking-wider text-gp-red/80 hover:text-gp-red">Delete job</button>}</div></section></div>;
};

const JobDetail: React.FC<{ job: WorkshopJob; agents: string[]; isAdmin: boolean; busy: boolean; now: number; onClose: () => void; onMove: (status: WorkshopJobStatus) => void; onSave: (event: React.FormEvent<HTMLFormElement>) => void; onDelete: () => void }> = ({ job, agents, isAdmin, busy, now, onClose, onMove, onSave, onDelete }) => {
  const next = LANES.find((lane) => lane.status === job.status)?.next;
  return <MultiTechnicianJobDetail job={job} agents={agents} isAdmin={isAdmin} busy={busy} now={now} onClose={onClose} onMove={onMove} onSave={onSave} onDelete={onDelete} />;
  return <div className="fixed inset-0 z-[60] flex items-end bg-black/80 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"><section className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-gp-border bg-gp-dark shadow-2xl sm:rounded-2xl"><header className="flex items-start justify-between border-b border-gp-border p-4"><div><p className="font-mono text-[10px] font-bold text-gp-red">{job.job_number}</p><h2 className="mt-1 text-xl font-black uppercase text-white">{job.customer_name}</h2><p className="text-sm text-gp-text-muted">{job.vehicle_details}{job.registration ? ` · ${job.registration}` : ''}</p></div><button onClick={onClose} className="text-xl text-gp-text-muted hover:text-white">×</button></header><div className="grid grid-cols-2 gap-px bg-gp-border"><Info label="Agent" value={job.agent || 'Not added'} /><Info label="Job date" value={jobDateLabel(job.job_date)} /><Info label="Ticket #" value={job.ticket_number || 'Not added'} /><Info label="Paid by" value={job.paid_by || 'Not added'} /><Info label="Technician" value={job.technician || 'Not assigned'} /><Info label="Time in" value={job.started_at ? timeLabel(job.started_at) : 'Not checked in'} /><Info label="Elapsed" value={elapsedTimeLabel(job.started_at, job.completed_at, now)} /></div><form onSubmit={onSave} className="space-y-4 p-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="Agent *"><select required name="agent" defaultValue={job.agent || ''}><option value="">Select agent</option>{agents.map((agent) => <option key={agent} value={agent}>{agent}</option>)}</select></Field><Field label="Job date *"><input required name="job_date" type="date" defaultValue={job.job_date} /></Field><Field label="Ticket #"><input name="ticket_number" defaultValue={job.ticket_number || ''} placeholder="Auto-generated when blank" /></Field><Field label="Paid by"><select name="paid_by" defaultValue={job.paid_by || ''}><option value="">Not recorded</option>{PAID_BY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field><Field label="Technician"><select name="technician" defaultValue={job.technician || ''}><option value="">Unassigned</option>{TECHNICIANS.map((technician) => <option key={technician} value={technician}>{technician}</option>)}</select></Field><Field label="Priority"><select name="priority" defaultValue={job.priority}>{(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as WorkshopPriority[]).map((priority) => <option key={priority}>{priority}</option>)}</select></Field><Field label="Scheduled for"><input name="scheduled_for" type="datetime-local" defaultValue={dateTimeForInput(job.scheduled_for)} /></Field><Field label="Estimated minutes"><input name="estimated_minutes" type="number" min="5" max="1440" defaultValue={job.estimated_minutes || 60} /></Field></div><Field label="Service notes"><textarea name="notes" defaultValue={job.notes || ''} rows={4} placeholder="Add fitting, inspection or customer notes" /></Field><button disabled={busy} className="w-full rounded-lg border border-gp-border bg-gp-panel px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">Save details</button></form><div className="space-y-2 border-t border-gp-border p-4">{next && <button disabled={busy} onClick={() => onMove(next)} className="w-full rounded-lg bg-gp-red px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">Move to {statusLabel(next)} →</button>}{job.status === 'READY' && <button disabled={busy} onClick={() => onMove('COLLECTED')} className="w-full rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-emerald-300">Mark collected</button>}{isAdmin && <button disabled={busy} onClick={onDelete} className="w-full py-2 text-[10px] font-black uppercase tracking-wider text-gp-red/80 hover:text-gp-red">Delete job</button>}</div></section></div>;
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-gp-text-muted">{label}</span><div className="[&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-gp-border [&_input]:bg-gp-input [&_input]:px-3 [&_input]:py-2.5 [&_input]:text-sm [&_input]:text-white [&_input]:outline-none [&_input:focus]:border-gp-red [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-gp-border [&_select]:bg-gp-input [&_select]:px-3 [&_select]:py-2.5 [&_select]:text-sm [&_select]:text-white [&_textarea]:w-full [&_textarea]:resize-none [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-gp-border [&_textarea]:bg-gp-input [&_textarea]:px-3 [&_textarea]:py-2.5 [&_textarea]:text-sm [&_textarea]:text-white [&_textarea]:outline-none [&_textarea:focus]:border-gp-red">{children}</div></label>;

const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => <div className="bg-gp-panel p-3"><p className="text-[9px] font-black uppercase tracking-wider text-gp-text-muted">{label}</p><p className="mt-1 truncate text-xs font-bold text-white">{value}</p></div>;
