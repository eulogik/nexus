import type { Message } from './types.js';
import { countTokens } from './token-counter.js';

function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function formatMessage(msg: Message): string {
  return `${msg.role}: ${msg.content || ''}`;
}

export interface AlignResult {
  prompt: string;
  hits: number;
  savings: number;
}

export class CacheAligner {
  private cache = new Map<string, string>();
  private hitCount = 0;

  align(systemPrompt: string, messages: Message[], _provider: string): AlignResult {
    const prefixMessages = messages.slice(0, 3);
    const prefix = systemPrompt + '\n' + prefixMessages.map(m => formatMessage(m)).join('\n');
    const key = djb2Hash(prefix);

    const existing = this.cache.get(key);
    if (existing !== undefined) {
      this.hitCount++;
      const savings = countTokens(prefix) * 0.9;
      return { prompt: existing, hits: this.hitCount, savings: Math.round(savings) };
    }

    this.cache.set(key, prefix);
    return { prompt: prefix, hits: 0, savings: 0 };
  }

  clear(): void {
    this.cache.clear();
    this.hitCount = 0;
  }

  get size(): number {
    return this.cache.size;
  }

  get hits(): number {
    return this.hitCount;
  }
}
