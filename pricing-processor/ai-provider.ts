import { IdentificationInput, IdentificationResult, TyreIdentificationProvider } from './types';

export const hasGeminiNanoPromptApi = (): boolean => (
  typeof window !== 'undefined' && 'LanguageModel' in window
);

export class GeminiNanoIdentificationProvider implements TyreIdentificationProvider {
  async identify(_input: IdentificationInput): Promise<IdentificationResult | null> {
    if (!hasGeminiNanoPromptApi()) return null;
    return null;
  }
}
