import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter, backoffDelay } from '../src/rate-limiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter({ tokensPerSecond: 10, maxTokens: 60, provider: 'test' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tryConsume() returns true when tokens available', () => {
    expect(limiter.tryConsume(1)).toBe(true);
    expect(limiter.tryConsume(10)).toBe(true);
    expect(limiter.tryConsume(49)).toBe(true);
  });

  it('tryConsume() returns false when exhausted', () => {
    expect(limiter.tryConsume(60)).toBe(true);
    expect(limiter.tryConsume(1)).toBe(false);
  });

  it('acquire() resolves when tokens available', async () => {
    await expect(limiter.acquire(1)).resolves.toBeUndefined();
    await expect(limiter.acquire(59)).resolves.toBeUndefined();
  });

  it('getWaitTime() returns 0 when available', () => {
    expect(limiter.getWaitTime()).toBe(0);
  });

  it('getWaitTime() returns >0 when throttled', () => {
    limiter.tryConsume(60);
    const waitTime = limiter.getWaitTime();
    expect(waitTime).toBeGreaterThan(0);
  });

  it('utilization returns 0-1 value', () => {
    expect(limiter.utilization).toBe(0);
    limiter.tryConsume(30);
    expect(limiter.utilization).toBeCloseTo(0.5, 2);
    limiter.tryConsume(30);
    expect(limiter.utilization).toBeCloseTo(1, 2);
  });

  it('reset() restores tokens', () => {
    limiter.tryConsume(60);
    expect(limiter.tryConsume(1)).toBe(false);
    limiter.reset();
    expect(limiter.tryConsume(1)).toBe(true);
  });

  it('backoffDelay produces increasing delays', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const d1 = backoffDelay(0, 1000, 60000);
    const d2 = backoffDelay(1, 1000, 60000);
    const d3 = backoffDelay(2, 1000, 60000);
    expect(d2).toBeGreaterThan(d1);
    expect(d3).toBeGreaterThan(d2);
    vi.restoreAllMocks();
  });

  it('backoffDelay respects maxMs', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const d = backoffDelay(10, 1000, 5000);
    expect(d).toBe(5000);
    vi.restoreAllMocks();
  });
});
