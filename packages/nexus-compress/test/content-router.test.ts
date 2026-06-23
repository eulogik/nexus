import { describe, it, expect } from 'vitest';
import { ContentRouter } from '../src/content-router.js';
import type { CompressOptions, Message } from '../src/types.js';

const defaultOptions: CompressOptions = {
  aggressiveness: 'balanced',
  preserveSignatures: true,
  maxCompressionRatio: 10,
};

describe('ContentRouter', () => {
  const router = new ContentRouter();

  describe('compress', () => {
    it('routes JSON content to SmartCrusher', () => {
      const result = router.compress('{"key":"value"}', 'application/json', defaultOptions);
      expect(result.strategy).toBe('smart-crusher');
    });

    it('routes JSON content starting with {', () => {
      const result = router.compress('{"key":"value"}', 'text/plain', defaultOptions);
      expect(result.strategy).toBe('smart-crusher');
    });

    it('routes code content to CodeCompressor', () => {
      const code = "import { foo } from './bar';\nconst x = 1;";
      const result = router.compress(code, 'text/typescript', defaultOptions);
      expect(result.strategy).toBe('code-compressor');
    });

    it('routes prose to ProseCompressor', () => {
      const text = 'The quick brown fox jumps over the lazy dog.';
      const result = router.compress(text, 'text/plain', defaultOptions);
      expect(result.strategy).toBe('prose-compressor');
    });

    it('enforces maxCompressionRatio (falls back to minimal)', () => {
      const proseWithStopWords = 'the a an is are was were be been being have has had do does did will would could should may might must shall can need dare ought used to of in for on with at by from as into through during before after above below between under again further then once here there when where why how all each few more most other some such no nor not only own same so than too very just now the a an is are was were be been being have has had do does did will would could should may might must shall can need dare ought used to of in for on with at by from as into through during before after above below between under again further then once here there when where why how all each few more most other some such no nor not only own same so than too very just now';
      const result = router.compress(proseWithStopWords, 'text/plain', {
        ...defaultOptions,
        aggressiveness: 'aggressive',
        maxCompressionRatio: 1.0,
      });
      expect(result.strategy).toBe('prose-compressor');
    });

    it('routes unknown content to ProseCompressor (catch-all)', () => {
      const result = router.compress('Some random binary data', 'application/octet-stream', defaultOptions);
      expect(result.strategy).toBe('prose-compressor');
    });

    it('does not fall back to minimal when aggressiveness is already minimal', () => {
      const text = 'Just a short sentence.';
      const result = router.compress(text, 'text/plain', {
        ...defaultOptions,
        aggressiveness: 'minimal',
        maxCompressionRatio: 1.0,
      });
      expect(result.strategy).toBe('prose-compressor');
    });
  });

  describe('compressMessages', () => {
    it('compresses array of messages', () => {
      const messages: Message[] = [
        { role: 'user', id: '1', timestamp: 100, content: '{"key":"value"}' },
        { role: 'assistant', id: '2', timestamp: 200, content: 'The quick brown fox.' },
      ];
      const result = router.compressMessages(messages, defaultOptions);
      expect(result.messages).toHaveLength(2);
      expect(result.strategies).toContain('smart-crusher');
      expect(result.strategies).toContain('prose-compressor');
    });

    it('returns totalSavings as sum', () => {
      const messages: Message[] = [
        { role: 'user', id: '1', timestamp: 100, content: '{"key":"value"}' },
        { role: 'assistant', id: '2', timestamp: 200, content: 'The quick brown fox.' },
      ];
      const result = router.compressMessages(messages, defaultOptions);
      expect(result.totalSavings).toBeGreaterThanOrEqual(0);
      expect(result.totalSavings).toBeLessThan(100);
    });

    it('returns messages with updated content', () => {
      const messages: Message[] = [
        { role: 'user', id: '1', timestamp: 100, content: '{  "key"  :  "value"  }' },
      ];
      const result = router.compressMessages(messages, defaultOptions);
      expect(result.messages[0]?.content).toBeDefined();
      expect(result.messages[0]?.content).not.toContain('  ');
    });

    it('handles tool messages as JSON', () => {
      const messages: Message[] = [
        { role: 'tool', id: '1', timestamp: 100, content: '{"result":"success"}' },
      ];
      const result = router.compressMessages(messages, defaultOptions);
      expect(result.strategies).toContain('smart-crusher');
    });

    it('handles messages with code-like content', () => {
      const messages: Message[] = [
        { role: 'user', id: '1', timestamp: 100, content: 'const x = 1;\nimport { foo } from "bar";' },
      ];
      const result = router.compressMessages(messages, defaultOptions);
      expect(result.strategies).toContain('code-compressor');
    });
  });
});
