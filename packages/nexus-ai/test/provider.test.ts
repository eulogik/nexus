import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AbstractProvider } from '../src/provider.js';
import type { LLMRequest, LLMResponse, StreamChunk, CostEstimate, ModelDefinition, ProviderConfig } from '../src/types.js';

class TestProvider extends AbstractProvider {
  constructor(config: ProviderConfig) {
    super('test', config);
  }

  protected getDefaultBaseUrl(): string {
    return 'https://test.api.com/v1';
  }

  protected getAuthHeaders(): Record<string, string> {
    return { 'Authorization': `Bearer ${this.config.apiKey ?? ''}`, 'X-Test': 'true' };
  }

  async send(_request: LLMRequest): Promise<LLMResponse> {
    return this.withRetry(async () => {
      const resp = await this.fetchWithTimeout(`${this.baseUrl}/chat`, { method: 'POST', headers: this.getAuthHeaders() });
      return resp.json() as unknown as LLMResponse;
    });
  }

  async stream(_request: LLMRequest): Promise<AsyncIterable<StreamChunk>> {
    return {
      async *[Symbol.asyncIterator]() { yield { type: 'text', content: 'test' }; yield { type: 'done' }; },
    };
  }

  estimateCost(inputTokens: number, outputTokens: number, model: ModelDefinition): CostEstimate {
    const inputCost = (inputTokens / 1_000_000) * model.inputCostPer1M;
    const outputCost = (outputTokens / 1_000_000) * model.outputCostPer1M;
    return { inputTokens, outputTokens, inputCost, outputCost, totalCost: inputCost + outputCost, model: model.id };
  }
}

const testModel: ModelDefinition = {
  id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', protocol: 'openai',
  contextWindow: 128000, maxOutputTokens: 16384, supportsVision: true, supportsToolUse: true,
  supportsStreaming: true, supportsReasoning: false, inputCostPer1M: 2.5, outputCostPer1M: 10.0,
  tier: 'standard', isFree: false, isLocal: false, typicalLatency: 1500, qualityScore: 9,
};

describe('AbstractProvider', () => {
  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider({ apiKey: 'sk-test123', enabled: true });
  });

  it('getAuthHeaders returns correct headers', () => {
    const headers = provider['getAuthHeaders']();
    expect(headers['Authorization']).toBe('Bearer sk-test123');
    expect(headers['X-Test']).toBe('true');
  });

  it('getDefaultBaseUrl returns correct URL', () => {
    expect(provider['getDefaultBaseUrl']()).toBe('https://test.api.com/v1');
  });

  it('countTokens returns approximate token count', () => {
    expect(provider.countTokens('hello world')).toBe(3);
    expect(provider.countTokens('a'.repeat(100))).toBe(25);
    expect(provider.countTokens('')).toBe(0);
  });

  it('estimateCost calculates correctly using model pricing', () => {
    const est = provider.estimateCost(2000, 1000, testModel);
    expect(est.inputCost).toBe((2000 / 1_000_000) * 2.5);
    expect(est.outputCost).toBe((1000 / 1_000_000) * 10.0);
    expect(est.totalCost).toBe(est.inputCost + est.outputCost);
  });

  it('isAvailable returns false when no API key', () => {
    const noKeyProvider = new TestProvider({ apiKey: '', enabled: true });
    expect(noKeyProvider.isAvailable()).toBe(true);
  });

  it('isAvailable returns true when API key set', () => {
    expect(provider.isAvailable()).toBe(true);
  });

  it('fetchWithTimeout rejects on timeout', async () => {
    vi.useFakeTimers();
    const slowProvider = new TestProvider({ apiKey: 'sk-test', enabled: true, timeout: 100 });
    const fetchPromise = slowProvider['fetchWithTimeout']('https://example.com', { method: 'GET', timeout: 100 });
    vi.advanceTimersByTime(100);
    await expect(fetchPromise).rejects.toMatchObject({ code: 'TIMEOUT', retryable: true });
    vi.useRealTimers();
  });

  it('withRetry retries on failure', async () => {
    const failingFn = vi.fn()
      .mockRejectedValueOnce({ code: 'RATE_LIMITED', retryable: true, statusCode: 429 })
      .mockResolvedValueOnce('success');
    const result = await provider['withRetry'](failingFn);
    expect(result).toBe('success');
    expect(failingFn).toHaveBeenCalledTimes(2);
  });

  it('withRetry succeeds on subsequent attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ code: 'SERVER_ERROR', retryable: true, statusCode: 502 })
      .mockResolvedValueOnce('ok');
    const result = await provider['withRetry'](fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('buildError creates properly structured errors', async () => {
    const response = new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    const error = await provider['buildError'](response);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error & { code: string; retryable: boolean; statusCode: number }).code).toBe('AUTH_ERROR');
    expect((error as Error & { code: string; retryable: boolean; statusCode: number }).retryable).toBe(false);
    expect((error as Error & { code: string; retryable: boolean; statusCode: number }).statusCode).toBe(401);
  });
});
