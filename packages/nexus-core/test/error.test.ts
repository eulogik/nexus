import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NexusError, isNexusError, toNexusError, withRetry } from '../src/error.js';
import { ErrorCode, getRecoveryStrategy, ERROR_RECOVERY_MATRIX } from '../src/types.js';

describe('NexusError', () => {
  it('stores code, message, recoverable properly', () => {
    const err = new NexusError(ErrorCode.SESSION_NOT_FOUND, 'Session missing');
    expect(err.code).toBe(ErrorCode.SESSION_NOT_FOUND);
    expect(err.message).toBe('Session missing');
    expect(err.recoverable).toBe(false);
    expect(err.name).toBe('NexusError');
    expect(err.timestamp).toBeGreaterThan(0);
    expect(err.retryCount).toBe(0);
  });

  it('sets default message from recovery matrix', () => {
    const err = new NexusError(ErrorCode.SESSION_NOT_FOUND);
    expect(err.message).toBe('Session not found. Aborting.');
  });

  it('marks retryable strategies as recoverable', () => {
    const err = new NexusError(ErrorCode.SESSION_SAVE_FAILED);
    expect(err.recoverable).toBe(true);
    expect(err.strategy).toBe('retry');
    expect(err.retryCount).toBe(3);
  });

  it('marks fallback strategies as recoverable', () => {
    const err = new NexusError(ErrorCode.LOOP_MODEL_FAILURE);
    expect(err.recoverable).toBe(true);
    expect(err.strategy).toBe('fallback');
  });

  it('stores context correctly', () => {
    const ctx = { filePath: '/tmp/test.txt', userId: 42 };
    const err = new NexusError(ErrorCode.TOOL_READ_FAILED, 'read error', ctx);
    expect(err.context).toEqual(ctx);
  });

  it('toJSON returns all properties', () => {
    const err = new NexusError(ErrorCode.GIT_NOT_FOUND, 'git error', { branch: 'main' });
    const json = err.toJSON();
    expect(json.code).toBe(ErrorCode.GIT_NOT_FOUND);
    expect(json.message).toBe('git error');
    expect(json.strategy).toBe('degrade');
    expect(json.recoverable).toBe(true);
    expect(json.context).toEqual({ branch: 'main' });
  });
});

