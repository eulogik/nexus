import { describe, it, expect } from 'vitest';
import { CodeCompressor } from '../src/code-compressor.js';
import type { CompressOptions } from '../src/types.js';

const defaultOptions: CompressOptions = {
  aggressiveness: 'balanced',
  preserveSignatures: true,
  maxCompressionRatio: 10,
};

describe('CodeCompressor', () => {
  const compressor = new CodeCompressor();

  describe('canHandle', () => {
    it('returns true for TypeScript code', () => {
      const code = `import { something } from './module';\nconst x: number = 5;`;
      expect(compressor.canHandle('text/typescript', code)).toBe(true);
    });

    it('returns true for JavaScript code', () => {
      const code = `const x = 5;\nfunction hello() { return x; }`;
      expect(compressor.canHandle('text/javascript', code)).toBe(true);
    });

    it('returns true for Python code', () => {
      const code = `import os\nprint("hello")`;
      expect(compressor.canHandle('text/x-python', code)).toBe(true);
    });

    it('returns true for Go code', () => {
      const code = `package main\nimport "fmt"`;
      expect(compressor.canHandle('text/plain', code)).toBe(true);
    });

    it('returns true for Rust code', () => {
      const code = `use std::collections::HashMap;\nfn main() {}`;
      expect(compressor.canHandle('text/plain', code)).toBe(true);
    });

    it('returns false for plain text', () => {
      const text = 'The quick brown fox jumps over the lazy dog.';
      expect(compressor.canHandle('text/plain', text)).toBe(false);
    });
  });

  describe('compress', () => {
    it('removes single-line comments (//)', () => {
      const code = `const x = 5;\n// this is a comment\nconst y = 10;`;
      const result = compressor.compress(code, defaultOptions);
      expect(result.content).not.toContain('this is a comment');
      expect(result.content).toContain('const');
    });

    it('removes multi-line comments (/* */)', () => {
      const code = `const x = 5;\n/* multi\nline\ncomment */\nconst y = 10;`;
      const result = compressor.compress(code, defaultOptions);
      expect(result.content).not.toContain('multi');
      expect(result.content).toContain('const');
    });

    it('normalizes excessive whitespace', () => {
      const code = `const   x    =    5;\n\n\n\nconst y = 10;`;
      const result = compressor.compress(code, defaultOptions);
      expect(result.content).not.toMatch(/ {3,}/);
      expect(result.content).not.toMatch(/\n{3,}/);
    });

    it('does NOT shorten variable names', () => {
      const code = `const myDescriptiveVariableName = 42;\nconst anotherLongVariableName = myDescriptiveVariableName + 1;`;
      const result = compressor.compress(code, defaultOptions);
      expect(result.content).toContain('myDescriptiveVariableName');
      expect(result.content).toContain('anotherLongVariableName');
    });

    it('Compression result has correct strategy=code-compressor', () => {
      const code = `const x = 1;`;
      const result = compressor.compress(code, defaultOptions);
      expect(result.strategy).toBe('code-compressor');
    });

    it('returns reversible=false', () => {
      const code = `const x = 1; // comment`;
      const result = compressor.compress(code, defaultOptions);
      expect(result.reversible).toBe(false);
    });

    it('has positive savings for code with comments', () => {
      const code = `const x = 1; // this is a long comment that will be removed\nconst y = 2;`;
      const result = compressor.compress(code, defaultOptions);
      expect(result.savingsPercent).toBeGreaterThan(0);
    });

    it('preserves string literals containing comment-like patterns', () => {
      const code = `const url = "https://example.com/api"; // endpoint\nconst x = 1;`;
      const result = compressor.compress(code, defaultOptions);
      expect(result.content).toContain('https://example.com/api');
    });
  });
});
