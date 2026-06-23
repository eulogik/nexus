import { describe, it, expect } from 'vitest';
import { validateRoutingDecision } from '../src/validator.js';
import type { RoutingDecision } from '../src/types.js';

const validDecision: RoutingDecision = {
  intent: 'read',
  complexity: 0.3,
  model: 'free',
  compression: 'prose-compressor',
  approval: 'auto',
  reason: 'Simple read operation',
  estimatedTokens: 500,
  estimatedCost: 0,
  suggestedTools: ['Read', 'Glob'],
  suggestedModels: ['qwen/qwen3-235b-a22b:free'],
  fallbackStrategy: 'direct',
  confidence: 0.6,
};

describe('validateRoutingDecision', () => {
  it('accepts a valid decision object', () => {
    const result = validateRoutingDecision(validDecision);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects missing intent', () => {
    const { intent, ...rest } = validDecision;
    const result = validateRoutingDecision(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('intent'))).toBe(true);
  });

  it('rejects invalid intent value', () => {
    const result = validateRoutingDecision({ ...validDecision, intent: 'invalid-intent' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('intent'))).toBe(true);
  });

  it('rejects complexity < 0', () => {
    const result = validateRoutingDecision({ ...validDecision, complexity: -0.1 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Complexity'))).toBe(true);
  });

  it('rejects complexity > 1', () => {
    const result = validateRoutingDecision({ ...validDecision, complexity: 1.5 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Complexity'))).toBe(true);
  });

  it('rejects invalid model tier', () => {
    const result = validateRoutingDecision({ ...validDecision, model: 'ultra-premium' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('model tier'))).toBe(true);
  });

  it('rejects invalid compression method', () => {
    const result = validateRoutingDecision({ ...validDecision, compression: 'zip' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('compression'))).toBe(true);
  });

  it('rejects invalid approval level', () => {
    const result = validateRoutingDecision({ ...validDecision, approval: 'maybe' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('approval'))).toBe(true);
  });

  it('rejects confidence < 0', () => {
    const result = validateRoutingDecision({ ...validDecision, confidence: -0.5 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Confidence'))).toBe(true);
  });

  it('rejects confidence > 1', () => {
    const result = validateRoutingDecision({ ...validDecision, confidence: 2 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Confidence'))).toBe(true);
  });

  it('rejects estimatedTokens <= 0', () => {
    const result = validateRoutingDecision({ ...validDecision, estimatedTokens: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('EstimatedTokens'))).toBe(true);
  });

  it('returns errors array with descriptions', () => {
    const result = validateRoutingDecision({
      ...validDecision,
      intent: 'bad',
      model: 'worse',
    });
    expect(result.valid).toBe(false);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    for (const err of result.errors) {
      expect(typeof err).toBe('string');
      expect(err.length).toBeGreaterThan(0);
    }
  });

  it('returns valid=true for correct decision', () => {
    const result = validateRoutingDecision(validDecision);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects non-object input', () => {
    const result = validateRoutingDecision(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Decision must be a non-null object');
  });

  it('rejects missing estimatedCost', () => {
    const { estimatedCost, ...rest } = validDecision;
    const result = validateRoutingDecision(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('EstimatedCost'))).toBe(true);
  });

  it('rejects non-array suggestedTools', () => {
    const result = validateRoutingDecision({ ...validDecision, suggestedTools: 'not-an-array' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('SuggestedTools'))).toBe(true);
  });

  it('rejects non-array suggestedModels', () => {
    const result = validateRoutingDecision({ ...validDecision, suggestedModels: null });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('SuggestedModels'))).toBe(true);
  });

  it('rejects invalid fallbackStrategy', () => {
    const result = validateRoutingDecision({ ...validDecision, fallbackStrategy: 'teleport' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('fallbackStrategy'))).toBe(true);
  });

  it('rejects empty reason', () => {
    const result = validateRoutingDecision({ ...validDecision, reason: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Reason'))).toBe(true);
  });
});
