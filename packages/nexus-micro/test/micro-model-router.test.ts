import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from '../src/types.js';

const mockEngineInstance = {
  initialize: vi.fn(),
  prompt: vi.fn(),
  dispose: vi.fn(),
  isInitialized: false,
};

vi.mock('../src/engine.js', () => ({
  MicroModelEngine: vi.fn(() => mockEngineInstance),
  ROUTER_SYSTEM_PROMPT: 'mock system prompt',
}));

const { MicroModelRouter } = await import('../src/micro-model-router.js');

const defaultSession: Session = {
  messages: [],
  cost: { budgetRemaining: 1 },
};

function suppressConsoleWarn() {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
}

function suppressConsoleError() {
  vi.spyOn(console, 'error').mockImplementation(() => {});
}

describe('MicroModelRouter', () => {
  let router: MicroModelRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEngineInstance.isInitialized = false;
    router = new MicroModelRouter();
  });

  describe('route() fallback behavior', () => {
    it('route() falls back to RuleBasedRouter when engine not initialized', async () => {
      suppressConsoleWarn();

      const decision = await router.route('read file', defaultSession);

      expect(decision.intent).toBe('read');
      expect(decision.complexity).toBeGreaterThanOrEqual(0);
      expect(decision.complexity).toBeLessThanOrEqual(1);
      expect(mockEngineInstance.prompt).not.toHaveBeenCalled();
    });

    it('route() returns valid RoutingDecision shape on fallback', async () => {
      suppressConsoleWarn();

      const decision = await router.route('read file', defaultSession);

      expect(decision).toHaveProperty('intent');
      expect(decision).toHaveProperty('complexity');
      expect(decision).toHaveProperty('model');
      expect(decision).toHaveProperty('compression');
      expect(decision).toHaveProperty('approval');
      expect(decision).toHaveProperty('reason');
      expect(decision).toHaveProperty('estimatedTokens');
      expect(decision).toHaveProperty('estimatedCost');
      expect(decision).toHaveProperty('suggestedTools');
      expect(decision).toHaveProperty('suggestedModels');
      expect(decision).toHaveProperty('fallbackStrategy');
      expect(decision).toHaveProperty('confidence');
    });
  });

  describe('initialize()', () => {
    it('initialize() gracefully handles missing model file (logs warning, does not crash)', async () => {
      suppressConsoleWarn();
      suppressConsoleError();

      mockEngineInstance.initialize.mockRejectedValue(new Error('Model file not found'));

      await expect(router.initialize()).resolves.not.toThrow();
      expect(mockEngineInstance.initialize).toHaveBeenCalledOnce();
      expect(mockEngineInstance.isInitialized).toBe(false);
    });

    it('initialize() succeeds and sets initialized flag', async () => {
      mockEngineInstance.initialize.mockResolvedValue(undefined);
      mockEngineInstance.isInitialized = true;

      await router.initialize();

      expect(mockEngineInstance.initialize).toHaveBeenCalledOnce();
    });

    it('initialize() passes config to engine with defaults when no config provided', async () => {
      mockEngineInstance.initialize.mockResolvedValue(undefined);
      mockEngineInstance.isInitialized = true;

      await router.initialize();

      expect(mockEngineInstance.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'local',
          model: expect.any(String),
          quantization: 'q4_k_m',
          contextSize: 4096,
          gpuLayers: 0,
          threads: 4,
        }),
      );
    });
  });

  describe('dispose()', () => {
    it('dispose() cleans up resources', async () => {
      router.dispose();

      expect(mockEngineInstance.dispose).toHaveBeenCalledOnce();
    });

    it('dispose() resets initialized flag', async () => {
      mockEngineInstance.isInitialized = true;

      router.dispose();

      expect(mockEngineInstance.dispose).toHaveBeenCalledOnce();
    });
  });

  describe('route() after initialization', () => {
    it('route() uses engine prompt when initialized', async () => {
      suppressConsoleWarn();

      mockEngineInstance.initialize.mockResolvedValue(undefined);
      mockEngineInstance.isInitialized = true;
      mockEngineInstance.prompt.mockResolvedValue(JSON.stringify({
        intent: 'read',
        complexity: 0.3,
        model: 'free',
        compression: 'prose-compressor',
        approval: 'auto',
        reason: 'Simple file read',
        estimatedTokens: 500,
        estimatedCost: 0,
        suggestedTools: ['Read'],
        suggestedModels: [],
        fallbackStrategy: 'direct',
        confidence: 0.8,
      }));

      await router.initialize();
      const decision = await router.route('read file', defaultSession);

      expect(mockEngineInstance.prompt).toHaveBeenCalled();
      expect(decision.intent).toBe('read');
      expect(decision.confidence).toBeLessThanOrEqual(0.85);
    });

    it('route() falls back when model returns invalid JSON', async () => {
      suppressConsoleWarn();
      suppressConsoleError();

      mockEngineInstance.initialize.mockResolvedValue(undefined);
      mockEngineInstance.isInitialized = true;
      mockEngineInstance.prompt.mockResolvedValue('not json at all');

      await router.initialize();
      const decision = await router.route('read file', defaultSession);

      expect(decision.intent).toBe('read');
      expect(mockEngineInstance.prompt).toHaveBeenCalled();
    });

    it('route() falls back when validation fails', async () => {
      suppressConsoleWarn();
      suppressConsoleError();

      mockEngineInstance.initialize.mockResolvedValue(undefined);
      mockEngineInstance.isInitialized = true;
      mockEngineInstance.prompt.mockResolvedValue(JSON.stringify({
        intent: 'INVALID',
        complexity: 999,
      }));

      await router.initialize();
      const decision = await router.route('read file', defaultSession);

      expect(decision.intent).toBe('read');
    });
  });
});
