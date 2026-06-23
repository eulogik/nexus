import type { CompressOptions, CompressionResult, CompressorStrategy } from './types.js';
import { countTokens } from './token-counter.js';

const STOP_WORDS = [
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
  'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
  'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'between', 'under', 'again', 'further', 'then', 'once',
  'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
  'own', 'same', 'so', 'than', 'too', 'very', 'just', 'now',
];

const STOP_WORDS_RE = new RegExp(
  `\\b(${STOP_WORDS.join('|')})\\b`,
  'gi'
);

const CODE_PATTERN = /^(import|const|let|var|function|class|def|package|use|fn|pub|#include|from)\b/m;

export class ProseCompressor implements CompressorStrategy {
  canHandle(type: string, content: string): boolean {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return false;
    if (CODE_PATTERN.test(content)) return false;
    return true;
  }

  compress(content: string, options: CompressOptions): CompressionResult {
    const originalTokens = countTokens(content);
    let c = content.replace(/\n{3,}/g, '\n\n').trim();
    if (options.aggressiveness === 'aggressive') {
      c = c.replace(STOP_WORDS_RE, '');
      c = c.replace(/\s{2,}/g, ' ').trim();
    }
    const compressedTokens = countTokens(c);
    const savingsPercent = originalTokens > 0
      ? ((originalTokens - compressedTokens) / originalTokens) * 100
      : 0;
    return {
      originalTokens,
      compressedTokens,
      savingsPercent: Math.round(savingsPercent * 100) / 100,
      strategy: 'prose-compressor',
      reversible: false,
      content: c,
    };
  }
}
