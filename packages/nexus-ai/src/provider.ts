import type {
  LLMRequest,
  LLMResponse,
  StreamChunk,
  CostEstimate,
  ModelDefinition,
  ProviderConfig,
} from './types.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { RateLimiter } from './rate-limiter.js';

export abstract class AbstractProvider {
  readonly name: string;
  readonly config: ProviderConfig;
  protected circuitBreaker: CircuitBreaker;
  protected rateLimiter: RateLimiter;
  protected baseUrl: string;

  constructor(name: string, config: ProviderConfig) {
    this.name = name;
    this.config = config;
    this.baseUrl = config.baseUrl ?? this.getDefaultBaseUrl();
    this.circuitBreaker = new CircuitBreaker(name, {
      threshold: 5,
      timeoutMs: 60_000,
    });
    this.rateLimiter = new RateLimiter({
      tokensPerSecond: 10,
      maxTokens: 60,
      provider: name,
    });
  }

  protected abstract getDefaultBaseUrl(): string;

  /** Send a non-streaming request to the LLM. */
  abstract send(request: LLMRequest): Promise<LLMResponse>;

  /** Stream a response from the LLM. Returns an async iterable of chunks. */
  abstract stream(request: LLMRequest): Promise<AsyncIterable<StreamChunk>>;

  /** Count tokens for a given text using a simple estimator. */
  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /** Estimate cost for a given request/response pair. */
  abstract estimateCost(inputTokens: number, outputTokens: number, model: ModelDefinition): CostEstimate;

  /** Check if this provider's circuit breaker is allowing requests. */
  isAvailable(): boolean {
    try {
      this.circuitBreaker.getState();
      return true;
    } catch {
      return false;
    }
  }

  /** Wrap an operation with circuit breaker and rate limiting. */
  protected async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    const maxRetries = this.config.retries ?? 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.rateLimiter.acquire(1, 0);
        return await this.circuitBreaker.execute(fn);
      } catch (error: unknown) {
        const err = error as { code?: string; retryable?: boolean; statusCode?: number };
        const isLastAttempt = attempt === maxRetries;

        if (err.code === 'CIRCUIT_OPEN') {
          throw error;
        }

        if (err.code === 'RATE_LIMITED' && !isLastAttempt) {
          const wait = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 30_000);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }

        if (err.statusCode === 429 && !isLastAttempt) {
          const retryAfter = err.statusCode ? parseInt(String(err.statusCode), 10) * 1000 : 1000;
          await new Promise((r) => setTimeout(r, Math.min(retryAfter, 30_000)));
          continue;
        }

        if (err.retryable && !isLastAttempt) {
          const wait = Math.min(1000 * Math.pow(2, attempt), 30_000);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }

        throw error;
      }
    }

    throw new Error(`Provider ${this.name} failed after ${maxRetries} retries`);
  }

  /** Build standard error from fetch response. */
  protected async buildError(response: Response): Promise<Error> {
    let body: string;
    try {
      body = await response.text();
    } catch {
      body = '';
    }

    let code: string;
    let retryable: boolean;

    switch (response.status) {
      case 401:
      case 403:
        code = 'AUTH_ERROR';
        retryable = false;
        break;
      case 429:
        code = 'RATE_LIMITED';
        retryable = true;
        break;
      case 408:
      case 502:
      case 503:
      case 504:
        code = 'SERVER_ERROR';
        retryable = true;
        break;
      case 400:
        code = 'INVALID_REQUEST';
        retryable = body.includes('context_length') || body.includes('too many tokens');
        break;
      default:
        code = response.status >= 500 ? 'SERVER_ERROR' : 'UNKNOWN';
        retryable = response.status >= 500;
    }

    const msg = body ? `[${code}] ${response.status} ${response.statusText}: ${body.slice(0, 500)}` : `[${code}] ${response.status} ${response.statusText}`;

    const error = new Error(msg) as Error & { code: string; retryable: boolean; statusCode: number };
    error.code = code;
    error.retryable = retryable;
    error.statusCode = response.status;
    return error;
  }

  /** Get auth headers for the provider. Subclasses must override. */
  protected abstract getAuthHeaders(): Record<string, string>;

  /** Common fetch implementation with timeout. */
  protected async fetchWithTimeout(url: string, options: RequestInit & { timeout?: number }): Promise<Response> {
    const timeout = options.timeout ?? this.config.timeout ?? 30_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw Object.assign(new Error(`Request timeout after ${timeout}ms`), {
          code: 'TIMEOUT',
          retryable: true,
          statusCode: 408,
        });
      }
      throw Object.assign(new Error(`Network error: ${(error as Error).message}`), {
        code: 'NETWORK_ERROR',
        retryable: true,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
