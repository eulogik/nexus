import { describe, it, expect, beforeEach } from 'vitest';
import { ContentRouter } from '../../packages/nexus-compress/src/content-router.js';
import { CacheAligner } from '../../packages/nexus-compress/src/cache-aligner.js';
import { SmartCrusher } from '../../packages/nexus-compress/src/smart-crusher.js';
import { CodeCompressor } from '../../packages/nexus-compress/src/code-compressor.js';
import { ProseCompressor } from '../../packages/nexus-compress/src/prose-compressor.js';
import { countTokens, countMessageTokens } from '../../packages/nexus-compress/src/token-counter.js';
import type { CompressOptions, Message, CompressorStrategy, Aggressiveness } from '../../packages/nexus-compress/src/types.js';

const balancedOptions: CompressOptions = {
  aggressiveness: 'balanced',
  preserveSignatures: true,
  maxCompressionRatio: 10,
};

const aggressiveOptions: CompressOptions = {
  aggressiveness: 'aggressive',
  preserveSignatures: false,
  maxCompressionRatio: 20,
};

const minimalOptions: CompressOptions = {
  aggressiveness: 'minimal',
  preserveSignatures: true,
  maxCompressionRatio: 2,
};

describe('Compression Pipeline Integration', () => {
  describe('SmartCrusher (JSON compression)', () => {
    const crusher = new SmartCrusher();

    it('handles JSON objects and reduces token count', () => {
      const jsonContent = JSON.stringify({
        id: 1,
        name: 'Test Project',
        description: 'A long description that repeats unnecessarily ' .repeat(20).trim(),
        metadata: {
          created: '2025-01-01',
          tags: ['typescript', 'node', 'react', 'express', 'database'],
          nested: { a: 1, b: 2, c: { d: 3, e: 4 } },
        },
      });

      const result = crusher.compress(jsonContent, balancedOptions);

      expect(result.strategy).toBe('smart-crusher');
      expect(result.originalTokens).toBeGreaterThan(0);
      expect(result.compressedTokens).toBeLessThanOrEqual(result.originalTokens);
      expect(result.savingsPercent).toBeGreaterThanOrEqual(0);
      expect(result.reversible).toBe(true);
      expect(result.originalContent).toBe(jsonContent);
      expect(result.content).toBeTruthy();
    });

    it('compresses arrays of objects into tabular format', () => {
      const records = Array.from({ length: 10 }, (_, i) => ({
        id: i,
        name: `Record ${i}`,
        value: Math.random(),
        active: i % 2 === 0,
      }));
      const jsonContent = JSON.stringify(records);

      const result = crusher.compress(jsonContent, aggressiveOptions);

      expect(result.strategy).toBe('smart-crusher');
      expect(result.compressedTokens).toBeLessThanOrEqual(result.originalTokens);
      expect(result.content).toBeTruthy();
    });

    it('canHandle returns true for JSON content', () => {
      expect(crusher.canHandle('application/json', '{"key":"val"}')).toBe(true);
      expect(crusher.canHandle('text/plain', '{"key":"val"}')).toBe(true);
      expect(crusher.canHandle('text/plain', '[1,2,3]')).toBe(true);
      expect(crusher.canHandle('text/plain', 'not json')).toBe(false);
    });

    it('returns original content for unparseable JSON', () => {
      const result = crusher.compress('not valid json', balancedOptions);
      expect(result.originalTokens).toBe(result.compressedTokens);
      expect(result.savingsPercent).toBe(0);
    });

    it('aggressive mode strips null values', () => {
      const jsonContent = JSON.stringify({ a: 1, b: null, c: 'hello', d: undefined });
      const result = crusher.compress(jsonContent, aggressiveOptions);
      expect(result.compressedTokens).toBeLessThanOrEqual(result.originalTokens);
    });

    it('aggressive mode truncates long strings', () => {
      const longStr = 'x'.repeat(2000);
      const jsonContent = JSON.stringify({ data: longStr });
      const result = crusher.compress(jsonContent, aggressiveOptions);
      expect(result.content).toBeTruthy();
      expect(result.content!.length).toBeLessThan(jsonContent.length);
    });
  });

  describe('CodeCompressor (source code compression)', () => {
    const compressor = new CodeCompressor();

    it('compresses TypeScript code and reduces token count', () => {
      const code = `
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';

// A simple test suite
describe('Example Suite', () => {
  it('should do something', () => {
    const result = 1 + 1;
    expect(result).toBe(2);
  });

  /*
   * Block comment that should be removed
   */
  it('should handle async', async () => {
    const data = await fetch('/api/test');
    expect(data).toBeDefined();
  });
});
`;

      const result = compressor.compress(code, balancedOptions);

      expect(result.strategy).toBe('code-compressor');
      expect(result.originalTokens).toBeGreaterThan(0);
      expect(result.compressedTokens).toBeLessThan(result.originalTokens);
      expect(result.savingsPercent).toBeGreaterThan(0);
      expect(result.reversible).toBe(false);
      expect(result.content).toBeTruthy();
      expect(result.content).not.toContain('// A simple test suite');
    });

    it('compresses Python code', () => {
      const pyCode = `
# This is a comment
def hello(name: str) -> str:
    """Greet someone."""
    result = f"Hello, {name}!"
    return result

class Greeter:
    def __init__(self, prefix: str = "Hello"):
        self.prefix = prefix

    def greet(self, name: str) -> str:
        return f"{self.prefix}, {name}!"
`;

      const result = compressor.compress(pyCode, balancedOptions);

      expect(result.strategy).toBe('code-compressor');
      expect(result.compressedTokens).toBeLessThanOrEqual(result.originalTokens);
    });

    it('compresses JavaScript code', () => {
      const jsCode = `
function calculateTotal(items) {
  // Calculate the total price
  let total = 0;
  for (const item of items) {
    total += item.price * item.quantity;
  }
  return total;
}

module.exports = { calculateTotal };
`;
      const result = compressor.compress(jsCode, balancedOptions);
      expect(result.strategy).toBe('code-compressor');
      expect(result.compressedTokens).toBeLessThan(result.originalTokens);
    });

    it('canHandle detects code by content', () => {
      expect(compressor.canHandle('text/typescript', 'import { x } from "y"')).toBe(true);
      expect(compressor.canHandle('text/plain', 'def hello():')).toBe(true);
      expect(compressor.canHandle('text/plain', 'Just a regular sentence.')).toBe(false);
    });

    it('removes C-style comments from TypeScript', () => {
      const code = `
/* block comment */
const x = 1; // line comment
const y = 2;
`;
      const result = compressor.compress(code, balancedOptions);
      expect(result.content).not.toContain('/*');
      expect(result.content).not.toContain('//');
    });
  });

  describe('ProseCompressor (text compression)', () => {
    const compressor = new ProseCompressor();

    it('compresses prose and reduces token count', () => {
      const text = `
The quick brown fox jumps over the lazy dog. This is a test sentence that contains many words.
In the beginning, the universe was created. This has made a lot of people very angry and been
widely regarded as a bad move. The ships hung in the sky in much the same way that bricks don't.
`;

      const result = compressor.compress(text, aggressiveOptions);

      expect(result.strategy).toBe('prose-compressor');
      expect(result.originalTokens).toBeGreaterThan(0);
      expect(result.compressedTokens).toBeLessThan(result.originalTokens);
      expect(result.savingsPercent).toBeGreaterThan(0);
      expect(result.reversible).toBe(false);
      expect(result.content).toBeTruthy();
    });

    it('aggressive mode removes stop words', () => {
      const text = 'the quick brown fox jumps over the lazy dog near the river';
      const result = compressor.compress(text, aggressiveOptions);
      expect(result.savingsPercent).toBeGreaterThan(0);
      expect(result.content).toBeTruthy();
    });

    it('minimal mode preserves most content', () => {
      const text = 'Hello, this is a test of the minimal compression mode.';
      const result = compressor.compress(text, minimalOptions);
      expect(result.savingsPercent).toBeGreaterThanOrEqual(0);
      expect(result.content).toContain('test');
    });

    it('canHandle excludes JSON and code', () => {
      expect(compressor.canHandle('text/plain', 'Just a normal sentence.')).toBe(true);
      expect(compressor.canHandle('text/plain', '{"key":"val"}')).toBe(false);
      expect(compressor.canHandle('text/plain', 'import { x } from "y"')).toBe(false);
    });

    it('normalizes excessive newlines', () => {
      const text = 'Line 1\n\n\n\n\nLine 2\n\n\nLine 3';
      const result = compressor.compress(text, balancedOptions);
      expect(result.content).toBeTruthy();
    });
  });

  describe('Content Router (routing + compression)', () => {
    const router = new ContentRouter();

    it('routes and compresses a mix of message types', () => {
      const messages: Message[] = [
        { role: 'system', id: '1', timestamp: 100, content: 'You are a helpful assistant that writes code.' },
        { role: 'user', id: '2', timestamp: 200, content: 'Write a function that adds two numbers.' },
        { role: 'assistant', id: '3', timestamp: 300, content: 'function add(a: number, b: number): number { return a + b; }' },
        { role: 'tool', id: '4', timestamp: 400, content: '{"success":true,"output":"Function written"}' },
        { role: 'user', id: '5', timestamp: 500, content: 'import { describe, it, expect } from "vitest";\n\ndescribe("add", () => {\n  it("should add two numbers", () => {\n    expect(add(1, 2)).toBe(3);\n  });\n});' },
      ];

      const result = router.compressMessages(messages, balancedOptions);

      expect(result.messages).toHaveLength(5);
      expect(result.totalSavings).toBeGreaterThan(0);
      expect(result.strategies.length).toBeGreaterThanOrEqual(1);
      expect(result.strategies).toContain('smart-crusher');
      expect(result.strategies).toContain('code-compressor');
      expect(result.strategies).toContain('prose-compressor');

      result.messages.forEach(msg => {
        expect(msg.content).toBeTruthy();
      });
    });

    it('compresses purely prose messages', () => {
      const messages: Message[] = [
        { role: 'user', id: '1', timestamp: 100, content: 'The quick brown fox jumps over the lazy dog. This is a test of the emergency broadcast system.' },
        { role: 'assistant', id: '2', timestamp: 200, content: 'I understand your request. Let me help you with that task right away. I will be happy to assist.' },
      ];

      const result = router.compressMessages(messages, aggressiveOptions);

      expect(result.strategies).toContain('prose-compressor');
      expect(result.totalSavings).toBeGreaterThan(0);
    });

    it('compresses purely code messages', () => {
      const messages: Message[] = [
        { role: 'user', id: '1', timestamp: 100, content: 'const x = 1;\nconst y = 2;\nconst z = x + y;' },
        { role: 'assistant', id: '2', timestamp: 200, content: 'import { foo } from "./bar";\n\nfunction baz(): void {\n  console.log("hello");\n}' },
      ];

      const result = router.compressMessages(messages, balancedOptions);

      expect(result.strategies).toContain('code-compressor');
    });

    it('handles empty message array', () => {
      const result = router.compressMessages([], balancedOptions);
      expect(result.messages).toHaveLength(0);
      expect(result.totalSavings).toBe(0);
      expect(result.strategies).toEqual([]);
    });

    it('handles messages with empty content', () => {
      const messages: Message[] = [
        { role: 'user', id: '1', timestamp: 100, content: '' },
        { role: 'assistant', id: '2', timestamp: 200, content: '   ' },
      ];

      const result = router.compressMessages(messages, balancedOptions);
      expect(result.messages).toHaveLength(2);
    });
  });

  describe('CacheAligner (prefix caching)', () => {
    let aligner: CacheAligner;

    const systemPrompt = 'You are Nexus, a coding agent that operates through tool calls.';
    const messages: Message[] = [
      { role: 'user', id: '1', timestamp: 100, content: 'Create a new file called hello.txt' },
      { role: 'assistant', id: '2', timestamp: 200, content: 'I will create the file for you.' },
      { role: 'tool', id: '3', timestamp: 300, content: '{"success":true,"output":"File created"}' },
    ];

    beforeEach(() => {
      aligner = new CacheAligner();
    });

    it('returns miss on first call with savings=0', () => {
      const result = aligner.align(systemPrompt, messages, 'openai');
      expect(result.hits).toBe(0);
      expect(result.savings).toBe(0);
      expect(result.prompt).toBeTruthy();
    });

    it('returns hit on second call with savings > 0', () => {
      aligner.align(systemPrompt, messages, 'openai');
      const result = aligner.align(systemPrompt, messages, 'openai');
      expect(result.hits).toBe(1);
      expect(result.savings).toBeGreaterThan(0);
    });

    it('increments hit counter across repeated calls', () => {
      aligner.align(systemPrompt, messages, 'openai');
      aligner.align(systemPrompt, messages, 'openai');
      aligner.align(systemPrompt, messages, 'openai');
      aligner.align(systemPrompt, messages, 'openai');
      expect(aligner.hits).toBe(3);
      expect(aligner.size).toBe(1);
    });

    it('different system prompts produce different cache entries', () => {
      aligner.align(systemPrompt, messages, 'openai');
      const result = aligner.align('Different system prompt.', messages, 'openai');
      expect(result.hits).toBe(0);
      expect(aligner.size).toBe(2);
    });

    it('different message sequences produce different cache entries', () => {
      aligner.align(systemPrompt, messages, 'openai');
      const otherMessages: Message[] = [
        { role: 'user', id: '9', timestamp: 900, content: 'Different request' },
      ];
      const result = aligner.align(systemPrompt, otherMessages, 'openai');
      expect(result.hits).toBe(0);
    });

    it('clear resets all state', () => {
      aligner.align(systemPrompt, messages, 'openai');
      aligner.align(systemPrompt, messages, 'openai');
      expect(aligner.size).toBe(1);
      expect(aligner.hits).toBe(1);

      aligner.clear();
      expect(aligner.size).toBe(0);
      expect(aligner.hits).toBe(0);

      const result = aligner.align(systemPrompt, messages, 'openai');
      expect(result.hits).toBe(0);
    });

    it('size tracks unique cache entries', () => {
      expect(aligner.size).toBe(0);
      aligner.align(systemPrompt, messages, 'openai');
      expect(aligner.size).toBe(1);
      aligner.align('Prompt 2', messages, 'openai');
      expect(aligner.size).toBe(2);
      aligner.align('Prompt 3', messages, 'openai');
      expect(aligner.size).toBe(3);
    });
  });

  describe('Token Counter', () => {
    it('countTokens returns 0 for empty strings', () => {
      expect(countTokens('')).toBe(0);
    });

    it('countTokens returns positive number for text', () => {
      const tokens = countTokens('Hello, world!');
      expect(tokens).toBeGreaterThan(0);
    });

    it('countMessageTokens includes role overhead', () => {
      const msg: Message = { role: 'user', id: '1', timestamp: 100, content: 'Hello' };
      const contentOnly = countTokens('Hello');
      const withRole = countMessageTokens(msg);
      expect(withRole).toBeGreaterThan(contentOnly);
    });

    it('shorter text has fewer tokens than longer text', () => {
      const short = countTokens('short');
      const long = countTokens('a much longer piece of text that should have more tokens');
      expect(long).toBeGreaterThan(short);
    });
  });

  describe('End-to-end pipeline', () => {
    it('compress -> counts reduced from original', () => {
      const router = new ContentRouter();
      const original = 'The quick brown fox jumps over the lazy dog. This is a test.';
      const result = router.compress(original, 'text/plain', aggressiveOptions);
      expect(result.originalTokens).toBeGreaterThan(0);
      expect(result.compressedTokens).toBeLessThanOrEqual(result.originalTokens);
      expect(result.savingsPercent).toBeGreaterThanOrEqual(0);
    });

    it('ContentRouter + CacheAligner work together', () => {
      const router = new ContentRouter();
      const aligner = new CacheAligner();

      const sysPrompt = 'You are a helper.';
      const msgs: Message[] = [
        { role: 'user', id: '1', timestamp: 100, content: 'Hello' },
      ];

      const compressed = router.compressMessages(msgs, minimalOptions);
      const cacheResult = aligner.align(sysPrompt, compressed.messages, 'openai');
      expect(cacheResult.hits).toBe(0);
      expect(cacheResult.prompt).toBeTruthy();

      const cacheResult2 = aligner.align(sysPrompt, compressed.messages, 'openai');
      expect(cacheResult2.hits).toBe(1);
    });
  });
});
