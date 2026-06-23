import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicProvider } from '../../src/providers/anthropic.js';
import type { LLMRequest } from '../../src/types.js';

const mockResponse = {
  id: 'msg_abc123',
  type: 'message',
  role: 'assistant',
  content: [{ type: 'text', text: 'Hello from Claude' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 12, output_tokens: 18 },
  model: 'claude-sonnet-4-20250514',
};

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    provider = new AnthropicProvider({ apiKey: 'sk-ant-test', enabled: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('constructor sets correct default baseUrl', () => {
    expect(provider['baseUrl']).toBe('https://api.anthropic.com/v1');
  });

  it('getAuthHeaders includes x-api-key', () => {
    const headers = provider['getAuthHeaders']();
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('send() makes correct API call and returns response', async () => {
    const request: LLMRequest = {
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'Hello' }],
    };
    const response = await provider.send(request);
    expect(response.content).toBe('Hello from Claude');
    expect(response.model).toBe('claude-sonnet-4-20250514');
    expect(response.usage.input).toBe(12);
    expect(response.usage.output).toBe(18);
    expect(response.usage.total).toBe(30);
  });

  it('send() parses tool_use content blocks', async () => {
    vi.restoreAllMocks();
    const toolResponse = {
      ...mockResponse,
      content: [
        { type: 'text', text: 'I will check the weather.' },
        { type: 'tool_use', id: 'toolu_123', name: 'get_weather', input: { city: 'London' } },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(toolResponse), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const request: LLMRequest = {
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'Weather in London?' }],
    };
    const response = await provider.send(request);
    expect(response.toolCalls).toBeDefined();
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0].function.name).toBe('get_weather');
    expect(response.toolCalls![0].function.arguments).toBe('{"city":"London"}');
  });

  it('stream() handles SSE stream', async () => {
    vi.restoreAllMocks();
    const streamData = [
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}',
      'data: {"type":"content_block_stop","index":0}',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":12,"output_tokens":18}}',
    ].join('\n');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(streamData, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    const request: LLMRequest = {
      model: 'claude-sonnet-4-20250514',
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
      id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' as const, protocol: 'anthropic' as const,
      contextWindow: 200000, maxOutputTokens: 8192, supportsVision: true, supportsToolUse: true,
      supportsStreaming: true, supportsReasoning: false, inputCostPer1M: 3, outputCostPer1M: 15,
      tier: 'standard' as const, isFree: false, isLocal: false, typicalLatency: 2000, qualityScore: 9,
    };
    const est = provider.estimateCost(2000, 1000, model);
    expect(est.inputCost).toBeCloseTo((2000 / 1_000_000) * 3, 6);
    expect(est.outputCost).toBeCloseTo((1000 / 1_000_000) * 15, 6);
  });

  it('handles 429 rate limit via buildError', async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Rate limited', { status: 429, statusText: 'Too Many Requests' }),
    );
    const request: LLMRequest = {
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'Hi' }],
    };
    await expect(provider.send(request)).rejects.toMatchObject({ code: 'RATE_LIMITED', statusCode: 429 });
  });
});
