import { ErrorCode, getRecoveryStrategy, type RecoveryStrategy } from './types.js';

export class NexusError extends Error {
  public readonly code: ErrorCode;
  public readonly recoverable: boolean;
  public readonly strategy: RecoveryStrategy;
  public readonly retryCount: number;
  public readonly timestamp: number;
  public readonly context?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, context?: Record<string, unknown>) {
    const entry = getRecoveryStrategy(code);
    super(message ?? entry.message);
    this.name = 'NexusError';
    this.code = code;
    this.strategy = entry.strategy;
    this.retryCount = entry.retryCount;
    this.recoverable = entry.strategy !== 'abort';
    this.timestamp = Date.now();
    this.context = context;
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      strategy: this.strategy,
      recoverable: this.recoverable,
      retryCount: this.retryCount,
      timestamp: this.timestamp,
      context: this.context,
    };
  }
}

export function isNexusError(error: unknown): error is NexusError {
  return error instanceof NexusError;
}

export function toNexusError(error: unknown, defaultCode: ErrorCode = ErrorCode.UNKNOWN): NexusError {
  if (error instanceof NexusError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new NexusError(defaultCode, message);
}

export interface RetryState {
  attempt: number;
  maxRetries: number;
  lastError: NexusError | null;
}

export function createRetryState(maxRetries: number): RetryState {
  return { attempt: 0, maxRetries, lastError: null };
}

export function canRetry(state: RetryState): boolean {
  return state.attempt < state.maxRetries;
}

export function getBackoffDelay(state: RetryState, baseMs = 1000): number {
  const exp = Math.min(baseMs * Math.pow(2, state.attempt), 30_000);
  const jitter = exp * 0.5 * Math.random();
  return Math.floor(exp + jitter);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    onRetry?: (error: NexusError, attempt: number) => void;
    context?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const state = createRetryState(maxRetries);

  while (true) {
    try {
      return await fn();
    } catch (error: unknown) {
      const nexusError = toNexusError(error);
      state.lastError = nexusError;

      if (!canRetry(state) || !nexusError.recoverable) {
        throw nexusError;
      }

      state.attempt++;
      options.onRetry?.(nexusError, state.attempt);
      const delay = getBackoffDelay(state, baseDelayMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
