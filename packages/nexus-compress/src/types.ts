export type Aggressiveness = 'minimal' | 'balanced' | 'aggressive';

export interface CompressOptions {
  aggressiveness: Aggressiveness;
  preserveSignatures: boolean;
  maxCompressionRatio: number;
}

export interface CompressionResult {
  originalTokens: number;
  compressedTokens: number;
  savingsPercent: number;
  strategy: 'smart-crusher' | 'code-compressor' | 'prose-compressor' | 'none';
  reversible: boolean;
  originalContent?: string;
  content?: string;
}

export interface CompressorStrategy {
  canHandle(type: string, content: string): boolean;
  compress(content: string, options: CompressOptions): CompressionResult;
}

export interface Message {
  role: string;
  id: string;
  timestamp: number;
  content: string;
  [key: string]: unknown;
}

export interface MessageCompressionResult {
  messages: Message[];
  totalSavings: number;
  strategies: string[];
}
