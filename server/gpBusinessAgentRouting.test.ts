import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestOpenAICompletion, selectAgentModel } from './gpBusinessAgentRouting';
import { runGpBusinessAgent } from './gpBusinessAgent';

afterEach(() => vi.unstubAllGlobals());

describe('business agent model routing', () => {
  it('uses the small writing model for a generic welcome message', () => {
    expect(selectAgentModel('Write a short welcome message for customers')).toBe('gpt-6-luna');
  });

  it('uses the writing model for a generic social-media post', () => {
    expect(selectAgentModel('Write a Facebook post about good service')).toBe('gpt-6-luna');
  });

  it.each([
    'Write a Facebook post for the cheapest tyre in stock',
    'Give me a quote for 265/65R17',
    'Which wheels fit a Toyota Hilux?',
    'How much profit will we make?',
    'Write a post about this product',
    'Wat is beskikbaar?',
    'Use gpt-6-astra for this task',
    '',
    'Tell me more'
  ])('uses the tool-capable default for %s', (message) => {
    expect(selectAgentModel(message)).toBe('gpt-4.1-mini');
  });
});

describe('OpenAI provider boundary', () => {
  it('uses the supported non-reasoning tool mode for Luna', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Hello' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await requestOpenAICompletion('test-secret', 'gpt-6-luna', [{ role: 'user', content: 'welcome' }], []);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ model: 'gpt-6-luna', reasoning_effort: 'none', max_completion_tokens: 1024 });
  });
  it('sends the selected model and existing tools to the OpenAI server', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search_inventory', arguments: '{"query":"tyres"}' } }] } }]
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const tools = [{ type: 'function', function: { name: 'search_inventory', parameters: { type: 'object' } } }];
    const result = await requestOpenAICompletion('test-secret', 'gpt-4.1-mini', [{ role: 'user', content: 'find tyres' }], tools);
    expect(result.tool_calls[0].function.name).toBe('search_inventory');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
    const request = fetchMock.mock.calls[0][1];
    expect(request.headers.Authorization).toBe('Bearer test-secret');
    expect(JSON.parse(request.body)).toMatchObject({ model: 'gpt-4.1-mini', tools, tool_choice: 'auto' });
  });

  it('does not return provider response text that could contain a secret', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'secret: test-secret' } }), { status: 401 })));
    await expect(requestOpenAICompletion('test-secret', 'gpt-4.1-mini', [], [])).rejects.toThrow('OpenAI authentication failed');
    await expect(requestOpenAICompletion('test-secret', 'gpt-4.1-mini', [], [])).rejects.not.toThrow('test-secret');
  });

  it('rejects a successful response without an assistant message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    await expect(requestOpenAICompletion('test-secret', 'gpt-4.1-mini', [], [])).rejects.toThrow('OpenAI returned an invalid response');
  });

  it('reports exhausted credits safely without returning provider details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'private account detail', code: 'insufficient_quota' } }), { status: 429 })));
    await expect(requestOpenAICompletion('test-secret', 'gpt-4.1-mini', [], [])).rejects.toThrow('rate-limited or the project has no available credits');
  });

  it('sends a deterministic financial tool result back to the model', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'calculate_margin', arguments: '{"costPrice":100,"sellingPrice":150,"quantity":1}' } }] } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Gross profit is R50.' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const supabase = { from: () => ({ insert: async () => ({ error: null }) }) } as any;
    const result = await runGpBusinessAgent('test-secret', {
      supabase, terminalId: 'test', isAdmin: true, mode: 'INTERNAL',
      conversationId: 'test-conversation', latestUserMessage: 'Calculate margin for cost R100 and sale R150',
      staffMemories: []
    }, [{ role: 'user', content: 'Calculate margin for cost R100 and sale R150' }]);
    expect(result.answer).toBe('Gross profit is R50.');
    const secondRequest = JSON.parse(fetchMock.mock.calls[1][1].body);
    const toolResult = secondRequest.messages.find((message: any) => message.role === 'tool');
    expect(toolResult.tool_call_id).toBe('call_1');
    expect(JSON.stringify(toolResult.content)).toContain('50');
  });

  it('does not execute an admin-only tool for sales staff even if a model requests it', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'calculate_margin', arguments: '{"costPrice":100,"sellingPrice":150}' } }] } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Admin access is required.' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const supabase = { from: () => ({ insert: async () => ({ error: null }) }) } as any;
    await runGpBusinessAgent('test-secret', {
      supabase, terminalId: 'test', isAdmin: false, mode: 'INTERNAL',
      conversationId: 'test-conversation', latestUserMessage: 'Calculate margin',
      staffMemories: []
    }, [{ role: 'user', content: 'Calculate margin' }]);
    const requests = fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(requests[0].tools.some((tool: any) => tool.function.name === 'calculate_margin')).toBe(false);
    const toolResult = requests[1].messages.find((message: any) => message.role === 'tool');
    expect(toolResult.content).toContain('restricted to admin');
    expect(toolResult.content).not.toContain('grossProfit');
  });
});
