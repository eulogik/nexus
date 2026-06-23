type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerOptions {
  threshold: number;
  timeoutMs: number;
  halfOpenMaxRequests: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  threshold: 5,
  timeoutMs: 60_000,
  halfOpenMaxRequests: 1,
};

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenRequests = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(name: string, options?: Partial<CircuitBreakerOptions>) {
    this.name = name;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  readonly name: string;

  getState(): CircuitState {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.options.timeoutMs) {
        this.state = 'half-open';
        this.halfOpenRequests = 0;
      }
    }
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.getState();

    if (state === 'open') {
      throw Object.assign(new Error(`Circuit breaker '${this.name}' is open`), {
        code: 'CIRCUIT_OPEN',
        retryable: true,
      });
    }

    if (state === 'half-open') {
      if (this.halfOpenRequests >= this.options.halfOpenMaxRequests) {
        throw Object.assign(new Error(`Circuit breaker '${this.name}' half-open limit reached`), {
          code: 'CIRCUIT_OPEN',
          retryable: true,
        });
      }
      this.halfOpenRequests++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.halfOpenRequests = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.options.threshold) {
      this.state = 'open';
    }
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.halfOpenRequests = 0;
  }
}
