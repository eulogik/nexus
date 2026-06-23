export type Intent =
  | 'read'
  | 'write'
  | 'edit'
  | 'bash'
  | 'search'
  | 'explain'
  | 'debug'
  | 'refactor'
  | 'test'
  | 'deploy'
  | 'unknown';

export type ModelTier = 'free' | 'cheap' | 'standard' | 'premium';

export type CompressionMethod = 'smart-crusher' | 'code-compressor' | 'prose-compressor';

export type ApprovalLevel = 'auto' | 'notify' | 'ask';

export type FallbackStrategy = 'direct' | 'cascade' | 'parallel' | 'ask_user';

export type Quantization = 'q4_0' | 'q4_k_m' | 'q5_k_m' | 'q8_0';

export interface RoutingDecision {
  intent: Intent;
  complexity: number;
  model: ModelTier;
  compression: CompressionMethod;
  approval: ApprovalLevel;
  reason: string;
  estimatedTokens: number;
  estimatedCost: number;
  suggestedTools: string[];
  suggestedModels: string[];
  fallbackStrategy: FallbackStrategy;
  confidence: number;
}

export interface MicroModelConfig {
  provider: string;
  model: string;
  quantization: Quantization;
  contextSize: number;
  gpuLayers: number;
  threads: number;
  downloadUrl?: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Session {
  messages: Message[];
  cost: { budgetRemaining: number };
}

export interface Router {
  route(userRequest: string, session: Session): Promise<RoutingDecision>;
}
