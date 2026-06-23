import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from '../../src/providers/openai.js';
import type { LLMRequest } from '../../src/types.js';

const mockResponse = {
  id: 'chatcmpl-xyz789',
  object: 'chat.completion',
  created: 1700000000,
  model: 'gpt-4o',
  choices: [{
    index: 0,
    message: { role: 'assistant', content: 'Hello from OpenAI' },
    finish_reason: 'stop',
  }],
  usage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 },
};

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    provider = new OpenAIProvider({ apiKey: 'sk-openai-test', enabled: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('constructor sets correct default baseUrl', () => {
    expect(provider['baseUrl']).toBe('https://api.openai.com/v1');
  });

  it('getAuthHeaders includes Bearer token', () => {
    const headers = provider['getAuthHeaders']();
    expect(headers['Authorization']).toBe('Bearer sk-openai-test');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('send() makes correct API call and returns response', async () => {
    const request: LLMRequest = {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hi' }],
    };
    const response = await provider.send(request);
    expect(response.content).toBe('Hello from OpenAI');
    expect(response.model).toBe('gpt-4o');
    expect(response.usage.input).toBe(15);
    expect(response.usage.output).toBe(25);
    expect(response.usage.total).toBe(40);
  });

  it('send() parses tool calls correctly', async () => {
    vi.restoreAllMocks();
    const toolResponse = {
      ...mockResponse,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_123',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"London"}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(toolResponse), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const request: LLMRequest = {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Weather?' }],
    };
    const response = await provider.send(request);
    expect(response.toolCalls).toBeDefined();
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0].function.name).toBe('get_weather');
  });

  it('stream() handles SSE stream', async () => {
    vi.restoreAllMocks();
    const streamChunks = [
      'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
      'data: [DONE]',
    ].join('\n');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(streamChunks, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    const request: LLMRequest = {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hi' }],
      stream: true,
    };
    const iterable = await provider.stream(request);
    const chunks: any[] = [];
    for await (const chunk of iterable) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some((c) => c.type === 'text' && c.content === 'Hello')).toBe(true);
  });

  it('estimateCost calculates correctly', () => {
    const model = {
      id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' as const, protocol: 'openai' as const,
      contextWindow: 128000, maxOutputTokens: 16384, supportsVision: true, supportsToolUse: true,
      supportsStreaming: true, supportsReasoning: false, inputCostPer1M: 2.5, outputCostPer1M: 10,
      tier: 'standard' as const, isFree: false, isLocal: false, typicalLatency: 1500, qualityScore: 9,
    };
    const est = provider.estimateCost(1000, 500, model);
    expect(est.inputCost).toBe((1000 / 1_000_000) * 2.5);
    expect(est.outputCost).toBe((500 / 1_000_000) * 10);
    expect(est.totalCost).toBe(est.inputCost + est.outputCost);
  });

  it('handles 401 auth error via buildError', async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Invalid API key', { status: 401, statusText: 'Unauthorized' }),
    );
    const request: LLMRequest = {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hi' }],
    };
    await expect(provider.send(request)).rejects.toMatchObject({ code: 'AUTH_ERROR', statusCode: 401 });
  });
});
