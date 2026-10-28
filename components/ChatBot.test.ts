import { describe, expect, it } from 'vitest';
import { getAgentErrorMessage } from './ChatBot';

describe('agent error messages', () => {
  it('identifies the OpenAI configuration without referring to the old provider', () => {
    const message = getAgentErrorMessage(new Error('The GP Business Agent is not configured yet.'));
    expect(message).toContain('OpenAI');
    expect(message).not.toContain('NVIDIA');
  });

  it('does not promise stock searches will work during an OpenAI rate limit', () => {
    const message = getAgentErrorMessage(new Error('OpenAI is rate-limited or the project has no available credits.'));
    expect(message).not.toContain('GLM');
    expect(message).not.toContain('will keep working');
    expect(message).toMatch(/rate|credit/i);
  });
});
