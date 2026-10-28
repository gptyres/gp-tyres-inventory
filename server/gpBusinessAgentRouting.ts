export type AgentModel = 'gpt-6-luna' | 'gpt-4.1-mini';

// Unknown or contextual tasks always use the tool-capable default. The cheap
// tier is deliberately limited to generic, non-product-specific writing.
export const selectAgentModel = (message: string): AgentModel => {
  const value = String(message || '').trim().toLowerCase();
  const isWriting = /\b(write|draft|create|compose)\b/.test(value);
  const isGenericWriting = /\b(welcome|greeting|thank[ -]?you|facebook post|social media post|marketing post)\b/.test(value);
  const needsContext = /\b(stock|inventory|supplier|available|availability|price|pricing|cost|margin|profit|quote|quotation|fit|fits|fitment|vehicle|wheel|rim|tyre|tire|product|this|that|these|those|model|customer details|order)\b|\d/.test(value);
  return isWriting && isGenericWriting && !needsContext ? 'gpt-6-luna' : 'gpt-4.1-mini';
};

export const requestOpenAICompletion = async (
  apiKey: string,
  model: AgentModel,
  messages: any[],
  tools: any[],
) => {
  if (model !== 'gpt-6-luna' && model !== 'gpt-4.1-mini') throw new Error('Unsupported agent model.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model, messages, tools, tool_choice: 'auto', stream: false,
        ...(model === 'gpt-6-luna'
          ? { reasoning_effort: 'none', max_completion_tokens: 1024 }
          : { temperature: 0.15, max_tokens: 1024 })
      })
    });
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403
        ? 'OpenAI authentication failed. An administrator should check the API key and project permissions.'
        : response.status === 429
          ? 'OpenAI is rate-limited or the project has no available credits. Please check billing or try again.'
          : `OpenAI is temporarily unavailable (provider status ${response.status}).`;
      const error = new Error(message);
      (error as any).publicStatus = 503;
      throw error;
    }
    const payload = await response.json().catch(() => null);
    const message = payload?.choices?.[0]?.message;
    if (!message || message.role !== 'assistant') {
      const error = new Error('OpenAI returned an invalid response.');
      (error as any).publicStatus = 503;
      throw error;
    }
    return message;
  } catch (error) {
    if ((error as any)?.publicStatus) throw error;
    const timedOut = error instanceof Error && error.name === 'AbortError';
    const safeError = new Error(timedOut ? 'OpenAI timed out. Please retry.' : 'OpenAI connection failed. Please retry.');
    (safeError as any).publicStatus = 503;
    throw safeError;
  } finally {
    clearTimeout(timeout);
  }
};
