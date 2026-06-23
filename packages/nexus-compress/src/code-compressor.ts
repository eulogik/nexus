import type { CompressOptions, CompressionResult, CompressorStrategy } from './types.js';
import { countTokens } from './token-counter.js';

const LANGUAGE_PATTERNS: Record<string, RegExp> = {
  typescript: /\b(interface|type|enum|as|const|let|var)\b.*(:|;)|\.ts[xi]?$|^import\s.*from|^export\s/,
  javascript: /^import\s|^export\s|^const\s|^let\s|^var\s|^function\s|=>|\.jsx?$/,
  python: /^import\s|^from\s|^def\s|^class\s|^@|^print\s*\(|\.py$/,
  go: /^package\s|^import\s\(|^func\s|^type\s|^var\s|\.go$/,
  rust: /^use\s|^fn\s|^let\s|^pub\s|^struct\s|^enum\s|^impl\s|\.rs$/,
  java: /^import\s|^public\s|^private\s|^protected\s|^class\s|^interface\s|\.java$/,
  cpp: /^#include|^using\s|^namespace\s|^class\s|^int\smain|^void\s|^template|\.cpp$|\.hpp$|\.cc$/,
};

const EXTENSION_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  typescript: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  javascript: 'javascript',
  py: 'python',
  python: 'python',
  go: 'go',
  rs: 'rust',
  rust: 'rust',
  java: 'java',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  c: 'cpp',
  h: 'cpp',
  'c++': 'cpp',
};

export class CodeCompressor implements CompressorStrategy {
  canHandle(type: string, content: string): boolean {
    return this.detectLang(type, content) !== null;
  }

  compress(content: string, options: CompressOptions): CompressionResult {
    const originalTokens = countTokens(content);
    const lang = this.detectLang('text/plain', content) || 'typescript';
    let c = this.removeComments(content, lang);
    c = c.replace(/\n\s*\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
    // NEVER shorten variable names — destroys LLM comprehension
    const compressedTokens = countTokens(c);
    const savingsPercent = originalTokens > 0
      ? ((originalTokens - compressedTokens) / originalTokens) * 100
      : 0;
    return {
      originalTokens,
      compressedTokens,
      savingsPercent: Math.round(savingsPercent * 100) / 100,
      strategy: 'code-compressor',
      reversible: false,
      content: c,
    };
  }

  private detectLang(type: string, content: string): string | null {
    let contentType = type.split('/').pop()?.toLowerCase() || '';
    contentType = contentType.replace(/^x-/, '');
    if (EXTENSION_MAP[contentType]) return EXTENSION_MAP[contentType] as string;
    if (contentType === 'plain' || contentType === 'text') {
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      const scores: Record<string, number> = {};
      for (const [lang, pattern] of Object.entries(LANGUAGE_PATTERNS)) {
        let score = 0;
        for (const line of lines.slice(0, 10)) {
          if (pattern.test(line)) score++;
        }
        if (score > 0) scores[lang] = score;
      }
      const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      return entries.length > 0 ? (entries[0]?.[0] ?? null) : null;
    }
    return null;
  }

  private removeComments(code: string, lang: string): string {
    switch (lang) {
      case 'typescript':
      case 'javascript':
      case 'java':
      case 'go':
      case 'rust':
      case 'cpp':
        return this.removeCStyleComments(code);
      case 'python':
        return this.removePythonComments(code);
      default:
        return this.removeCStyleComments(code);
    }
  }

  private removeCStyleComments(code: string): string {
    let result = '';
    let i = 0;
    const len = code.length;
    let inString = false;
    let stringChar = '';

    while (i < len) {
      if (!inString) {
        if (code[i] === '/' && i + 1 < len && code[i + 1] === '/') {
          while (i < len && code[i] !== '\n') i++;
          continue;
        }
        if (code[i] === '/' && i + 1 < len && code[i + 1] === '*') {
          i += 2;
          while (i < len) {
            if (code[i] === '*' && i + 1 < len && code[i + 1] === '/') {
              i += 2;
              break;
            }
            i++;
          }
          continue;
        }
        if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
          inString = true;
          stringChar = code[i] as string;
        }
      } else {
        if (code[i] === '\\') {
          result += code[i] as string;
          i++;
          if (i < len) {
            result += code[i] as string;
            i++;
          }
          continue;
        }
        if (code[i] === stringChar) {
          inString = false;
        }
      }
      result += code[i] as string;
      i++;
    }
    return result;
  }

  private removePythonComments(code: string): string {
    let result = '';
    let i = 0;
    const len = code.length;
    let inTriple = false;
    let tripleChar = '';

    while (i < len) {
      if (!inTriple) {
        if (code[i] === '#') {
          while (i < len && code[i] !== '\n') i++;
          continue;
        }
        if ((code[i] === '"' && code[i + 1] === '"' && code[i + 2] === '"') ||
            (code[i] === "'" && code[i + 1] === "'" && code[i + 2] === "'")) {
          inTriple = true;
          tripleChar = code[i] as string;
          i += 3;
          result += tripleChar.repeat(3);
          continue;
        }
      } else {
        if (code[i] === tripleChar && code[i + 1] === tripleChar && code[i + 2] === tripleChar) {
          inTriple = false;
          i += 3;
          result += tripleChar.repeat(3);
          continue;
        }
      }
      result += code[i] as string;
      i++;
    }
    return result;
  }
}
