import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderRegistry } from '../src/registry.js';
import { AbstractProvider } from '../src/provider.js';
import type { LLMRequest, LLMResponse, StreamChunk, CostEstimate, ModelDefinition, ProviderConfig, RoutingDecision, NexusConfig } from '../src/types.js';

class MockProvider extends AbstractProvider {
  public sendCalled = false;
  public streamCalled = false;

  constructor(name: string, config: ProviderConfig) {
    super(name, config);
  }

  protected getDefaultBaseUrl(): string {
    return `https://${this.name}.api.com/v1`;
  }

  protected getAuthHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.config.apiKey ?? ''}` };
  }

  async send(_request: LLMRequest): Promise<LLMResponse> {
    this.sendCalled = true;
    return { content: 'ok', usage: { input: 10, output: 5, total: 15 }, model: 'test', id: 'test-id' };
  }

  async stream(_request: LLMRequest): Promise<AsyncIterable<StreamChunk>> {
    this.streamCalled = true;
    return { async *[Symbol.asyncIterator]() { yield { type: 'text', content: 'stream' }; yield { type: 'done' }; } };
  }

  estimateCost(inputTokens: number, outputTokens: number, _model: ModelDefinition): CostEstimate {
    return { inputTokens, outputTokens, inputCost: 0, outputCost: 0, totalCost: 0, model: 'test' };
  }
}

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('registerProvider adds a provider', () => {
    const provider = new MockProvider('openai', { apiKey: 'sk-test', enabled: true });
    registry.registerProvider('openai', provider);
    expect(registry.getProvider('openai')).toBe(provider);
  });

  it('getProvider returns registered provider', () => {
    const provider = new MockProvider('anthropic', { apiKey: 'sk-ant', enabled: true });
    registry.registerProvider('anthropic', provider);
    expect(registry.getProvider('anthropic')).toBe(provider);
  });

  it('getProvider returns undefined for unknown provider', () => {
    expect(registry.getProvider('local')).toBeUndefined();
  });

  it('getModels returns model definitions', () => {
    const models = registry.getModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty('id');
    expect(models[0]).toHaveProperty('provider');
  });

  it('addModel adds a custom model', () => {
    const customModel: ModelDefinition = {
      id: 'my-custom-model',
      name: 'Custom',
      provider: 'openai',
      protocol: 'openai',
      contextWindow: 4096,
      maxOutputTokens: 1024,
      supportsVision: false,
      supportsToolUse: false,
      supportsStreaming: true,
      supportsReasoning: false,
      inputCostPer1M: 1,
      outputCostPer1M: 2,
      tier: 'standard',
      isFree: false,
      isLocal: false,
      typicalLatency: 1000,
      qualityScore: 5,
    };
    registry.addModel(customModel);
    const models = registry.getModels();
    expect(models.find((m) => m.id === 'my-custom-model')).toBeTruthy();
  });

  it('setModels replaces all models', () => {
    const custom: ModelDefinition = {
      id: 'only-model',
      name: 'Only Model',
      provider: 'openrouter',
      protocol: 'openai',
      contextWindow: 4096,
      maxOutputTokens: 1024,
      supportsVision: false,
      supportsToolUse: false,
      supportsStreaming: false,
      supportsReasoning: false,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      tier: 'free',
      isFree: true,
      isLocal: false,
      typicalLatency: 100,
      qualityScore: 5,
    };
    registry.setModels([custom]);
    const models = registry.getModels();
    expect(models.find((m) => m.id === 'only-model')).toBeTruthy();
  });

  it('selectModel returns correct model based on routing', () => {
    const model = registry.selectModel({ strategy: 'cost', maxCost: 1 });
    expect(model).toBeTruthy();
    expect(model.inputCostPer1M + model.outputCostPer1M).toBeLessThanOrEqual(1);
  });

  it('selectModel handles free model routing', () => {
    const model = registry.selectModel({ strategy: 'fallback' });
    expect(model).toBeTruthy();
    expect(model.isFree).toBe(true);
  });

  it('setFallbackOrder sets provider fallback chain', () => {
    registry.setFallbackOrder(['openai', 'anthropic']);
    expect(registry.getProvider('openai')).toBeUndefined();
    registry.setFallbackOrder(['openai', 'anthropic', 'google', 'openrouter']);
  });

  it('send delegates to correct provider', async () => {
    const provider = new MockProvider('openai', { apiKey: 'sk-test', enabled: true });
    registry.registerProvider('openai', provider);
    const response = await registry.send(
      { strategy: 'manual', preferredModel: 'gpt-4o', preferredProvider: 'openai' },
      { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] },
    );
    expect(response).toBeTruthy();
    expect(provider.sendCalled).toBe(true);
  });

  it('stream delegates to correct provider', async () => {
    const provider = new MockProvider('openai', { apiKey: 'sk-test', enabled: true });
    registry.registerProvider('openai', provider);
    const stream = await registry.stream(
      { strategy: 'manual', preferredModel: 'gpt-4o', preferredProvider: 'openai' },
      { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] },
    );
    expect(stream).toBeTruthy();
    expect(provider.streamCalled).toBe(true);
  });
});
