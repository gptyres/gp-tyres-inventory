import type { StockMovementSummary } from './types';

const FINANCIAL_STAFF = new Set(['NOOR', 'MAC', 'RAFIEK']);
const FINANCIAL_TERMINALS = new Set(['GP1', 'GP2', 'GP6']);

const normalizeIdentity = (identity: string) => identity.trim().toUpperCase();

export const canViewStockMovementFinancials = (identity: string, isAdmin = false) => {
  if (isAdmin) return true;
  const normalized = normalizeIdentity(identity);
  return FINANCIAL_STAFF.has(normalized) || FINANCIAL_TERMINALS.has(normalized);
};

export const maskStockMovementFinancials = (
  summary: StockMovementSummary,
  canViewFinancials: boolean
): StockMovementSummary => {
  if (canViewFinancials) return summary;
  return {
    ...summary,
    costValueToday: 0,
    retailValueToday: 0
  };
};
