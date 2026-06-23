interface RateLimiterOptions {
  tokensPerSecond: number;
  maxTokens: number;
  provider: string;
}

export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private tokensPerSecond: number;
  private lastRefill: number;
  private queue: Array<{ resolve: () => void; reject: (err: Error) => void; priority: number }> = [];
  private processing = false;
  readonly provider: string;

  constructor(options: RateLimiterOptions) {
    this.tokens = options.maxTokens;
    this.maxTokens = options.maxTokens;
    this.tokensPerSecond = options.tokensPerSecond;
    this.lastRefill = Date.now();
    this.provider = options.provider;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.tokensPerSecond;
    if (newTokens > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
      this.lastRefill = now;
    }
  }

  /** Try to consume a token without waiting. Returns true if successful. */
  tryConsume(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  /** Wait until a token is available, then consume it. */
  async acquire(count = 1, priority = 0): Promise<void> {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return;
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject, priority });
      this.queue.sort((a, b) => b.priority - a.priority);
      if (!this.processing) {
        this.processing = true;
        this.processQueue();
      }
    });
  }

  private processQueue(): void {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.refill();

    if (this.tokens <= 0) {
      const waitTime = Math.ceil((1 / this.tokensPerSecond) * 1000);
      setTimeout(() => this.processQueue(), Math.min(waitTime, 100));
      return;
    }

    while (this.queue.length > 0 && this.tokens > 0) {
      const entry = this.queue.shift()!;
      this.tokens--;
      entry.resolve();
    }

    if (this.queue.length > 0) {
      setTimeout(() => this.processQueue(), Math.min(Math.ceil((1 / this.tokensPerSecond) * 1000), 100));
    } else {
      this.processing = false;
    }
  }

  /** Get wait time in ms before a token is available. */
  getWaitTime(): number {
    this.refill();
    if (this.tokens > 0) return 0;
    return Math.ceil((1 / this.tokensPerSecond) * 1000);
  }

  get utilization(): number {
    return 1 - this.tokens / this.maxTokens;
  }

  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.queue = [];
    this.processing = false;
  }
}

/** Exponential backoff with jitter */
export function backoffDelay(attempt: number, baseMs = 1000, maxMs = 60_000): number {
  const exp = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  const jitter = exp * 0.5 * Math.random();
  return exp + jitter;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
