import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterProvider } from '../../src/providers/openrouter.js';
import type { LLMRequest } from '../../src/types.js';

const mockResponse = {
  id: 'chatcmpl-abc123',
  choices: [{
    message: { content: 'Hello from OpenRouter', tool_calls: undefined },
    finish_reason: 'stop',
  }],
  usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  model: 'qwen/qwen3-235b-a22b:free',
};

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      if (typeof url === 'string' && url.includes('/models')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    provider = new OpenRouterProvider({ apiKey: 'sk-or-test', enabled: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('constructor sets correct default baseUrl', () => {
    expect(provider['baseUrl']).toBe('https://openrouter.ai/api/v1');
  });

  it('getAuthHeaders includes Authorization header', () => {
    const headers = provider['getAuthHeaders']();
    expect(headers['Authorization']).toBe('Bearer sk-or-test');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['HTTP-Referer']).toBe('https://nexus-ai.dev');
    expect(headers['X-Title']).toBe('Nexus-AI');
  });

  it('send() makes correct API call', async () => {
    const request: LLMRequest = {
      model: 'qwen/qwen3-235b-a22b:free',
      messages: [{ role: 'user', content: 'Hello' }],
    };
    const response = await provider.send(request);
    expect(response.content).toBe('Hello from OpenRouter');
    expect(response.model).toBe('qwen/qwen3-235b-a22b:free');
    expect(response.usage.input).toBe(10);
    expect(response.usage.output).toBe(20);
  });

  it('send() parses response correctly', async () => {
    const request: LLMRequest = {
      model: 'qwen/qwen3-235b-a22b:free',
      messages: [{ role: 'user', content: 'Hi' }],
    };
    const response = await provider.send(request);
    expect(response.id).toBe('chatcmpl-abc123');
    expect(response.usage.total).toBe(30);
  });

  it('getModels() fetches and returns models', async () => {
    const models = await provider.getModels();
    expect(Array.isArray(models)).toBe(true);
  });

  it('handles rate limit (429) with retry', async () => {
    vi.restoreAllMocks();
    const rateLimitErr = Object.assign(new Error('Rate limited'), { code: 'RATE_LIMITED', retryable: true, statusCode: 429 });
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(rateLimitErr)
      .mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    const request: LLMRequest = {
      model: 'qwen/qwen3-235b-a22b:free',
      messages: [{ role: 'user', content: 'Hello' }],
    };
    const response = await provider.send(request);
    expect(response.content).toBe('Hello from OpenRouter');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('handles streaming response', async () => {
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
      model: 'qwen/qwen3-235b-a22b:free',
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
});
