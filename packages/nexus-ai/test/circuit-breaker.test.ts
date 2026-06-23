import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker } from '../src/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new CircuitBreaker('test', { threshold: 3, timeoutMs: 5000, halfOpenMaxRequests: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in closed state', () => {
    expect(breaker.getState()).toBe('closed');
  });

  it('executes function successfully', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await breaker.execute(fn);
    expect(result).toBe('success');
    expect(breaker.getState()).toBe('closed');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('trips after threshold failures', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
    }
    expect(breaker.getState()).toBe('open');
  });

  it('rejects when open', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow();
    }
    await expect(breaker.execute(fn)).rejects.toThrow("Circuit breaker 'test' is open");
    expect(breaker.getState()).toBe('open');
  });

  it('transitions to half-open after timeout', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow();
    }
    expect(breaker.getState()).toBe('open');
    vi.advanceTimersByTime(5000);
    expect(breaker.getState()).toBe('half-open');
  });

  it('succeeds in half-open and resets to closed', async () => {
    const failFn = vi.fn().mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failFn)).rejects.toThrow();
    }
    vi.advanceTimersByTime(5000);
    expect(breaker.getState()).toBe('half-open');
    const successFn = vi.fn().mockResolvedValue('recovered');
    const result = await breaker.execute(successFn);
    expect(result).toBe('recovered');
    expect(breaker.getState()).toBe('closed');
  });

  it('fails in half-open and reopens', async () => {
    const failFn = vi.fn().mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failFn)).rejects.toThrow();
    }
    vi.advanceTimersByTime(5000);
    expect(breaker.getState()).toBe('half-open');
    await expect(breaker.execute(failFn)).rejects.toThrow('fail');
    expect(breaker.getState()).toBe('open');
  });

  it('reset() returns to closed', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow();
    }
    expect(breaker.getState()).toBe('open');
    breaker.reset();
    expect(breaker.getState()).toBe('closed');
    const successFn = vi.fn().mockResolvedValue('ok');
    await expect(breaker.execute(successFn)).resolves.toBe('ok');
  });
});
