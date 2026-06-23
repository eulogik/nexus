import type {
  LLMRequest,
  LLMResponse,
  StreamChunk,
  ModelDefinition,
  ProviderType,
  ProviderConfig,
  RoutingDecision,
  NexusConfig,
} from './types.js';
import { AbstractProvider } from './provider.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenAIProvider } from './providers/openai.js';
import { GoogleProvider } from './providers/google.js';
import { CostTracker } from './cost-tracker.js';

const BUILTIN_MODELS: ModelDefinition[] = [
  {
    id: 'qwen/qwen3-235b-a22b:free',
    name: 'Qwen3 235B-A22B (Free)',
    provider: 'openrouter',
    protocol: 'openai',
    contextWindow: 32768,
    maxOutputTokens: 4096,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
    supportsReasoning: false,
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    tier: 'free',
    isFree: true,
    isLocal: false,
    typicalLatency: 3000,
    qualityScore: 7,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B (Free)',
    provider: 'openrouter',
    protocol: 'openai',
    contextWindow: 32768,
    maxOutputTokens: 4096,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
    supportsReasoning: false,
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    tier: 'free',
    isFree: true,
    isLocal: false,
    typicalLatency: 3000,
    qualityScore: 7,
  },
  {
    id: 'google/gemini-2.0-flash-001',
    name: 'Gemini 2.0 Flash',
    provider: 'openrouter',
    protocol: 'openai',
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    supportsReasoning: false,
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
    tier: 'cheap',
    isFree: false,
    isLocal: false,
    typicalLatency: 1500,
    qualityScore: 8,
  },
  {
    id: 'anthropic/claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'openrouter',
    protocol: 'openai',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    supportsReasoning: false,
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    tier: 'standard',
    isFree: false,
    isLocal: false,
    typicalLatency: 2000,
    qualityScore: 9,
  },
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4 (Direct)',
    provider: 'anthropic',
    protocol: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    supportsReasoning: false,
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    tier: 'standard',
    isFree: false,
    isLocal: false,
    typicalLatency: 2000,
    qualityScore: 9,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    protocol: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    supportsReasoning: false,
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    tier: 'standard',
    isFree: false,
    isLocal: false,
    typicalLatency: 1500,
    qualityScore: 9,
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash (Direct)',
    provider: 'google',
    protocol: 'google',
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    supportsReasoning: false,
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
    tier: 'cheap',
    isFree: false,
    isLocal: false,
    typicalLatency: 1500,
    qualityScore: 8,
  },
];

export class ProviderRegistry {
  private providers: Map<ProviderType, AbstractProvider> = new Map();
  private models: ModelDefinition[] = [...BUILTIN_MODELS];
  private costTracker?: CostTracker;
  private fallbackOrder: ProviderType[] = ['openrouter', 'anthropic', 'openai', 'google'];

  constructor(config?: NexusConfig) {
    if (config?.budget) {
      this.costTracker = new CostTracker(config.budget);
    }

    this.initializeProviders(config?.providers);
  }

  private initializeProviders(providerConfigs?: Partial<Record<ProviderType, ProviderConfig>>): void {
    const configs = providerConfigs ?? {};

    const openrouterCfg = configs.openrouter;
    if (openrouterCfg?.enabled ?? true) {
      this.providers.set('openrouter', new OpenRouterProvider({
        apiKey: openrouterCfg?.apiKey,
        baseUrl: openrouterCfg?.baseUrl,
        enabled: openrouterCfg?.enabled ?? true,
        timeout: openrouterCfg?.timeout,
        retries: openrouterCfg?.retries,
      }));
    }

    const anthropicCfg = configs.anthropic;
    if (anthropicCfg?.apiKey && (anthropicCfg?.enabled ?? true)) {
      this.providers.set('anthropic', new AnthropicProvider({
        apiKey: anthropicCfg.apiKey,
        baseUrl: anthropicCfg.baseUrl,
        enabled: anthropicCfg.enabled,
        timeout: anthropicCfg.timeout,
        retries: anthropicCfg.retries,
      }));
    }

    const openaiCfg = configs.openai;
    if (openaiCfg?.apiKey && (openaiCfg?.enabled ?? true)) {
      this.providers.set('openai', new OpenAIProvider({
        apiKey: openaiCfg.apiKey,
        baseUrl: openaiCfg.baseUrl,
        enabled: openaiCfg.enabled,
        timeout: openaiCfg.timeout,
        retries: openaiCfg.retries,
      }));
    }

    const googleCfg = configs.google;
    if (googleCfg?.apiKey && (googleCfg?.enabled ?? true)) {
      this.providers.set('google', new GoogleProvider({
        apiKey: googleCfg.apiKey,
        baseUrl: googleCfg.baseUrl,
        enabled: googleCfg.enabled,
        timeout: googleCfg.timeout,
        retries: googleCfg.retries,
      }));
    }
  }

  registerProvider(type: ProviderType, provider: AbstractProvider): void {
    this.providers.set(type, provider);
  }

  getProvider(type: ProviderType): AbstractProvider | undefined {
    return this.providers.get(type);
  }

  getModels(): ModelDefinition[] {
    return this.models;
  }

  addModel(model: ModelDefinition): void {
    const existing = this.models.findIndex((m) => m.id === model.id);
    if (existing >= 0) {
      this.models[existing] = model;
    } else {
      this.models.push(model);
    }
  }

