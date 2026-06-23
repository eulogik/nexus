import type { RoutingDecision, Intent, ModelTier, CompressionMethod, ApprovalLevel, FallbackStrategy } from './types.js';

const VALID_INTENTS: Intent[] = ['read', 'write', 'edit', 'bash', 'search', 'explain', 'debug', 'refactor', 'test', 'deploy', 'unknown'];
const VALID_MODEL_TIERS: ModelTier[] = ['free', 'cheap', 'standard', 'premium'];
const VALID_COMPRESSION: CompressionMethod[] = ['smart-crusher', 'code-compressor', 'prose-compressor'];
const VALID_APPROVAL: ApprovalLevel[] = ['auto', 'notify', 'ask'];
const VALID_FALLBACK: FallbackStrategy[] = ['direct', 'cascade', 'parallel', 'ask_user'];

export function validateRoutingDecision(decision: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!decision || typeof decision !== 'object') {
    return { valid: false, errors: ['Decision must be a non-null object'] };
  }

  const d = decision as Record<string, unknown>;

  if (!VALID_INTENTS.includes(d.intent as Intent)) {
    errors.push(`Invalid intent: "${String(d.intent)}". Must be one of: ${VALID_INTENTS.join(', ')}`);
  }

  if (typeof d.complexity !== 'number' || d.complexity < 0 || d.complexity > 1) {
    errors.push(`Complexity must be a number between 0 and 1, got: ${String(d.complexity)}`);
  }

  if (!VALID_MODEL_TIERS.includes(d.model as ModelTier)) {
    errors.push(`Invalid model tier: "${String(d.model)}". Must be one of: ${VALID_MODEL_TIERS.join(', ')}`);
  }

  if (!VALID_COMPRESSION.includes(d.compression as CompressionMethod)) {
    errors.push(`Invalid compression: "${String(d.compression)}". Must be one of: ${VALID_COMPRESSION.join(', ')}`);
  }

  if (!VALID_APPROVAL.includes(d.approval as ApprovalLevel)) {
    errors.push(`Invalid approval: "${String(d.approval)}". Must be one of: ${VALID_APPROVAL.join(', ')}`);
  }

  if (typeof d.confidence !== 'number' || d.confidence < 0 || d.confidence > 1) {
    errors.push(`Confidence must be a number between 0 and 1, got: ${String(d.confidence)}`);
  }

  if (typeof d.estimatedTokens !== 'number' || d.estimatedTokens <= 0) {
    errors.push(`EstimatedTokens must be a positive number, got: ${String(d.estimatedTokens)}`);
  }

  if (typeof d.estimatedCost !== 'number' || d.estimatedCost < 0) {
    errors.push(`EstimatedCost must be a non-negative number, got: ${String(d.estimatedCost)}`);
  }

  if (!Array.isArray(d.suggestedTools)) {
    errors.push('SuggestedTools must be an array');
  }

  if (!Array.isArray(d.suggestedModels)) {
    errors.push('SuggestedModels must be an array');
  }

  if (!VALID_FALLBACK.includes(d.fallbackStrategy as FallbackStrategy)) {
    errors.push(`Invalid fallbackStrategy: "${String(d.fallbackStrategy)}". Must be one of: ${VALID_FALLBACK.join(', ')}`);
  }

  if (typeof d.reason !== 'string' || d.reason.length === 0) {
    errors.push('Reason must be a non-empty string');
  }

  return { valid: errors.length === 0, errors };
}
