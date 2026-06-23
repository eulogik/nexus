export type ProviderType = 'openrouter' | 'anthropic' | 'openai' | 'google' | 'local';

export interface ModelDefinition {
  id: string;
  name: string;
  provider: ProviderType;
  protocol: 'openai' | 'anthropic' | 'google';
  contextWindow: number;
  maxOutputTokens: number;
  supportsVision: boolean;
  supportsToolUse: boolean;
  supportsStreaming: boolean;
  supportsReasoning: boolean;
  inputCostPer1M: number;
  outputCostPer1M: number;
  tier: 'free' | 'cheap' | 'standard' | 'premium';
  isFree: boolean;
  isLocal: boolean;
  typicalLatency: number;
  qualityScore: number;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: {
    input: number;
    output: number;
    total: number;
  };
  model: string;
  id: string;
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'done';
  content?: string;
  toolCall?: ToolCall;
  usage?: { input: number; output: number; total: number };
  error?: string;
}

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  model: string;
}

export interface RateLimitInfo {
  remaining: number;
  reset: number;
  limit: number;
  isLimited: boolean;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  preferredModels?: string[];
  enabled: boolean;
  timeout?: number;
  retries?: number;
}

export interface RoutingDecision {
  strategy: 'cost' | 'latency' | 'quality' | 'fallback' | 'manual';
  preferredProvider?: ProviderType;
  preferredModel?: string;
  maxCost?: number;
  requireToolUse?: boolean;
  requireVision?: boolean;
  requireStreaming?: boolean;
}

export interface SessionCost {
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  model: string;
  provider: ProviderType;
  timestamp: number;
}

export interface CostBudget {
  dailyLimit: number;
  monthlyLimit: number;
  sessionLimit: number;
  warnAtPercent: number;
}

export interface ProviderError extends Error {
  code: 'RATE_LIMITED' | 'TIMEOUT' | 'AUTH_ERROR' | 'INVALID_REQUEST' | 'SERVER_ERROR' | 'NETWORK_ERROR' | 'CONTEXT_LENGTH' | 'UNKNOWN';
  statusCode?: number;
  retryable: boolean;
}

export interface NexusConfig {
  providers: Partial<Record<ProviderType, ProviderConfig>>;
  budget?: CostBudget;
  defaultRouting?: RoutingDecision;
}