  setModels(models: ModelDefinition[]): void {
    this.models = [...BUILTIN_MODELS, ...models.filter((m) => !BUILTIN_MODELS.find((b) => b.id === m.id))];
  }

  setFallbackOrder(order: ProviderType[]): void {
    this.fallbackOrder = order;
  }

  getCostTracker(): CostTracker | undefined {
    return this.costTracker;
  }

  /** Select the best model based on routing decision. */
  selectModel(routing: RoutingDecision, _config?: NexusConfig): ModelDefinition {
    const candidates = this.filterModels(routing);

    if (candidates.length === 0) {
      throw new Error(`No model matches the routing criteria: ${JSON.stringify(routing)}`);
    }

    switch (routing.strategy) {
      case 'cost':
        return candidates.sort((a, b) => (a.inputCostPer1M + a.outputCostPer1M) - (b.inputCostPer1M + b.outputCostPer1M))[0]!;
      case 'latency':
        return candidates.sort((a, b) => a.typicalLatency - b.typicalLatency)[0]!;
      case 'quality':
        return candidates.sort((a, b) => b.qualityScore - a.qualityScore)[0]!;
      case 'manual':
        if (routing.preferredModel) {
          const preferred = candidates.find((m) => m.id === routing.preferredModel);
          if (preferred) return preferred;
        }
        if (routing.preferredProvider) {
          const byProvider = candidates.filter((m) => m.provider === routing.preferredProvider);
          if (byProvider.length > 0) return byProvider[0]!;
        }
        return candidates[0]!;
      case 'fallback':
      default:
        return candidates[0]!;
    }
  }

  private filterModels(routing: RoutingDecision): ModelDefinition[] {
    let candidates = [...this.models];

    if (routing.preferredProvider) {
      const byProvider = candidates.filter((m) => m.provider === routing.preferredProvider);
      if (byProvider.length > 0) candidates = byProvider;
    }

    if (routing.preferredModel) {
      const exact = candidates.find((m) => m.id === routing.preferredModel);
      if (exact) return [exact];
    }

    if (routing.requireToolUse) {
      candidates = candidates.filter((m) => m.supportsToolUse);
    }

    if (routing.requireVision) {
      candidates = candidates.filter((m) => m.supportsVision);
    }

    if (routing.requireStreaming) {
      candidates = candidates.filter((m) => m.supportsStreaming);
    }

    if (routing.maxCost !== undefined) {
      candidates = candidates.filter(
        (m) => !m.isFree && (m.inputCostPer1M + m.outputCostPer1M) <= routing.maxCost!
      );
    }

    if (!routing.maxCost && routing.strategy === 'fallback') {
      const freeModels = candidates.filter((m) => m.isFree);
      if (freeModels.length > 0) candidates = freeModels;
    }

    return candidates;
  }

  /** Send a request using the best model from the routing decision. */
  async send(routing: RoutingDecision, request: LLMRequest, config?: NexusConfig): Promise<LLMResponse> {
    const model = this.selectModel(routing, config);

    const providerType = model.provider;
    let provider = this.providers.get(providerType);

    if (!provider) {
      if (providerType === 'openrouter') {
        provider = new OpenRouterProvider({ apiKey: '', enabled: true });
        this.providers.set('openrouter', provider);
      } else {
        throw new Error(`Provider '${providerType}' is not configured for model '${model.id}'`);
      }
    }

    const maxAttempts = this.fallbackOrder.length;
    const attemptedProviders = new Set<ProviderType>();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const currentProvider = provider;
      attemptedProviders.add(providerType);

      try {
        const modifiedRequest: LLMRequest = { ...request, model: model.id };

        const response = await currentProvider.send(modifiedRequest);

        if (this.costTracker && response.usage) {
          this.costTracker.addUsage(
            `session_${routing.strategy}`,
            { input: response.usage.input, output: response.usage.output },
            model,
          );
        }

        return response;
      } catch (error: unknown) {
        const err = error as { code?: string; retryable?: boolean };
        const isLastAttempt = attempt >= maxAttempts - 1;

        if (isLastAttempt) throw error;

        if (err.code === 'AUTH_ERROR' || err.code === 'INVALID_REQUEST') {
          throw error;
        }

        const fallbackProvider = this.findFallbackProvider(attemptedProviders);
        if (fallbackProvider) {
          const fallbackModels = this.models.filter((m) => m.provider === fallbackProvider);
          if (fallbackModels.length > 0) {
            const fbModel = fallbackModels[0]!;
            provider = this.providers.get(fallbackProvider)!;
            if (provider) {
              continue;
            }
          }
        }

        throw error;
      }
    }

    throw new Error(`All providers failed for request model '${request.model}'`);
  }

  /** Stream a response using the best model from routing decision. */
  async stream(routing: RoutingDecision, request: LLMRequest, config?: NexusConfig): Promise<AsyncIterable<StreamChunk>> {
    const model = this.selectModel(routing, config);
    const providerType = model.provider;
    const provider = this.providers.get(providerType);

    if (!provider) {
      throw new Error(`Provider '${providerType}' is not configured for model '${model.id}'`);
    }

    const modifiedRequest: LLMRequest = { ...request, model: model.id, stream: true };
    return provider.stream(modifiedRequest);
  }

  private findFallbackProvider(used: Set<ProviderType>): ProviderType | undefined {
    for (const pt of this.fallbackOrder) {
      if (!used.has(pt) && this.providers.has(pt)) {
        return pt;
      }
    }
    return undefined;
  }
}
