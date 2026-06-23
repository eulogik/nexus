import type { Message } from './types.js';

const TOKENS_PER_CHAR = 0.25;

export function countTokens(text: string): number {
  if (!text) return 0;
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0x7ff) {
      count += 2;
    } else if (code > 0x7f) {
      count += 1.5;
    } else {
      count += 1;
    }
  }
  return Math.ceil(count * TOKENS_PER_CHAR);
}

export function countMessageTokens(msg: Message): number {
  let total = countTokens(msg.content || '');
  if (msg.role) total += countTokens(msg.role);
  if (typeof (msg as Record<string, unknown>).toolName === 'string') {
    total += countTokens((msg as Record<string, unknown>).toolName as string);
  }
  if (typeof (msg as Record<string, unknown>).model === 'string') {
    total += countTokens((msg as Record<string, unknown>).model as string);
  }
  return total;
}

export function countToolOutputTokens(output: string | Record<string, unknown>): number {
  if (typeof output === 'string') return countTokens(output);
  return countTokens(JSON.stringify(output));
}
