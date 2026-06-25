import { DEFAULT_PRICING_RULES, PRICING_SESSION_STORAGE_KEY } from './constants';
import { PricingProcessorSessionState } from './types';

export const createEmptyPricingSession = (): PricingProcessorSessionState => ({
  rawData: '',
  rules: DEFAULT_PRICING_RULES,
  mode: 'standard',
  frontSize: '',
  rearSize: '',
  selectedPanel: 'standard',
  result: null
});

export const loadPricingSession = (): PricingProcessorSessionState => {
  if (typeof window === 'undefined') return createEmptyPricingSession();

  try {
    const stored = window.sessionStorage.getItem(PRICING_SESSION_STORAGE_KEY);
    if (!stored) return createEmptyPricingSession();
    const parsed = JSON.parse(stored) as Partial<PricingProcessorSessionState>;
    return {
      ...createEmptyPricingSession(),
      ...parsed,
      rules: {
        ...DEFAULT_PRICING_RULES,
        ...(parsed.rules ?? {})
      }
    };
  } catch {
    return createEmptyPricingSession();
  }
};

export const savePricingSession = (state: PricingProcessorSessionState): void => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(PRICING_SESSION_STORAGE_KEY, JSON.stringify(state));
};

export const clearPricingSession = (): void => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(PRICING_SESSION_STORAGE_KEY);
};
