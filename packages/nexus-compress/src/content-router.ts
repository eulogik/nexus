import type { CompressOptions, CompressionResult, CompressorStrategy, Message, MessageCompressionResult } from './types.js';
import { SmartCrusher } from './smart-crusher.js';
import { CodeCompressor } from './code-compressor.js';
import { ProseCompressor } from './prose-compressor.js';
import { countTokens } from './token-counter.js';

export class ContentRouter {
  private compressors: CompressorStrategy[] = [
    new SmartCrusher(),
    new CodeCompressor(),
    new ProseCompressor(),
  ];

  compress(content: string, contentType: string, options: CompressOptions): CompressionResult {
    for (const c of this.compressors) {
      if (c.canHandle(contentType, content)) {
        const result = c.compress(content, options);
        const ratio = result.compressedTokens > 0
          ? result.originalTokens / result.compressedTokens
          : Infinity;
        if (ratio > options.maxCompressionRatio && options.aggressiveness !== 'minimal') {
          return c.compress(content, { ...options, aggressiveness: 'minimal' });
        }
        return result;
      }
    }
    const tokens = countTokens(content);
    return {
      originalTokens: tokens,
      compressedTokens: tokens,
      savingsPercent: 0,
      strategy: 'none',
      reversible: true,
      content,
    };
  }

  compressMessages(messages: Message[], options: CompressOptions): MessageCompressionResult {
    const strategies: Set<string> = new Set();
    let totalOriginal = 0;
    let totalCompressed = 0;

    const compressed = messages.map(msg => {
      const content = msg.content || '';
      const contentType = this.detectContentType(msg);
      const result = this.compress(content, contentType, options);
      totalOriginal += result.originalTokens;
      totalCompressed += result.compressedTokens;
      if (result.strategy !== 'none') strategies.add(result.strategy);
      return {
        ...msg,
        content: result.content ?? content,
      };
    });

    const totalSavings = totalOriginal > 0
      ? ((totalOriginal - totalCompressed) / totalOriginal) * 100
      : 0;

    return {
      messages: compressed,
      totalSavings: Math.round(totalSavings * 100) / 100,
      strategies: Array.from(strategies),
    };
  }

  private detectContentType(msg: Message): string {
    if (msg.role === 'tool') return 'application/json';
    const content = msg.content || '';
    if (content.trim().startsWith('{') || content.trim().startsWith('[')) return 'application/json';
    if (content.includes('import ') || content.includes('function ') || content.includes('class ')) {
      return 'text/typescript';
    }
    return 'text/plain';
  }
}
