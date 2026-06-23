import { describe, it, expect } from 'vitest';
import { countTokens, countMessageTokens, countToolOutputTokens } from '../src/token-counter.js';
import type { Message } from '../src/types.js';

describe('countTokens', () => {
  it('returns ~text.length/4 for English text', () => {
    const text = 'Hello world this is a test of the token counter function';
    const result = countTokens(text);
    expect(result).toBeGreaterThanOrEqual(1);
    const ratio = text.length / result;
    expect(ratio).toBeGreaterThan(2);
    expect(ratio).toBeLessThan(6);
  });

  it('returns 0 for empty string', () => {
    expect(countTokens('')).toBe(0);
  });

  it('returns 0 for falsy input', () => {
    expect(countTokens('')).toBe(0);
  });

  it('handles strings with numbers and symbols', () => {
    const text = 'abc123!@#$%^&*()_+-=[]{}|;:,.<>?/`~';
    const result = countTokens(text);
    expect(result).toBeGreaterThan(0);
  });

  it('is consistent for the same input', () => {
    const text = 'consistent input text';
    expect(countTokens(text)).toBe(countTokens(text));
  });
});

describe('countMessageTokens', () => {
  it('calculates based on message content', () => {
    const msg: Message = {
      role: 'user',
      id: '1',
      timestamp: Date.now(),
      content: 'Hello world',
    };
    const result = countMessageTokens(msg);
    expect(result).toBeGreaterThan(0);
  });

  it('includes role in token count', () => {
    const msgA: Message = {
      role: 'user',
      id: '1',
      timestamp: Date.now(),
      content: 'Hello',
    };
    const msgB: Message = {
      role: 'system',
      id: '1',
      timestamp: Date.now(),
      content: 'Hello',
    };
    const resultA = countMessageTokens(msgA);
    const resultB = countMessageTokens(msgB);
    expect(resultB).toBeGreaterThanOrEqual(resultA - 1);
    expect(resultB).toBeLessThanOrEqual(resultA + 2);
  });

  it('includes toolName if present', () => {
    const msg: Message & { toolName: string } = {
      role: 'tool',
      id: '1',
      timestamp: Date.now(),
      content: 'result',
      toolName: 'calculator',
    };
    const withTool = countMessageTokens(msg);
    const without: Message = { role: 'tool', id: '1', timestamp: Date.now(), content: 'result' };
    const withoutTool = countMessageTokens(without);
    expect(withTool).toBeGreaterThan(withoutTool);
  });

  it('includes model if present', () => {
    const msg: Message & { model: string } = {
      role: 'assistant',
      id: '1',
      timestamp: Date.now(),
      content: 'answer',
      model: 'gpt-4',
    };
    const withModel = countMessageTokens(msg);
    const without: Message = {
      role: 'assistant',
      id: '1',
      timestamp: Date.now(),
      content: 'answer',
    };
    const withoutModel = countMessageTokens(without);
    expect(withModel).toBeGreaterThan(withoutModel);
  });
});

describe('countToolOutputTokens', () => {
  it('handles string output', () => {
    const result = countToolOutputTokens('some tool output text');
    expect(result).toBeGreaterThan(0);
  });

  it('handles object output', () => {
    const obj = { result: 'success', data: { value: 42 } };
    const result = countToolOutputTokens(obj);
    expect(result).toBeGreaterThan(0);
  });

  it('outputs fewer tokens for empty strings', () => {
    expect(countToolOutputTokens('')).toBe(0);
  });

  it('returns the same as countTokens for string input', () => {
    const text = 'plain string';
    expect(countToolOutputTokens(text)).toBe(countTokens(text));
  });
});