describe('isNexusError', () => {
  it('returns true for NexusError instances', () => {
    const err = new NexusError(ErrorCode.UNKNOWN);
    expect(isNexusError(err)).toBe(true);
  });

  it('returns false for plain Error', () => {
    expect(isNexusError(new Error('plain'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isNexusError('string')).toBe(false);
    expect(isNexusError(null)).toBe(false);
    expect(isNexusError(undefined)).toBe(false);
    expect(isNexusError({})).toBe(false);
  });
});

describe('toNexusError', () => {
  it('returns NexusError as-is', () => {
    const original = new NexusError(ErrorCode.TIMEOUT, 'timeout');
    const result = toNexusError(original);
    expect(result).toBe(original);
  });

  it('converts Error to NexusError with default code', () => {
    const result = toNexusError(new Error('something broke'));
    expect(result).toBeInstanceOf(NexusError);
    expect(result.code).toBe(ErrorCode.UNKNOWN);
    expect(result.message).toBe('something broke');
  });

  it('converts string to NexusError', () => {
    const result = toNexusError('just a string');
    expect(result).toBeInstanceOf(NexusError);
    expect(result.message).toBe('just a string');
  });

  it('converts with custom default code', () => {
    const result = toNexusError(new Error('config error'), ErrorCode.CONFIG_INVALID);
    expect(result.code).toBe(ErrorCode.CONFIG_INVALID);
  });

  it('converts null/undefined gracefully', () => {
    const result = toNexusError(null);
    expect(result.message).toBe('null');
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('succeeds on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, { maxRetries: 3 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure up to maxRetries then throws', async () => {
    const fn = vi.fn().mockImplementation(() => {
      throw new NexusError(ErrorCode.TOOL_READ_FAILED, 'fail');
    });
    const retrySpy = vi.fn();

    const promise = withRetry(fn, { maxRetries: 3, onRetry: retrySpy });
    promise.catch(() => {});

    for (let i = 0; i < 3; i++) {
      await vi.runAllTimersAsync();
    }

    await expect(promise).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(4);
    expect(retrySpy).toHaveBeenCalledTimes(3);
  });

  it('succeeds on nth attempt', async () => {
    let attempts = 0;
    const fn = vi.fn().mockImplementation(() => {
      attempts++;
      if (attempts < 3) throw new NexusError(ErrorCode.TOOL_READ_FAILED, 'not yet');
      return 'finally';
    });

    const promise = withRetry(fn, { maxRetries: 5 });

    for (let i = 0; i < 2; i++) {
      await vi.runAllTimersAsync();
    }

    const result = await promise;
    expect(result).toBe('finally');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws immediately for non-recoverable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new NexusError(ErrorCode.SESSION_NOT_FOUND, 'abort'));

    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow('abort');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry when maxRetries is 0', async () => {
    const fn = vi.fn().mockRejectedValue(new NexusError(ErrorCode.TOOL_READ_FAILED, 'fail'));

    await expect(withRetry(fn, { maxRetries: 0 })).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('getRecoveryStrategy', () => {
  it('returns correct strategy for known error codes', () => {
    expect(getRecoveryStrategy(ErrorCode.SESSION_NOT_FOUND).strategy).toBe('abort');
    expect(getRecoveryStrategy(ErrorCode.SESSION_SAVE_FAILED).strategy).toBe('retry');
    expect(getRecoveryStrategy(ErrorCode.LOOP_MODEL_FAILURE).strategy).toBe('fallback');
    expect(getRecoveryStrategy(ErrorCode.LOOP_COMPRESSION_FAILED).strategy).toBe('skip');
    expect(getRecoveryStrategy(ErrorCode.GIT_NOT_FOUND).strategy).toBe('degrade');
    expect(getRecoveryStrategy(ErrorCode.APPROVAL_PENDING).strategy).toBe('ask_user');
  });

  it('returns default for unknown codes', () => {
    const result = getRecoveryStrategy('Z-999' as ErrorCode);
    expect(result.strategy).toBe('abort');
    expect(result.retryCount).toBe(0);
    expect(result.message).toBe('Unknown error code.');
  });

  it('returns correct retryCount for known codes', () => {
    expect(getRecoveryStrategy(ErrorCode.SESSION_NOT_FOUND).retryCount).toBe(0);
    expect(getRecoveryStrategy(ErrorCode.SESSION_SAVE_FAILED).retryCount).toBe(3);
    expect(getRecoveryStrategy(ErrorCode.TOOL_BASH_FAILED).retryCount).toBe(1);
    expect(getRecoveryStrategy(ErrorCode.TOOL_READ_FAILED).retryCount).toBe(2);
  });
});

describe('ERROR_RECOVERY_MATRIX', () => {
  const knownCodesInMatrix = new Set(ERROR_RECOVERY_MATRIX.map((e) => e.code));

  it('contains entries for all ErrorCode values defined in the matrix', () => {
    const codesInMatrix = ERROR_RECOVERY_MATRIX.map((e) => e.code);
    expect(codesInMatrix.length).toBeGreaterThan(0);
    for (const entry of ERROR_RECOVERY_MATRIX) {
      expect(Object.values(ErrorCode)).toContain(entry.code);
    }
  });

  it('all entries have valid strategies', () => {
    const validStrategies = ['retry', 'fallback', 'abort', 'skip', 'degrade', 'ask_user'];
    for (const entry of ERROR_RECOVERY_MATRIX) {
      expect(validStrategies).toContain(entry.strategy);
    }
  });

  it('each error code in the matrix has a unique entry', () => {
    const codes = ERROR_RECOVERY_MATRIX.map((e) => e.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });
});
