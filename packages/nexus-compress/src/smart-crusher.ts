import type { CompressOptions, CompressionResult, CompressorStrategy } from './types.js';
import { countTokens } from './token-counter.js';

export class SmartCrusher implements CompressorStrategy {
  canHandle(type: string, content: string): boolean {
    const trimmed = content.trim();
    return type === 'application/json' || trimmed.startsWith('{') || trimmed.startsWith('[');
  }

  compress(content: string, options: CompressOptions): CompressionResult {
    const originalTokens = countTokens(content);
    try {
      const parsed = JSON.parse(content);
      const compressed = this.compressValue(parsed, options.aggressiveness);
      const str = JSON.stringify(compressed);
      const compressedTokens = countTokens(str);
      const savingsPercent = originalTokens > 0
        ? ((originalTokens - compressedTokens) / originalTokens) * 100
        : 0;
      return {
        originalTokens,
        compressedTokens,
        savingsPercent: Math.round(savingsPercent * 100) / 100,
        strategy: 'smart-crusher',
        reversible: true,
        originalContent: content,
        content: str,
      };
    } catch {
      return {
        originalTokens,
        compressedTokens: originalTokens,
        savingsPercent: 0,
        strategy: 'smart-crusher',
        reversible: true,
        originalContent: content,
        content,
      };
    }
  }

  private compressValue(v: unknown, aggressiveness: string): unknown {
    if (Array.isArray(v)) {
      if (v.length > 0 && typeof v[0] === 'object' && v[0] !== null && !Array.isArray(v[0])) {
        return this.compressArrayOfObjects(v, aggressiveness);
      }
      return v.map(item => this.compressValue(item, aggressiveness));
    }
    if (typeof v === 'object' && v !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(v)) {
        if (aggressiveness === 'aggressive' && (val === null || val === undefined)) continue;
        if (aggressiveness === 'balanced' && val === undefined) continue;
        result[key] = this.compressValue(val, aggressiveness);
      }
      return result;
    }
    if (typeof v === 'string' && aggressiveness === 'aggressive' && v.length > 1000) {
      return v.slice(0, 1000) + '...[truncated]';
    }
    return v;
  }

  private compressArrayOfObjects(arr: unknown[], aggressiveness: string): unknown {
    const first = arr[0] as Record<string, unknown>;
    const keys = Object.keys(first);
    const rows = arr.map(obj => {
      const record = obj as Record<string, unknown>;
      return keys.map(k => {
        const val = record[k];
        if (aggressiveness === 'aggressive' && (val === null || val === undefined)) return null;
        if (typeof val === 'string' && aggressiveness === 'aggressive' && val.length > 1000) {
          return val.slice(0, 1000) + '...[truncated]';
        }
        return val;
      });
    });
    return [keys, ...rows];
  }
}
