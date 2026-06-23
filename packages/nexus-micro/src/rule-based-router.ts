import type { Router, RoutingDecision, Session, Intent, ModelTier, CompressionMethod, ApprovalLevel } from './types.js';

const FREE_MODELS = ['qwen/qwen3-235b-a22b:free', 'deepseek/deepseek-chat-v3:free'];
const CHEAP_MODELS = ['google/gemini-1.5-flash', 'anthropic/claude-haiku-4.1'];
const STANDARD_MODELS = ['anthropic/claude-sonnet-4.6', 'openai/gpt-4o'];
const PREMIUM_MODELS = ['anthropic/claude-opus-4.7', 'openai/gpt-4o'];

const INTENT_TOOLS: Record<Intent, string[]> = {
  read: ['Read', 'Glob', 'Grep', 'ListFiles'],
  write: ['Write', 'CreateFile', 'Edit'],
  edit: ['Edit', 'Read', 'Write'],
  bash: ['Bash', 'ExecuteCommand'],
  search: ['Grep', 'Glob', 'Search'],
  explain: ['Read', 'Explain'],
  debug: ['Bash', 'Read', 'Grep'],
  refactor: ['Edit', 'Read', 'Write', 'Grep'],
  test: ['Bash', 'Read', 'Write'],
  deploy: ['Bash', 'ExecuteCommand'],
  unknown: ['Read', 'Grep', 'Bash'],
};

const ALLOWED_DESTRUCTIVE_TOKENS = /rm\s|delete|reset|push|deploy/i;

export class RuleBasedRouter implements Router {
  private readonly intentPatterns: Map<RegExp, Intent> = new Map([
    [/read|open|show|display|cat|list|view|get\s+file|print/i, 'read'],
    [/create|write\s+file|new\s+file|generate|make\s+new|touch/i, 'write'],
    [/edit|update|change|modify|alter|replace|rename|mv|patch/i, 'edit'],
    [/bash|terminal|shell|run|execute|command|sh\s|zsh|\.command|npm\s|yarn\s|npx|docker|git\s/i, 'bash'],
    [/search|find|grep|locate|where\s+is|look\s+for|find\s+file/i, 'search'],
    [/explain|what\s+does|how\s+does|why\s+does|describe|clarify|elaborate/i, 'explain'],
    [/debug|fix|bug|error|issue|not\s+working|broken|crash|failing/i, 'debug'],
    [/refactor|restructure|rewrite|reorganize|clean\s+up|improve|optimize/i, 'refactor'],
    [/test|spec|unit\s+test|integration\s+test|jest|vitest|pytest|run\s+test/i, 'test'],
    [/deploy|release|publish|ship|push\s+to\s+prod|rollout|ci\s*\/?\s*cd/i, 'deploy'],
  ]);

  async route(userRequest: string, session: Session): Promise<RoutingDecision> {
    const intent = this.detectIntent(userRequest);
    const complexity = this.estimateComplexity(userRequest, session);
    const model = this.selectModelTier(complexity, session.cost.budgetRemaining);
    const compression = this.selectCompression(userRequest, intent);
    const approval = this.selectApproval(intent, userRequest);
    const estimatedTokens = this.estimateTokens(userRequest, session);
    const suggestedTools = this.suggestTools(intent, userRequest);
    const suggestedModels = this.suggestModels(model);

    return {
      intent,
      complexity,
      model,
      compression,
      approval,
      reason: `Rule-based routing: detected intent "${intent}" with complexity ${complexity.toFixed(2)}`,
      estimatedTokens,
      estimatedCost: model === 'free' ? 0 : estimatedTokens * 0.000002,
      suggestedTools,
      suggestedModels,
      fallbackStrategy: complexity > 0.6 ? 'cascade' : 'direct',
      confidence: 0.6,
    };
  }

  private detectIntent(request: string): Intent {
    for (const [pattern, intent] of this.intentPatterns) {
      if (pattern.test(request)) {
        return intent;
      }
    }
    return 'unknown';
  }

  private estimateComplexity(request: string, session: Session): number {
    let score = 0.3;

    if (request.length > 200) {
      score += 0.1;
    }

    const highComplexityKeywords = /refactor|architecture|multi-file|across|entire/i;
    if (highComplexityKeywords.test(request)) {
      score += 0.3;
    }

    if (session.messages.length > 10) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  private selectModelTier(complexity: number, budgetRemaining: number): ModelTier {
    if (budgetRemaining < 0.5) {
      return 'free';
    }

    if (complexity > 0.7) {
      return 'standard';
    }

    if (complexity > 0.4) {
      return 'cheap';
    }

    return 'free';
  }

  private selectCompression(request: string, intent: Intent): CompressionMethod {
    const dataKeywords = /json|api|response|data|xml|yaml|config/i;
    const codeKeywords = /code|function|class|import|export|const|let|var|def|fn|impl|trait|interface|type/i;

    if (dataKeywords.test(request) || intent === 'search') {
      return 'smart-crusher';
    }

    if (codeKeywords.test(request) || ['write', 'edit', 'refactor', 'test'].includes(intent)) {
      return 'code-compressor';
    }

    return 'prose-compressor';
  }

  private selectApproval(intent: Intent, request: string): ApprovalLevel {
    if (intent === 'write' || intent === 'edit' || intent === 'bash') {
      if (intent === 'bash' && ALLOWED_DESTRUCTIVE_TOKENS.test(request)) {
        return 'ask';
      }
      if (intent === 'write') {
        return 'notify';
      }
      if (intent === 'edit') {
        return 'notify';
      }
      if (intent === 'bash') {
        return 'notify';
      }
    }

    if (intent === 'deploy') {
      return 'ask';
    }

    return 'auto';
  }

  private estimateTokens(text: string, session: Session): number {
    const messageText = session.messages.map((m) => m.content).join(' ');
    return Math.ceil((text + messageText).length / 4) + 500;
  }

  private suggestTools(intent: Intent, _request: string): string[] {
    return INTENT_TOOLS[intent] ?? INTENT_TOOLS.unknown;
  }

  private suggestModels(tier: ModelTier): string[] {
    switch (tier) {
      case 'free':
        return FREE_MODELS;
      case 'cheap':
        return CHEAP_MODELS;
      case 'standard':
        return STANDARD_MODELS;
      case 'premium':
        return PREMIUM_MODELS;
    }
  }
}
