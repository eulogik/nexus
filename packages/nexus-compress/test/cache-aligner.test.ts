import { describe, it, expect, beforeEach } from 'vitest';
import { CacheAligner } from '../src/cache-aligner.js';
import type { Message } from '../src/types.js';

describe('CacheAligner', () => {
  let aligner: CacheAligner;

  const systemPrompt = 'You are a helpful assistant.';
  const messages: Message[] = [
    { role: 'user', id: '1', timestamp: 100, content: 'Hello' },
    { role: 'assistant', id: '2', timestamp: 200, content: 'Hi there' },
    { role: 'user', id: '3', timestamp: 300, content: 'How are you?' },
  ];

  beforeEach(() => {
    aligner = new CacheAligner();
  });

  describe('align', () => {
    it('returns miss on first call (hits=0)', () => {
      const result = aligner.align(systemPrompt, messages, 'openai');
      expect(result.hits).toBe(0);
      expect(result.prompt).toBeTruthy();
      expect(result.savings).toBe(0);
    });

    it('returns hit on second call with same prefix (hits=1)', () => {
      aligner.align(systemPrompt, messages, 'openai');
      const result = aligner.align(systemPrompt, messages, 'openai');
      expect(result.hits).toBe(1);
    });

    it('increments hits on repeated calls with same prefix', () => {
      aligner.align(systemPrompt, messages, 'openai');
      aligner.align(systemPrompt, messages, 'openai');
      const result = aligner.align(systemPrompt, messages, 'openai');
      expect(result.hits).toBe(2);
    });

    it('returns miss for different system prompt', () => {
      aligner.align(systemPrompt, messages, 'openai');
      const result = aligner.align('Different system prompt.', messages, 'openai');
      expect(result.hits).toBe(0);
    });

    it('returns miss for different messages', () => {
      aligner.align(systemPrompt, messages, 'openai');
      const otherMessages: Message[] = [
        { role: 'user', id: '4', timestamp: 400, content: 'Different' },
      ];
      const result = aligner.align(systemPrompt, otherMessages, 'openai');
      expect(result.hits).toBe(0);
    });

    it('returns savings on cache hit', () => {
      aligner.align(systemPrompt, messages, 'openai');
      const result = aligner.align(systemPrompt, messages, 'openai');
      expect(result.savings).toBeGreaterThan(0);
    });
  });

  describe('clear', () => {
    it('removes all cached entries', () => {
      aligner.align(systemPrompt, messages, 'openai');
      expect(aligner.size).toBe(1);
      aligner.clear();
      expect(aligner.size).toBe(0);
    });

    it('resets hit count after clear', () => {
      aligner.align(systemPrompt, messages, 'openai');
      aligner.align(systemPrompt, messages, 'openai');
      aligner.clear();
      expect(aligner.hits).toBe(0);
    });
  });

  describe('size', () => {
    it('returns correct count', () => {
      expect(aligner.size).toBe(0);
      aligner.align(systemPrompt, messages, 'openai');
      expect(aligner.size).toBe(1);
      aligner.align('Other prompt.', messages, 'openai');
      expect(aligner.size).toBe(2);
    });
  });

  describe('hits', () => {
    it('returns total hit count', () => {
      expect(aligner.hits).toBe(0);
      aligner.align(systemPrompt, messages, 'openai');
      expect(aligner.hits).toBe(0);
      aligner.align(systemPrompt, messages, 'openai');
      expect(aligner.hits).toBe(1);
      aligner.align(systemPrompt, messages, 'openai');
      expect(aligner.hits).toBe(2);
    });
  });
});
