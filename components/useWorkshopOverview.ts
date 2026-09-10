import { useCallback, useEffect, useReducer } from 'react';
import { fetchWorkshopBoard, WorkshopBoardResponse } from '../workshopTracker';

export interface OverviewState {
  board: WorkshopBoardResponse | null;
  updatedAt: string | null;
  loading: boolean;
  error: string | null;
}
export type OverviewAction = { type: 'loading' } | { type: 'success'; board: WorkshopBoardResponse; at: string }
  | { type: 'failure'; error: string };
export const initialOverview: OverviewState = { board: null, updatedAt: null, loading: true, error: null };
export function overviewReducer(state: OverviewState, action: OverviewAction): OverviewState {
  if (action.type === 'loading') return { ...state, loading: true };
  if (action.type === 'success') return { board: action.board, updatedAt: action.at, loading: false, error: null };
  return { ...state, loading: false, error: action.error };
}

export function useWorkshopOverview() {
  const [state, dispatch] = useReducer(overviewReducer, initialOverview);
  const [refreshVersion, refresh] = useReducer(value => value + 1, 0);
  const retry = useCallback(() => refresh(), []);
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      dispatch({ type: 'loading' });
      try {
        const board = await fetchWorkshopBoard(controller.signal);
        if (!board.summary || !['active', 'today', 'ready', 'overdue'].every(key =>
          Number.isFinite(board.summary[key as keyof typeof board.summary]))) {
          throw new Error('Workshop summary is unavailable.');
        }
        if (!controller.signal.aborted) dispatch({ type: 'success', board, at: new Date().toISOString() });
      } catch (error) {
        if (!controller.signal.aborted) dispatch({ type: 'failure', error: 'Could not refresh workshop activity.' });
      } finally { inFlight = false; }
    };
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [refreshVersion]);
  return { ...state, retry };
}
