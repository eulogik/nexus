import { describe, it, expect } from 'vitest';
import { SmartCrusher } from '../src/smart-crusher.js';
import type { CompressOptions } from '../src/types.js';

const defaultOptions: CompressOptions = {
  aggressiveness: 'balanced',
  preserveSignatures: true,
  maxCompressionRatio: 10,
};

describe('SmartCrusher', () => {
  const crusher = new SmartCrusher();

  describe('canHandle', () => {
    it('returns true for JSON objects (starts with {)', () => {
      expect(crusher.canHandle('text/plain', '{"key":"value"}')).toBe(true);
    });

    it('returns true for JSON arrays (starts with [)', () => {
      expect(crusher.canHandle('text/plain', '["a","b","c"]')).toBe(true);
    });

    it('returns true for application/json type', () => {
      expect(crusher.canHandle('application/json', 'some plain text')).toBe(true);
    });

    it('returns true for JSON content with surrounding whitespace', () => {
      expect(crusher.canHandle('text/plain', '  {"key": 1}  ')).toBe(true);
    });

    it('returns false for plain text', () => {
      expect(crusher.canHandle('text/plain', 'Hello world')).toBe(false);
    });
  });

  describe('compress', () => {
    it('minifies JSON (removes whitespace)', () => {
      const input = '{  "name"  :  "test"  ,  "value"  :  42  }';
      const result = crusher.compress(input, defaultOptions);
      const parsed = JSON.parse(result.content!);
      expect(parsed).toEqual({ name: 'test', value: 42 });
      expect(result.content!).not.toContain('  ');
    });

    it('with aggressive mode removes null values', () => {
      const input = JSON.stringify({ a: 1, b: null, c: 'keep', d: undefined });
      const result = crusher.compress(input, {
        ...defaultOptions,
        aggressiveness: 'aggressive',
      });
      const parsed = JSON.parse(result.content!);
      expect(parsed).not.toHaveProperty('b');
      expect(parsed).toHaveProperty('a', 1);
      expect(parsed).toHaveProperty('c', 'keep');
    });

    it('handles array of objects → [keys, ...rows] format', () => {
      const input = JSON.stringify([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]);
      const result = crusher.compress(input, defaultOptions);
      const parsed = JSON.parse(result.content!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toEqual(['name', 'age']);
      expect(parsed[1]).toEqual(['Alice', 30]);
      expect(parsed[2]).toEqual(['Bob', 25]);
    });

    it('with aggressive truncates long strings', () => {
      const longString = 'x'.repeat(1500);
      const input = JSON.stringify({ data: longString });
      const result = crusher.compress(input, {
        ...defaultOptions,
        aggressiveness: 'aggressive',
      });
      const parsed = JSON.parse(result.content!);
      expect(parsed.data).toMatch(/\[truncated\]$/);
      expect(parsed.data.length).toBeLessThan(1500);
    });

    it('Compression result has correct originalTokens/compressedTokens/savingsPercent', () => {
      const input = JSON.stringify({ a: 1, b: 2, c: 3 });
      const result = crusher.compress(input, defaultOptions);
      expect(result.originalTokens).toBeGreaterThan(0);
      expect(result.compressedTokens).toBeGreaterThan(0);
      expect(result.savingsPercent).toBeGreaterThanOrEqual(0);
      expect(result.savingsPercent).toBeLessThan(100);
    });

    it('returns reversible=true', () => {
      const input = JSON.stringify({ key: 'value' });
      const result = crusher.compress(input, defaultOptions);
      expect(result.reversible).toBe(true);
    });

    it('returns strategy=smart-crusher', () => {
      const input = JSON.stringify({ key: 'value' });
      const result = crusher.compress(input, defaultOptions);
      expect(result.strategy).toBe('smart-crusher');
    });

    it('handles invalid JSON gracefully', () => {
      const input = '{invalid json}';
      const result = crusher.compress(input, defaultOptions);
      expect(result.content).toBe(input);
      expect(result.originalTokens).toBe(result.compressedTokens);
      expect(result.savingsPercent).toBe(0);
    });
  });
});
