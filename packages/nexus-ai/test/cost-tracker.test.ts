import { describe, it, expect, beforeEach } from 'vitest';
import { CostTracker } from '../src/cost-tracker.js';
import type { ModelDefinition, CostBudget } from '../src/types.js';

const testModel: ModelDefinition = {
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
};

const freeModel: ModelDefinition = {
  ...testModel,
  id: 'qwen/qwen3-235b-a22b:free',
  name: 'Free Model',
  inputCostPer1M: 0,
  outputCostPer1M: 0,
  tier: 'free',
  isFree: true,
};

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  it('addUsage() tracks session correctly', () => {
    const session = tracker.addUsage('session-1', { input: 1000, output: 500 }, testModel);
    expect(session.sessionId).toBe('session-1');
    expect(session.inputTokens).toBe(1000);
    expect(session.outputTokens).toBe(500);
    expect(session.inputCost).toBe((1000 / 1_000_000) * 2.5);
    expect(session.outputCost).toBe((500 / 1_000_000) * 10.0);
    expect(session.totalCost).toBe(session.inputCost + session.outputCost);
    expect(session.model).toBe('gpt-4o');
  });

  it('tracks daily and monthly totals', () => {
    tracker.addUsage('session-1', { input: 1_000_000, output: 500_000 }, testModel);
    const expectedInputCost = (1_000_000 / 1_000_000) * 2.5;
    const expectedOutputCost = (500_000 / 1_000_000) * 10.0;
    const expectedTotal = expectedInputCost + expectedOutputCost;
    expect(tracker.dailyCost).toBeCloseTo(expectedTotal, 4);
    expect(tracker.monthlyCost).toBeCloseTo(expectedTotal, 4);
  });

  it('checkBudget() returns true when under budget', () => {
    const budget: CostBudget = { dailyLimit: 100, monthlyLimit: 1000, sessionLimit: 10, warnAtPercent: 0 };
    tracker.setBudget(budget);
    tracker.addUsage('session-1', { input: 1000, output: 500 }, testModel);
    expect(tracker.checkBudget()).toBe(true);
  });

  it('checkBudget() returns false when exceeded', () => {
    const budget: CostBudget = { dailyLimit: 0.001, monthlyLimit: 0.01, sessionLimit: 10, warnAtPercent: 0 };
    tracker.setBudget(budget);
    tracker.addUsage('session-1', { input: 1_000_000, output: 500_000 }, testModel);
    expect(tracker.checkBudget()).toBe(false);
  });

  it('budget warning triggers at correct percentage', () => {
    const budget: CostBudget = { dailyLimit: 100, monthlyLimit: 1000, sessionLimit: 10, warnAtPercent: 50 };
    tracker.setBudget(budget);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    tracker.addUsage('session-1', { input: 10_000_000, output: 5_000_000 }, testModel);
    tracker.checkBudget();
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('Budget warning');
    warnSpy.mockRestore();
  });

  it('free models have zero cost', () => {
    const session = tracker.addUsage('session-free', { input: 1_000_000, output: 500_000 }, freeModel);
    expect(session.inputCost).toBe(0);
    expect(session.outputCost).toBe(0);
    expect(session.totalCost).toBe(0);
  });

  it('estimateCost() returns correct values', () => {
    const estimate = tracker.estimateCost(testModel, 2000, 1000);
    expect(estimate.inputTokens).toBe(2000);
    expect(estimate.outputTokens).toBe(1000);
    expect(estimate.inputCost).toBe((2000 / 1_000_000) * 2.5);
    expect(estimate.outputCost).toBe((1000 / 1_000_000) * 10.0);
    expect(estimate.totalCost).toBe(estimate.inputCost + estimate.outputCost);
    expect(estimate.model).toBe('gpt-4o');
  });

  it('getAllSessions() returns tracked sessions', () => {
    tracker.addUsage('s1', { input: 100, output: 50 }, testModel);
    tracker.addUsage('s2', { input: 200, output: 100 }, testModel);
    const sessions = tracker.getAllSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.sessionId)).toEqual(['s1', 's2']);
  });

  it('reset() clears all data', () => {
    tracker.addUsage('s1', { input: 100, output: 50 }, testModel);
    expect(tracker.getAllSessions()).toHaveLength(1);
    tracker.reset();
    expect(tracker.getAllSessions()).toHaveLength(0);
    expect(tracker.dailyCost).toBe(0);
    expect(tracker.monthlyCost).toBe(0);
  });

  it('tracks tokensUsed (input, output, total)', () => {
    const session = tracker.addUsage('token-test', { input: 5000, output: 1500 }, testModel);
    expect(session.inputTokens).toBe(5000);
    expect(session.outputTokens).toBe(1500);
    expect(session.inputTokens + session.outputTokens).toBe(6500);
  });
});
