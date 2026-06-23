import { describe, it, expect } from 'vitest';
import { ProseCompressor } from '../src/prose-compressor.js';
import type { CompressOptions } from '../src/types.js';

const defaultOptions: CompressOptions = {
  aggressiveness: 'balanced',
  preserveSignatures: true,
  maxCompressionRatio: 10,
};

describe('ProseCompressor', () => {
  const compressor = new ProseCompressor();

  describe('canHandle', () => {
    it('returns true for prose text', () => {
      const text = 'The quick brown fox jumps over the lazy dog.';
      expect(compressor.canHandle('text/plain', text)).toBe(true);
    });

    it('returns false for JSON (starts with {)', () => {
      expect(compressor.canHandle('application/json', '{"key":"value"}')).toBe(false);
    });

    it('returns false for JSON (starts with [)', () => {
      expect(compressor.canHandle('application/json', '["a","b"]')).toBe(false);
    });

    it('returns false for code (starts with function)', () => {
      const code = 'function hello() { return 1; }';
      expect(compressor.canHandle('text/plain', code)).toBe(false);
    });

    it('returns false for code (starts with import)', () => {
      const code = "import { foo } from 'bar';";
      expect(compressor.canHandle('text/plain', code)).toBe(false);
    });

    it('returns false for code (starts with class)', () => {
      const code = 'class MyClass {}';
      expect(compressor.canHandle('text/plain', code)).toBe(false);
    });
  });

  describe('compress', () => {
    it('collapses multiple newlines', () => {
      const text = 'Line one.\n\n\n\nLine two.\n\nLine three.';
      const result = compressor.compress(text, defaultOptions);
      expect(result.content).not.toMatch(/\n{3,}/);
      expect(result.content).toContain('Line one.');
      expect(result.content).toContain('Line two.');
      expect(result.content).toContain('Line three.');
    });

    it('with aggressive removes stop words', () => {
      const text = 'The quick brown fox jumps over the lazy dog. The cat is sleeping.';
      const result = compressor.compress(text, {
        ...defaultOptions,
        aggressiveness: 'aggressive',
      });
      expect(result.content).not.toMatch(/\bthe\b/i);
      expect(result.content).toContain('quick');
      expect(result.content).toContain('fox');
    });

    it('with minimal preserves most words', () => {
      const text = 'The quick brown fox jumps over the lazy dog.';
      const result = compressor.compress(text, {
        ...defaultOptions,
        aggressiveness: 'minimal',
      });
      expect(result.content).toContain('The');
      expect(result.content).toContain('quick');
      expect(result.content).toContain('brown');
      expect(result.content).toContain('fox');
      expect(result.content).toContain('over');
      expect(result.content).toContain('lazy');
      expect(result.content).toContain('dog');
    });

    it('with balanced does moderate compression', () => {
      const text = 'Line one.\n\n\n\nLine two.';
      const resultDefault = compressor.compress(text, defaultOptions);
      const resultMinimal = compressor.compress(text, {
        ...defaultOptions,
        aggressiveness: 'minimal',
      });
      const savingsDefault = resultDefault.savingsPercent;
      const savingsMinimal = resultMinimal.savingsPercent;
      expect(savingsDefault).toBeGreaterThanOrEqual(0);
      expect(savingsMinimal).toBeGreaterThanOrEqual(0);
    });

    it('returns reversible=false', () => {
      const text = 'Some prose text to compress.';
      const result = compressor.compress(text, defaultOptions);
      expect(result.reversible).toBe(false);
    });

    it('returns strategy=prose-compressor', () => {
      const text = 'Some prose text to compress.';
      const result = compressor.compress(text, defaultOptions);
      expect(result.strategy).toBe('prose-compressor');
    });

    it('has savingsPercent >= 0', () => {
      const text = 'Just a short sentence.';
      const result = compressor.compress(text, defaultOptions);
      expect(result.savingsPercent).toBeGreaterThanOrEqual(0);
    });

    it('aggressive mode produces fewer tokens than minimal', () => {
      const text = 'the a an is are was were be been being have has had do does did will would could should may might must shall can need dare ought used to of in for on with at by from as into through during before after above below between under again further then once here there when where why how all each few more most other some such no nor not only own same so than too very just now';
      const aggressive = compressor.compress(text, {
        ...defaultOptions,
        aggressiveness: 'aggressive',
      });
      const minimal = compressor.compress(text, {
        ...defaultOptions,
        aggressiveness: 'minimal',
      });
      expect(aggressive.compressedTokens).toBeLessThan(minimal.compressedTokens);
    });
  });
});
