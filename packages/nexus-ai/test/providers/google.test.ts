import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleProvider } from '../../src/providers/google.js';
import type { LLMRequest } from '../../src/types.js';

const mockResponse = {
  candidates: [{
    content: {
      role: 'model',
      parts: [{ text: 'Hello from Gemini' }],
    },
    finishReason: 'STOP',
  }],
  usageMetadata: {
    promptTokenCount: 20,
    candidatesTokenCount: 30,
    totalTokenCount: 50,
  },
};

describe('GoogleProvider', () => {
  let provider: GoogleProvider;

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    provider = new GoogleProvider({ apiKey: 'google-ai-key', enabled: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('constructor sets correct default baseUrl', () => {
    expect(provider['baseUrl']).toBe('https://generativelanguage.googleapis.com/v1beta');
  });

  it('getAuthHeaders has Content-Type but no Authorization', () => {
    const headers = provider['getAuthHeaders']();
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Authorization']).toBeUndefined();
  });

  it('send() makes correct API call and returns response', async () => {
    const request: LLMRequest = {
      model: 'gemini-2.0-flash',
      messages: [{ role: 'user', content: 'Hello' }],
    };
    const response = await provider.send(request);
    expect(response.content).toBe('Hello from Gemini');
    expect(response.usage.input).toBe(20);
    expect(response.usage.output).toBe(30);
    expect(response.usage.total).toBe(50);
  });

  it('send() sends API key as query parameter in URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const request: LLMRequest = {
      model: 'gemini-2.0-flash',
      messages: [{ role: 'user', content: 'Hello' }],
    };
    await provider.send(request);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('key=google-ai-key');
    expect(calledUrl).toContain('generateContent');
  });

  it('send() parses function calls correctly', async () => {
    vi.restoreAllMocks();
    const fcResponse = {
      ...mockResponse,
      candidates: [{
        content: {
          role: 'model',
          parts: [
            { text: 'Checking weather...' },
            { functionCall: { name: 'get_weather', args: { city: 'Tokyo' } } },
          ],
        },
        finishReason: 'STOP',
      }],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(fcResponse), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const request: LLMRequest = {
      model: 'gemini-2.0-flash',
      messages: [{ role: 'user', content: 'Weather in Tokyo?' }],
    };
    const response = await provider.send(request);
    expect(response.toolCalls).toBeDefined();
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0].function.name).toBe('get_weather');
  });

  it('stream() handles SSE stream', async () => {
    vi.restoreAllMocks();
    const streamChunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}],"role":"model"}}]}',
      'data: {"candidates":[{"content":{"parts":[{"text":" world"}],"role":"model"},"finishReason":"STOP"}]}',
      'data: {"usageMetadata":{"promptTokenCount":20,"candidatesTokenCount":30,"totalTokenCount":50}}',
    ].join('\n');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(streamChunks, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    const request: LLMRequest = {
      model: 'gemini-2.0-flash',
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
      id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google' as const, protocol: 'google' as const,
      contextWindow: 1048576, maxOutputTokens: 8192, supportsVision: true, supportsToolUse: true,
      supportsStreaming: true, supportsReasoning: false, inputCostPer1M: 0.1, outputCostPer1M: 0.4,
      tier: 'cheap' as const, isFree: false, isLocal: false, typicalLatency: 1500, qualityScore: 8,
    };
    const est = provider.estimateCost(5000, 2000, model);
    expect(est.inputCost).toBeCloseTo((5000 / 1_000_000) * 0.1, 6);
    expect(est.outputCost).toBeCloseTo((2000 / 1_000_000) * 0.4, 6);
    expect(est.totalCost).toBeCloseTo(est.inputCost + est.outputCost, 6);
  });

  it('handles 403 auth error via buildError', async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('API key not valid', { status: 403, statusText: 'Forbidden' }),
    );
    const request: LLMRequest = {
      model: 'gemini-2.0-flash',
      messages: [{ role: 'user', content: 'Hi' }],
    };
    await expect(provider.send(request)).rejects.toMatchObject({ code: 'AUTH_ERROR', statusCode: 403 });
  });
});
