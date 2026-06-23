# NEXUS — Executable Specification v1.0
## The Universal Coding Agent Harness
### Zero Cost. Zero Dependencies. 100% Control.

---

## 0. EXECUTIVE SUMMARY

Nexus is a coding agent harness that replaces Claude Code, Codex, Cursor, and every other agent. It costs $0 to run by default, requires zero external dependencies, and gives developers complete control.

**Core Principles:**
1. **Embedded Everything** — No Ollama, no separate daemons, no external runtimes
2. **0.5B Local Micro-Model** — Handles routing, approval logic, and simple tasks locally
3. **Headroom Compression** — Token reduction via safe strategies, integrated natively
4. **Git-Native Sessions** — Every session is a Git branch, every change is a commit
5. **TypeScript Everywhere** — Single language, single toolchain
6. **Zero-Overhead Plugins** — Lazy-loaded, sandboxed, TypeScript ESM
7. **Free by Default** — Works out of the box with zero API costs via OpenRouter free models

**Target:** v1.0 CLI harness. Desktop and IDE extensions are v1.1+.

---

## 1. PROJECT STRUCTURE (v1.0 — CLI Only)

```
nexus/
├── packages/
│   ├── nexus-ai/              # Multi-provider LLM API (OpenRouter + direct)
│   ├── nexus-core/            # Agent runtime
│   ├── nexus-compress/        # Headroom-inspired compression
│   ├── nexus-micro/           # 0.5B local router model
│   ├── nexus-tui/             # Terminal UI (Ink)
│   └── nexus-plugin-sdk/      # Plugin development kit
├── apps/
│   ├── nexus-cli/             # Main CLI entry
│   └── nexus-sdk/             # Programmatic API
├── plugins/                     # Official plugins
├── docs/
│   ├── walkthrough.md           # LIVING DOCUMENT
│   ├── architecture.md
│   ├── api-reference.md
│   ├── plugin-development.md
│   └── user-guide.md
├── scripts/
│   ├── build.ts
│   ├── test.ts
│   ├── benchmark.ts
│   └── release.ts
├── package.json
├── tsconfig.base.json
├── turbo.json
├── pnpm-workspace.yaml
├── vitest.config.ts
└── README.md
```

---

## 2. DATA MODELS

### 2.1 Session

```typescript
interface Session {
  id: string;                    // UUID v4
  name: string;
  branch: string;                  // Git branch: nexus/{name}-{date}
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'paused' | 'completed' | 'error' | 'aborted';
  messages: Message[];
  metadata: {
    projectPath: string;
    model: string;
    compressionEnabled: boolean;
    maxCost: number | null;
    approvalLevel: 'auto' | 'notify' | 'ask';
    gitCommitBefore: string;
  };
  cost: {
    sessionTotal: number;
    dailyTotal: number;
    monthlyTotal: number;
    budgetRemaining: number;
    tokensUsed: { input: number; output: number; total: number; cacheReads?: number; cacheWrites?: number };
    savingsFromCompression: number;
    savingsFromFreeModels: number;
  };
}
```

### 2.2 Messages

```typescript
type Message = UserMessage | AssistantMessage | ToolMessage | SystemMessage;

interface UserMessage {
  role: 'user';
  id: string;
  timestamp: Date;
  content: string;
}

interface AssistantMessage {
  role: 'assistant';
  id: string;
  timestamp: Date;
  content: string;
  toolCalls?: ToolCall[];
  reasoning?: string;
  model: string;
  tokens: { input: number; output: number; total: number };
  cost: number;
  compressionSavings?: number;
}

interface ToolMessage {
  role: 'tool';
  id: string;
  timestamp: Date;
  toolCallId: string;
  toolName: string;
  result: { success: boolean; output: string; error?: string; exitCode?: number };
  tokens: number;
  compressed: boolean;
  originalTokens?: number;
}

interface SystemMessage {
  role: 'system';
  id: string;
  timestamp: Date;
  content: string;
  type: 'prompt' | 'error' | 'notification' | 'cost_warning';
}
```

### 2.3 Tool Call

```typescript
interface ToolCall {
  id: string;
  tool: 'read' | 'write' | 'edit' | 'bash' | string;
  arguments: ReadArgs | WriteArgs | EditArgs | BashArgs | Record<string, unknown>;
  status: 'pending_approval' | 'approved' | 'rejected' | 'running' | 'completed' | 'error';
  startedAt: Date;
  completedAt?: Date;
}

interface ReadArgs { path: string; offset?: number; limit?: number; encoding?: 'utf-8' | 'base64'; }
interface WriteArgs { path: string; content: string; encoding?: 'utf-8' | 'base64'; overwrite?: boolean; }
interface EditArgs { path: string; oldString: string; newString: string; expectedOccurrences?: number; }
interface BashArgs { command: string; cwd?: string; timeout?: number; env?: Record<string, string>; }
```

### 2.4 Model Definition

```typescript
interface ModelDefinition {
  id: string;
  name: string;
  provider: string;
  protocol: 'openrouter' | 'anthropic' | 'openai' | 'google' | 'local';
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
```

### 2.5 Routing Decision

```typescript
interface RoutingDecision {
  intent: 'read' | 'write' | 'edit' | 'bash' | 'search' | 'explain' | 'debug' | 'refactor' | 'test' | 'deploy' | 'unknown';
  complexity: number;              // 0-1
  model: 'free' | 'cheap' | 'standard' | 'premium';
  compression: 'none' | 'smart-crusher' | 'code-compressor' | 'prose-compressor';
  approval: 'auto' | 'notify' | 'ask';
  reason: string;
  estimatedTokens: number;
  estimatedCost: number;
  suggestedTools: string[];
  suggestedModels: string[];
  fallbackStrategy: 'direct' | 'cascade' | 'parallel' | 'ask_user';
  confidence: number;
}
```

### 2.6 Plugin Manifest

```typescript
interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  main: string;
  permissions: ('fs:read' | 'fs:write' | 'fs:delete' | 'process:spawn' | 'network:fetch' | 'network:listen' | 'git:read' | 'git:write' | 'env:read' | 'env:write')[];
  tools?: { name: string; description: string; parameters: JSONSchema }[];
  hooks?: { event: string; handler: string }[];
  commands?: { name: string; description: string; aliases?: string[] }[];
  ui?: { panels?: { id: string; title: string; component: string }[] };
}
```

### 2.7 Configuration

```typescript
interface NexusConfig {
  version: string;
  providers: Record<string, {
    apiKey?: string;
    baseUrl?: string;
    preferredModels?: string[];
    enabled: boolean;
    timeout?: number;
    retries?: number;
  }>;
  microModel: {
    provider: 'local';
    model: string;
    quantization: 'q4_0' | 'q4_k_m' | 'q5_k_m' | 'q8_0';
    contextSize: number;
    gpuLayers: number;
    threads: number;
    downloadUrl?: string;
  };
  budget: { dailyMax: number; warnAt: number; routeToFreeAt: number; perTaskMax?: number };
  approval: { defaultLevel: 'auto' | 'notify' | 'ask'; autoApprove: string[]; alwaysAsk: string[]; learnFromUser: boolean; maxAutoApproveConfidence: number };
  compression: { enabled: boolean; aggressiveness: 'minimal' | 'balanced' | 'aggressive'; preserveSignatures: boolean; maxCompressionRatio: number; strategies: { smartCrusher: boolean; codeCompressor: boolean; proseCompressor: boolean } };
  git: { enabled: boolean; autoBranch: boolean; commitMessageTemplate: string; squashOnComplete: boolean; ignorePatterns: string[] };
  plugins: { directory: string; autoLoad: string[]; sandbox: { enabled: boolean; memoryLimit: number; timeout: number; networkAllowlist: string[] } };
  ui: { theme: 'system' | 'dark' | 'light'; fontSize: number; showCost: boolean; showCompression: boolean; showReasoning: boolean; keyboardShortcuts: Record<string, string> };
  logging: { level: 'debug' | 'info' | 'warn' | 'error'; file?: string; maxSize: number; maxFiles: number; format: 'json' | 'pretty' };
}
```

---

## 3. CORE ALGORITHMS

### 3.1 Agent Loop

```typescript
async function runAgentLoop(session: Session, userInput: string, config: NexusConfig): Promise<AgentResult> {
  session.messages.push(createUserMessage(userInput));

  let routing: RoutingDecision;
  try {
    routing = await microModel.route(userInput, session);
    const validation = validateRoutingDecision(routing);
    if (!validation.valid) {
      logger.warn('Micro-model returned invalid routing, using fallback', validation.errors);
      routing = ruleBasedFallback(userInput, session);
    }
  } catch (e) {
    logger.warn('Micro-model routing failed, using rule-based fallback', e);
    routing = ruleBasedFallback(userInput, session);
  }

  if (routing.estimatedCost > config.budget.perTaskMax) {
    return { success: false, error: `Cost $${routing.estimatedCost} exceeds max $${config.budget.perTaskMax}` };
  }

  const systemPrompt = await composeSystemPrompt({
    base: BASE_PROMPT,
    agentsMd: await loadAgentsMd(session.metadata.projectPath),
    taskContext: routing.reason,
    compressionMeta: { enabled: config.compression.enabled }
  });

  const model = selectModel(routing, config);
  const messages = await compressMessages(session.messages, config.compression);

  for (let i = 0; i < 50; i++) {
    const response = await aiProvider.send({
      model: model.id,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      tools: getAvailableTools(),
      temperature: 0.7,
      stream: true
    });

    const assistantMsg = parseResponse(response, model);
    session.messages.push(assistantMsg);
    costTracker.addUsage(session, assistantMsg.tokens, model);

    if (costTracker.isBudgetExceeded(session)) {
      return { success: false, error: 'Budget exceeded', session };
    }

    if (!assistantMsg.toolCalls?.length) break;

    for (const tc of assistantMsg.toolCalls) {
      const approval = await approvalChecker.check(tc, session, config);
      if (approval.status === 'rejected') {
        session.messages.push(createToolError(tc.id, 'Rejected'));
        continue;
      }
      if (approval.status === 'pending') {
        return { success: false, status: 'pending_approval', approvalRequest: approval.request, session };
      }

      const result = await executeTool(tc, session);
      const compressed = await compressToolOutput(result, config.compression);
      session.messages.push(createToolMessage(tc.id, compressed));
    }
  }

  await sessionManager.save(session);
  if (config.git.autoBranch) await gitCommitSession(session, config);

  return { success: true, finalMessage: session.messages.at(-1), session, cost: session.cost };
}
```

### 3.2 Micro-Model Router with Rule-Based Fallback

```typescript
class MicroModelRouter {
  private engine: LlamaEngine | null = null;
  private session: LlamaChatSession | null = null;
  private fallback: RuleBasedRouter;

  constructor() {
    this.fallback = new RuleBasedRouter();
  }

  async initialize(config: MicroModelConfig): Promise<void> {
    try {
      await fs.mkdir(MODEL_DIR, { recursive: true });
      const modelPath = path.join(MODEL_DIR, config.model || DEFAULT_MODEL);
      if (!await fileExists(modelPath)) {
        await this.downloadModel(config.downloadUrl || getDefaultUrl(config.model), modelPath);
      }

      this.llama = await getLlama({ gpu: config.gpuLayers > 0 ? 'auto' : false, threads: config.threads || Math.max(1, os.cpus().length - 1) });
      const model = await this.llama.loadModel({ modelPath, contextSize: config.contextSize || 4096, gpuLayers: config.gpuLayers || 99 });
      this.session = new LlamaChatSession({
        contextSequence: (await model.createContext()).getSequence(),
        systemPrompt: `You are Nexus Router. Output ONLY valid JSON matching this schema: {intent: string, complexity: number, model: string, compression: string, approval: string, reason: string, estimatedTokens: number, estimatedCost: number, suggestedTools: string[], suggestedModels: string[], fallbackStrategy: string, confidence: number}`
      });
    } catch (e) {
      logger.warn('Micro-model initialization failed, using rule-based fallback only', e);
      this.engine = null;
    }
  }

  async route(userRequest: string, session: Session): Promise<RoutingDecision> {
    if (this.session) {
      try {
        const prompt = `Task: ${userRequest}
Context: ${session.messages.length} messages
Budget: $${session.cost.budgetRemaining}
Output JSON:`;
        const response = await this.session.prompt(prompt, { temperature: 0.1, maxTokens: 256 });
        const decision = JSON.parse(response);
        const validated = validateRoutingDecision(decision);
        if (validated.valid && decision.confidence >= 0.5) {
          return decision;
        }
        logger.warn('Micro-model returned low-confidence or invalid decision, using fallback');
      } catch (e) {
        logger.warn('Micro-model routing failed, using fallback', e);
      }
    }
    return this.fallback.route(userRequest, session);
  }
}

class RuleBasedRouter {
  private intentPatterns: Map<string, RegExp[]> = new Map([
    ['read', [/read|show|display|cat|view|open/i]],
    ['write', [/create|write|new file|generate/i]],
    ['edit', [/edit|modify|change|update|fix/i]],
    ['bash', [/run|execute|test|build|install|npm|git/i]],
    ['search', [/find|search|grep|locate/i]],
    ['explain', [/explain|describe|what is|how does/i]],
    ['debug', [/debug|fix error|trace|investigate/i]],
    ['refactor', [/refactor|restructure|rename|extract/i]],
    ['test', [/test|spec|jest|vitest|pytest/i]],
    ['deploy', [/deploy|publish|release|push/i]]
  ]);

  route(userRequest: string, session: Session): RoutingDecision {
    const intent = this.detectIntent(userRequest);
    const complexity = this.estimateComplexity(userRequest, session);
    const model = this.selectModelTier(complexity, session);
    const compression = this.selectCompression(userRequest);
    const approval = this.selectApproval(intent, userRequest);

    return {
      intent,
      complexity,
      model,
      compression,
      approval,
      reason: `Rule-based: intent=${intent}, complexity=${complexity.toFixed(2)}`,
      estimatedTokens: this.estimateTokens(userRequest),
      estimatedCost: 0,
      suggestedTools: this.suggestTools(intent),
      suggestedModels: this.suggestModels(model),
      fallbackStrategy: 'direct',
      confidence: 0.6
    };
  }

  private detectIntent(request: string): string {
    for (const [intent, patterns] of this.intentPatterns) {
      if (patterns.some(p => p.test(request))) return intent;
    }
    return 'unknown';
  }

  private estimateComplexity(request: string, session: Session): number {
    let score = 0.3;
    if (request.length > 200) score += 0.1;
    if (/refactor|architecture|multi-file|across|entire/i.test(request)) score += 0.3;
    if (session.messages.length > 10) score += 0.1;
    return Math.min(score, 1.0);
  }

  private selectModelTier(complexity: number, session: Session): string {
    if (session.cost.budgetRemaining < 0.5) return 'free';
    if (complexity > 0.7) return 'standard';
    if (complexity > 0.4) return 'cheap';
    return 'free';
  }

  private selectCompression(request: string): string {
    if (/json|api|response|data/i.test(request)) return 'smart-crusher';
    if (/code|function|class|import/i.test(request)) return 'code-compressor';
    return 'prose-compressor';
  }

  private selectApproval(intent: string, request: string): string {
    if (['write', 'bash'].includes(intent)) {
      if (/rm|delete|reset|push|deploy/i.test(request)) return 'ask';
      return 'notify';
    }
    return 'auto';
  }

  private estimateTokens(request: string): number {
    return Math.ceil(request.length / 4) + 500;
  }

  private suggestTools(intent: string): string[] {
    const toolMap: Record<string, string[]> = {
      read: ['read'], write: ['write'], edit: ['read', 'edit'],
      bash: ['bash', 'read'], search: ['bash'], explain: ['read'],
      debug: ['read', 'bash'], refactor: ['read', 'edit', 'write'],
      test: ['bash'], deploy: ['bash']
    };
    return toolMap[intent] || ['read'];
  }

  private suggestModels(tier: string): string[] {
    const modelMap: Record<string, string[]> = {
      free: ['qwen/qwen3-235b-a22b:free', 'deepseek/deepseek-chat-v3:free'],
      cheap: ['google/gemini-1.5-flash', 'anthropic/claude-haiku-4.1'],
      standard: ['anthropic/claude-sonnet-4.6', 'openai/gpt-4o'],
      premium: ['anthropic/claude-opus-4.7', 'openai/gpt-4o']
    };
    return modelMap[tier] || modelMap.free;
  }
}
```

### 3.3 Compression Pipeline

```typescript
class ContentRouter {
  private compressors = [new SmartCrusher(), new CodeCompressor(), new ProseCompressor()];

  async compress(content: string, contentType: string, options: CompressOptions): Promise<CompressionResult> {
    for (const c of this.compressors) {
      if (c.canHandle(contentType, content)) {
        const result = c.compress(content, options);
        const ratio = result.originalTokens / result.compressedTokens;
        if (ratio > options.maxCompressionRatio) {
          return c.compress(content, { ...options, aggressiveness: 'minimal' });
        }
        return result;
      }
    }
    return { originalTokens: countTokens(content), compressedTokens: countTokens(content), savingsPercent: 0, strategy: 'none', reversible: true };
  }
}

class SmartCrusher {
  canHandle(type: string, content: string) { return type === 'application/json' || content.trim().startsWith('{') || content.trim().startsWith('['); }
  compress(content: string, options: CompressOptions) {
    const parsed = JSON.parse(content);
    const compressed = this.compressValue(parsed, options.aggressiveness);
    const str = JSON.stringify(compressed);
    return { originalTokens: countTokens(content), compressedTokens: countTokens(str), savingsPercent: ((countTokens(content)-countTokens(str))/countTokens(content))*100, strategy: 'smart-crusher', reversible: true };
  }
  private compressValue(v: unknown, agg: string): unknown {
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') return this.compressArrayOfObjects(v, agg);
    if (typeof v === 'object' && v !== null) { const r: Record<string, unknown> = {}; for (const [k, val] of Object.entries(v)) { if (agg === 'aggressive' && (val === null || val === undefined)) continue; r[k] = this.compressValue(val, agg); } return r; }
    if (typeof v === 'string' && agg === 'aggressive' && v.length > 1000) return v.slice(0, 1000) + '...[truncated]';
    return v;
  }
  private compressArrayOfObjects(arr: unknown[], agg: string): unknown {
    const keys = Object.keys(arr[0] as object);
    return [keys, ...arr.map(obj => keys.map(k => (obj as Record<string, unknown>)[k]))];
  }
}

class CodeCompressor {
  private langs = ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'cpp'];
  canHandle(type: string, content: string) { return this.langs.includes(this.detectLang(type, content)); }
  compress(content: string, options: CompressOptions) {
    let c = this.removeComments(content, this.detectLang('text/plain', content));
    c = c.replace(/
\s*
/g, '
').replace(/[ 	]+/g, ' ').trim();
    // NEVER shorten variable names — destroys LLM comprehension
    return { originalTokens: countTokens(content), compressedTokens: countTokens(c), savingsPercent: ((countTokens(content)-countTokens(c))/countTokens(content))*100, strategy: 'code-compressor', reversible: false };
  }
  private detectLang(type: string, content: string) { return 'typescript'; }
  private removeComments(code: string, lang: string) { return code; }
}

class ProseCompressor {
  canHandle(type: string, content: string) { return !content.trim().startsWith('{') && !content.trim().startsWith('[') && !/^(import|const|function|class|def|package)/m.test(content); }
  compress(content: string, options: CompressOptions) {
    let c = content.replace(/
{3,}/g, '

').trim();
    if (options.aggressiveness === 'aggressive') {
      c = c.replace(/(the|a|an|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|shall|can|need|dare|ought|used|to|of|in|for|on|with|at|by|from|as|into|through|during|before|after|above|below|between|under|again|further|then|once|here|there|when|where|why|how|all|each|few|more|most|other|some|such|no|nor|not|only|own|same|so|than|too|very|just|now)/gi, '');
      c = c.replace(/\s{2,}/g, ' ').trim();
    }
    return { originalTokens: countTokens(content), compressedTokens: countTokens(c), savingsPercent: ((countTokens(content)-countTokens(c))/countTokens(content))*100, strategy: 'prose-compressor', reversible: false };
  }
}
```

### 3.4 Git-Native Sessions

```typescript
class GitManager {
  constructor(private projectPath: string) {}

  async createSessionBranch(name: string): Promise<string> {
    const branch = `nexus/${slugify(name)}-${formatDate(new Date())}`;
    if (!await this.isRepo()) await this.init();
    if (await this.hasUncommittedChanges()) await this.stash('nexus-auto-stash');
    await this.exec(`git checkout -b ${branch}`);
    await fs.mkdir(path.join(this.projectPath, '.nexus', 'sessions'), { recursive: true });
    return branch;
  }

  async commitSession(session: Session, config: GitConfig): Promise<void> {
    await this.exec('git add -A');
    if (!await this.hasStagedChanges()) return;
    const msg = config.commitMessageTemplate
      .replace('{sessionName}', session.name)
      .replace('{date}', formatDate(session.createdAt))
      .replace('{messageCount}', String(session.messages.length));
    await this.exec(`git commit -m "${msg}"`);
  }

  async merge(branch: string, strategy: 'merge' | 'squash' | 'rebase'): Promise<MergeResult> {
    const target = await this.getDefaultBranch();
    await this.exec(`git checkout ${target}`);
    try { await this.exec(`git merge --${strategy} ${branch}`); return { success: true, conflicts: [] }; }
    catch { return { success: false, conflicts: await this.getMergeConflicts() }; }
  }

  private async exec(cmd: string) { return execAsync(cmd, { cwd: this.projectPath }); }
}
```

### 3.5 Approval System with Persistent Learning

```typescript
interface ApprovalRule {
  id: string;
  tool: string;
  pattern: string;
  action: 'auto' | 'ask' | 'notify';
  learned: boolean;
  confidence: number;
  createdAt: Date;
  lastUsed: Date;
  useCount: number;
}

class ApprovalChecker {
  private learnedRules: Map<string, ApprovalRule> = new Map();
  private rulesFile: string;

  constructor() {
    this.rulesFile = path.join(os.homedir(), '.nexus', 'approval-rules.json');
    this.loadRules();
  }

  private async loadRules(): Promise<void> {
    try {
      const data = await fs.readFile(this.rulesFile, 'utf-8');
      const rules = JSON.parse(data);
      for (const rule of rules) {
        this.learnedRules.set(rule.pattern, rule);
      }
    } catch {
      // No rules file yet, start fresh
    }
  }

  private async saveRules(): Promise<void> {
    const rules = Array.from(this.learnedRules.values());
    await fs.mkdir(path.dirname(this.rulesFile), { recursive: true });
    await fs.writeFile(this.rulesFile, JSON.stringify(rules, null, 2));
  }

  async check(toolCall: ToolCall, session: Session, config: ApprovalConfig): Promise<ApprovalResult> {
    for (const pattern of config.alwaysAsk) {
      if (matchesPattern(toolCall, pattern)) {
        return { status: 'pending', request: createRequest(toolCall, 'Safety override') };
      }
    }

    const toolPattern = `${toolCall.tool}:*`;
    for (const [key, rule] of this.learnedRules) {
      if (minimatch(toolPattern, key) || minimatch(`${toolCall.tool}:${JSON.stringify(toolCall.arguments)}`, key)) {
        const monthsSinceUse = (Date.now() - rule.lastUsed.getTime()) / (30 * 24 * 60 * 60 * 1000);
        const decayedConfidence = rule.confidence * Math.pow(0.9, monthsSinceUse);

        if (decayedConfidence > config.maxAutoApproveConfidence) {
          rule.lastUsed = new Date();
          rule.useCount++;
          await this.saveRules();
          return { status: 'approved', rule };
        }
      }
    }

    for (const pattern of config.autoApprove) {
      if (matchesPattern(toolCall, pattern)) {
        return { status: 'approved' };
      }
    }

    if (config.defaultLevel === 'auto') return { status: 'approved' };
    if (config.defaultLevel === 'ask') return { status: 'pending', request: createRequest(toolCall, 'Default: ask') };
    return { status: 'approved', notify: true };
  }

  async learn(toolCall: ToolCall, approved: boolean): Promise<void> {
    const pattern = `${toolCall.tool}:${simplifyArgs(toolCall.arguments)}`;
    const existing = this.learnedRules.get(pattern);

    if (existing) {
      existing.confidence = existing.confidence * 0.7 + (approved ? 1 : 0) * 0.3;
      existing.lastUsed = new Date();
      existing.useCount++;
    } else {
      this.learnedRules.set(pattern, {
        id: generateId(),
        tool: toolCall.tool,
        pattern,
        action: approved ? 'auto' : 'ask',
        learned: true,
        confidence: 0.5,
        createdAt: new Date(),
        lastUsed: new Date(),
        useCount: 1
      });
    }

    await this.saveRules();
  }
}
```

### 3.6 Plugin Sandbox (isolated-vm)

```typescript
import ivm from 'isolated-vm';

class PluginSandbox {
  private isolate: ivm.Isolate;
  private memoryLimit: number;

  constructor(memoryLimitMB: number = 128) {
    this.memoryLimit = memoryLimitMB;
    this.isolate = new ivm.Isolate({ memoryLimit: memoryLimitMB });
  }

  async execute(code: string, context: PluginContext, permissions: string[]): Promise<unknown> {
    const script = await this.isolate.compileScript(code, { timeout: 5000 });
    const jail = this.isolate.createContextSync();

    const allowedGlobals = {
      console: {
        log: new ivm.Reference((...args: unknown[]) => logger.info('[plugin]', ...args)),
        warn: new ivm.Reference((...args: unknown[]) => logger.warn('[plugin]', ...args)),
        error: new ivm.Reference((...args: unknown[]) => logger.error('[plugin]', ...args))
      },
      Buffer: new ivm.Reference(Buffer),
      TextEncoder: new ivm.Reference(TextEncoder),
      TextDecoder: new ivm.Reference(TextDecoder),
      URL: new ivm.Reference(URL),
      URLSearchParams: new ivm.Reference(URLSearchParams)
    };

    for (const [key, value] of Object.entries(allowedGlobals)) {
      jail.global.setSync(key, value);
    }

    if (permissions.includes('fs:read')) {
      jail.global.setSync('nexusFsRead', new ivm.Reference(this.wrapFsRead(context)));
    }
    if (permissions.includes('process:spawn')) {
      jail.global.setSync('nexusBash', new ivm.Reference(this.wrapBash(context)));
    }
    if (permissions.includes('network:fetch')) {
      jail.global.setSync('fetch', new ivm.Reference(this.wrapFetch(context)));
    }

    jail.global.setSync('nexus', new ivm.Reference({
      ui: context.ui,
      tools: this.filterTools(context.tools, permissions),
      storage: context.storage,
      logger: context.logger,
      events: context.events
    }));

    return script.runSync(jail, { timeout: 5000 });
  }

  private wrapFsRead(ctx: PluginContext) {
    return async (p: string) => {
      if (!isWithinProject(p)) throw new Error('Outside project');
      return ctx.tools.read(p);
    };
  }

  private wrapBash(ctx: PluginContext) {
    return async (cmd: string, opts?: unknown) => {
      if (isDangerousCommand(cmd)) throw new Error('Blocked');
      return ctx.tools.bash(cmd, opts as BashArgs);
    };
  }

  private wrapFetch(ctx: PluginContext) {
    return async (url: string, opts?: RequestInit) => {
      if (isPrivateIP(new URL(url).hostname)) throw new Error('Private IP blocked');
      return fetch(url, { ...opts, signal: AbortSignal.timeout(30000) });
    };
  }

  private filterTools(tools: ToolAPI, perms: string[]): ToolAPI {
    const f = { ...tools };
    if (!perms.includes('fs:read')) delete (f as Record<string, unknown>).read;
    if (!perms.includes('fs:write')) { delete (f as Record<string, unknown>).write; delete (f as Record<string, unknown>).edit; }
    if (!perms.includes('process:spawn')) delete (f as Record<string, unknown>).bash;
    return f;
  }
}
```

---

## 4. EMBEDDED LLAMA.CPP

### 4.1 node-llama-cpp Integration

```typescript
import { getLlama, LlamaChatSession } from 'node-llama-cpp';

const MODEL_DIR = path.join(os.homedir(), '.nexus', 'models');
const DEFAULT_MODEL = 'qwen3.5-0.5b-instruct-q4_k_m.gguf';

export class MicroModelEngine {
  private llama: Awaited<ReturnType<typeof getLlama>> | null = null;
  private session: LlamaChatSession | null = null;

  async initialize(config: MicroModelConfig): Promise<void> {
    await fs.mkdir(MODEL_DIR, { recursive: true });
    const modelPath = path.join(MODEL_DIR, config.model || DEFAULT_MODEL);
    if (!await fileExists(modelPath)) await this.downloadModel(config.downloadUrl || getDefaultUrl(config.model), modelPath);

    this.llama = await getLlama({ gpu: config.gpuLayers > 0 ? 'auto' : false, threads: config.threads || Math.max(1, os.cpus().length - 1) });
    const model = await this.llama.loadModel({ modelPath, contextSize: config.contextSize || 4096, gpuLayers: config.gpuLayers || 99 });
    this.session = new LlamaChatSession({ contextSequence: (await model.createContext()).getSequence(), systemPrompt: ROUTER_SYSTEM_PROMPT });
  }

  async prompt(text: string, options: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
    if (!this.session) throw new Error('Not initialized');
    return this.session.prompt(text, { temperature: options.temperature ?? 0.1, maxTokens: options.maxTokens ?? 256 });
  }

  private async downloadModel(url: string, dest: string): Promise<void> {
    const res = await fetch(url);
    const total = parseInt(res.headers.get('content-length') || '0');
    const file = await fs.open(dest, 'w');
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No body');
    let downloaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await file.write(value);
      downloaded += value.length;
      if (downloaded % (10 * 1024 * 1024) < value.length) {
        const progress = total > 0 ? (downloaded / total) * 100 : 0;
        process.stdout.write(`Downloading model: ${progress.toFixed(1)}%`);
      }
    }
    await file.close();
    console.log();
  }
}
```

### 4.2 Model Specifications

| Model | Parameters | Quantization | Disk Size | RAM | Speed (CPU) | Speed (GPU) |
|-------|-----------|-------------|-----------|-----|-------------|-------------|
| **Qwen3.5-0.5B-Instruct** | 0.5B | Q4_K_M | ~300MB | ~400MB | 30-50 t/s | 100+ t/s |
| **Qwen3.5-0.5B-Instruct** | 0.5B | Q8_0 | ~500MB | ~600MB | 20-30 t/s | 80+ t/s |
| **Phi-4-mini** | 3.8B | Q4_K_M | ~2.2GB | ~2.5GB | 10-15 t/s | 50+ t/s |

**Default:** Qwen3.5-0.5B Q4_K_M. Research confirms 0.5B matches 1.5B for routing tasks. Fallback to Phi-4-mini for users who want stronger local inference.

---

## 5. COMPRESSION SYSTEM

### 5.1 Architecture

```
Content -> ContentRouter -> Strategy Selection -> Compress -> LLM
                                              |
                                         CacheAligner -> KV Cache Hit
```

### 5.2 Strategies

| Strategy | Content Type | Savings | Reversible |
|----------|-------------|---------|------------|
| SmartCrusher | JSON | 40-70% | Yes |
| CodeCompressor | Code (TS, JS, Py, Go, Rust, Java, C++) | 30-50% | No |
| ProseCompressor | Prose, docs | 20-40% | No |

**Note:** Compression ratios are targets pending real-world benchmarks. Do not cite these as guaranteed.

### 5.3 CacheAligner

```typescript
class CacheAligner {
  private cache = new Map<string, string>();

  align(systemPrompt: string, messages: Message[], provider: string): { prompt: string; hits: number; savings: number } {
    const prefix = systemPrompt + '
' + messages.slice(0, 3).map(m => format(m)).join('
');
    const key = hash(prefix);
    if (this.cache.has(key)) return { prompt: this.cache.get(key)!, hits: 1, savings: countTokens(prefix) * 0.9 };
    this.cache.set(key, prefix);
    return { prompt: prefix, hits: 0, savings: 0 };
  }
}
```

---

## 6. PLUGIN SYSTEM

### 6.1 Zero-Overhead Loading

```typescript
class PluginLoader {
  private registry = new Map<string, Plugin>();
  private tools = new Map<string, Tool>();

  async load(manifest: PluginManifest): Promise<void> {
    await this.validatePermissions(manifest);
    const plugin = await import(manifest.main);
    for (const tool of manifest.tools || []) {
      this.tools.set(tool.name, { ...tool, execute: this.sandbox.wrap(plugin[tool.name], manifest.permissions) });
    }
    this.registry.set(manifest.name, plugin);
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }
}
```

### 6.2 Official Plugins

| Plugin | Purpose | Size | Lazy |
|--------|---------|------|------|
| nexus-plugin-git | Git operations, auto-commit | ~10KB | Yes |
| nexus-plugin-mcp | MCP server integration | ~15KB | Yes |
| nexus-plugin-github | PRs, issues, code review | ~20KB | Yes |
| nexus-plugin-docker | Container management | ~15KB | Yes |
| nexus-plugin-test | Test runner integration | ~12KB | Yes |

---

## 7. ERROR HANDLING

### 7.1 Error Codes

```typescript
enum ErrorCode {
  PROVIDER_TIMEOUT = 'PROVIDER_TIMEOUT',
  PROVIDER_RATE_LIMIT = 'PROVIDER_RATE_LIMIT',
  PROVIDER_AUTH_ERROR = 'PROVIDER_AUTH_ERROR',
  MODEL_CONTEXT_OVERFLOW = 'MODEL_CONTEXT_OVERFLOW',
  BUDGET_EXCEEDED = 'BUDGET_EXCEEDED',
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  TOOL_SAFETY_BLOCKED = 'TOOL_SAFETY_BLOCKED',
  MICRO_MODEL_NOT_INITIALIZED = 'MICRO_MODEL_NOT_INITIALIZED',
  PLUGIN_LOAD_FAILED = 'PLUGIN_LOAD_FAILED',
  PLUGIN_SANDBOX_VIOLATION = 'PLUGIN_SANDBOX_VIOLATION',
  GIT_MERGE_CONFLICT = 'GIT_MERGE_CONFLICT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  OUT_OF_MEMORY = 'OUT_OF_MEMORY'
}
```

### 7.2 Recovery Matrix

| Error | Strategy | Fallback | User Action |
|-------|----------|----------|-------------|
| PROVIDER_TIMEOUT | Retry x3, exponential backoff | Switch provider | None |
| PROVIDER_RATE_LIMIT | Wait for reset | Alternative provider | None |
| PROVIDER_AUTH_ERROR | Prompt new key | Disable provider, use free | Provide key |
| MODEL_CONTEXT_OVERFLOW | Compress more | Summarize history | None |
| BUDGET_EXCEEDED | Route to free models | Pause session | Approve continue |
| MICRO_MODEL_NOT_INITIALIZED | Auto-download | Skip routing, use rule-based fallback | None |
| TOOL_SAFETY_BLOCKED | Return error to model | Ask user override | If override |
| GIT_MERGE_CONFLICT | Show diff | Abort merge | Resolve conflicts |
| PLUGIN_SANDBOX_VIOLATION | Block plugin | Disable plugin | Review plugin |

### 7.3 Circuit Breaker

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailure?: number;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(private threshold = 5, private timeout = 60000) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - (this.lastFailure || 0) > this.timeout) this.state = 'half-open';
      else throw new NexusError(ErrorCode.PROVIDER_TIMEOUT, 'Circuit open');
    }
    try { const r = await fn(); this.onSuccess(); return r; }
    catch (e) { this.onFailure(); throw e; }
  }

  private onSuccess() { this.failures = 0; this.state = 'closed'; }
  private onFailure() { this.failures++; this.lastFailure = Date.now(); if (this.failures >= this.threshold) this.state = 'open'; }
}
```

---

## 8. CONFIGURATION

### 8.1 Default Config

```json
{
  "version": "1.0.0",
  "providers": {
    "openrouter": {
      "apiKey": null,
      "baseUrl": "https://openrouter.ai/api/v1",
      "preferredModels": ["qwen/qwen3-235b-a22b:free", "deepseek/deepseek-chat-v3:free", "meta-llama/llama-4-maverick:free"],
      "enabled": true,
      "timeout": 30000,
      "retries": 3
    },
    "anthropic": { "apiKey": null, "baseUrl": "https://api.anthropic.com", "preferredModels": ["claude-sonnet-4.6", "claude-haiku-4.1"], "enabled": false, "timeout": 60000, "retries": 3 },
    "openai": { "apiKey": null, "baseUrl": "https://api.openai.com/v1", "preferredModels": ["gpt-4o", "gpt-4o-mini"], "enabled": false, "timeout": 60000, "retries": 3 },
    "google": { "apiKey": null, "baseUrl": "https://generativelanguage.googleapis.com/v1beta", "preferredModels": ["gemini-1.5-pro", "gemini-1.5-flash"], "enabled": false, "timeout": 60000, "retries": 3 }
  },
  "microModel": {
    "provider": "local",
    "model": "qwen3.5-0.5b-instruct-q4_k_m",
    "quantization": "q4_k_m",
    "contextSize": 4096,
    "gpuLayers": 99,
    "threads": 4,
    "downloadUrl": "https://huggingface.co/Qwen/Qwen3.5-0.5B-Instruct-GGUF/resolve/main/qwen3.5-0.5b-instruct-q4_k_m.gguf"
  },
  "budget": { "dailyMax": 5.00, "warnAt": 0.70, "routeToFreeAt": 0.90, "perTaskMax": 2.00 },
  "approval": {
    "defaultLevel": "ask",
    "autoApprove": ["read", "edit:*.md", "edit:*.txt", "bash:git status", "bash:git log", "bash:ls", "bash:cat"],
    "alwaysAsk": ["bash:rm", "bash:git push", "bash:git reset", "write:.env*", "write:*.key", "write:*.pem"],
    "learnFromUser": true,
    "maxAutoApproveConfidence": 0.85
  },
  "compression": {
    "enabled": true,
    "aggressiveness": "balanced",
    "preserveSignatures": true,
    "maxCompressionRatio": 5.0,
    "strategies": { "smartCrusher": true, "codeCompressor": true, "proseCompressor": true }
  },
  "git": {
    "enabled": true,
    "autoBranch": true,
    "commitMessageTemplate": "nexus: {sessionName} ({date}, {messageCount} messages)",
    "squashOnComplete": false,
    "ignorePatterns": ["node_modules/", ".nexus/sessions/", "*.log"]
  },
  "plugins": {
    "directory": "~/.nexus/plugins",
    "autoLoad": ["nexus-plugin-git"],
    "sandbox": { "enabled": true, "memoryLimit": 128, "timeout": 5000, "networkAllowlist": ["api.github.com", "api.openai.com", "api.anthropic.com"] }
  },
  "ui": {
    "theme": "system",
    "fontSize": 14,
    "showCost": true,
    "showCompression": true,
    "showReasoning": false,
    "keyboardShortcuts": { "newSession": "Ctrl+Shift+N", "toggleCostPanel": "Ctrl+Shift+C", "toggleCompressionPanel": "Ctrl+Shift+M", "approve": "Ctrl+A", "reject": "Ctrl+R", "quit": "Ctrl+Q" }
  },
  "logging": { "level": "info", "file": "~/.nexus/logs/nexus.log", "maxSize": 100, "maxFiles": 10, "format": "json" }
}
```

### 8.2 Environment Variables

| Variable | Maps To |
|----------|---------|
| NEXUS_OPENROUTER_API_KEY | providers.openrouter.apiKey |
| NEXUS_ANTHROPIC_API_KEY | providers.anthropic.apiKey |
| NEXUS_OPENAI_API_KEY | providers.openai.apiKey |
| NEXUS_GOOGLE_API_KEY | providers.google.apiKey |
| NEXUS_DAILY_BUDGET | budget.dailyMax |
| NEXUS_PER_TASK_BUDGET | budget.perTaskMax |
| NEXUS_LOG_LEVEL | logging.level |
| NEXUS_THEME | ui.theme |
| NEXUS_PLUGINS_DIR | plugins.directory |
| NEXUS_DISABLE_TELEMETRY | N/A (no telemetry) |

---

## 9. DEVELOPMENT PHASES

### Phase 1: Foundation
- [ ] Scaffold monorepo (TypeScript, pnpm, turbo)
- [ ] Implement nexus-ai (OpenRouter + 4 direct providers)
- [ ] Implement nexus-core (agent loop, 4 tools, session manager)
- [ ] Implement nexus-micro (node-llama-cpp, 0.5B router + rule-based fallback)
- [ ] Implement nexus-tui (Ink-based terminal UI)
- [ ] Implement nexus-cli (commands: init, chat, config, doctor)
- [ ] Git-native sessions (branch-per-session)
- [ ] **Deliverable:** Working CLI with embedded micro-model

### Phase 2: Compression + Plugins
- [ ] Implement SmartCrusher (JSON compression)
- [ ] Implement CodeCompressor (AST-aware, NO variable shortening)
- [ ] Implement ProseCompressor
- [ ] Implement CacheAligner
- [ ] Design plugin SDK
- [ ] Implement plugin loader + isolated-vm sandbox
- [ ] Build 5 official plugins
- [ ] **Deliverable:** CLI with compression + plugin system

### Phase 3: Desktop + IDE (v1.1)
- [ ] Scaffold Tauri v2 desktop app
- [ ] Implement IPC bridge (Rust <-> TypeScript via sidecar)
- [ ] Build desktop UI (session tree, diff viewer, cost tracker)
- [ ] System tray, global shortcuts, notifications
- [ ] VS Code extension
- [ ] JetBrains plugin (if time permits)
- [ ] **Deliverable:** Desktop app + IDE extensions

### Phase 4: Polish + Release
- [ ] Benchmark suite (vs. Claude Code, Codex, Cursor)
- [ ] Comprehensive documentation
- [ ] Video tutorials
- [ ] Community onboarding (Discord, GitHub)
- [ ] v1.0 release
- [ ] **Deliverable:** Production-ready v1.0

### v1.1+ Roadmap (Post-Release)
- Parallel subagents with Git worktrees
- MCP server integration
- ACP (Agent Communication Protocol)
- Mobile app (Tauri iOS/Android)
- Self-upgrading harness
- Extension marketplace
- Custom micro-model fine-tuning

---

## 10. PERFORMANCE BUDGETS

| Component | Memory | CPU | Latency | Concurrent |
|-----------|--------|-----|---------|------------|
| Micro-Model | 500MB | 1 core | 50ms | 1 |
| Agent Loop | 100MB | 0.5 core | 2s/iter | 5 |
| Compression | 50MB | 0.5 core | 10ms | 10 |
| Git Ops | 20MB | 0.2 core | 100ms | 1/repo |
| Plugin Sandbox | 128MB | 0.5 core | 5s | 3 |
| TUI Render | 30MB | 0.1 core | 16ms | 1 |

| Metric | Target | Max |
|--------|--------|-----|
| CLI cold start | <500ms | <1s |
| Micro-model load | <2s | <5s |
| Tool call (local) | <100ms | <2s (cloud) |
| Session creation | <100ms | <500ms |
| Git branch creation | <100ms | <500ms |
| Plugin load | <50ms | <200ms |
| Compression | <10ms | <50ms |
| Cost estimation | <5ms | <20ms |
| Idle memory | <100MB | <200MB |
| Active memory | <1GB | <2GB |

---

## 11. OBSERVABILITY

### 11.1 Log Format (Structured JSON)

```json
{"timestamp":"2026-06-21T10:30:00Z","level":"info","component":"nexus-core","message":"Session created","sessionId":"uuid","metadata":{"projectPath":"/home/user/project","model":"claude-sonnet-4.6"}}
{"timestamp":"2026-06-21T10:30:01Z","level":"debug","component":"nexus-micro","message":"Routing decision","sessionId":"uuid","metadata":{"intent":"read","model":"free","confidence":0.92}}
{"timestamp":"2026-06-21T10:30:02Z","level":"info","component":"nexus-ai","message":"LLM request completed","sessionId":"uuid","model":"qwen3-235b","duration":850,"metadata":{"tokens":{"input":500,"output":150}}}
```

### 11.2 Metrics

- sessions_created_total (counter)
- model_requests_total{model} (counter)
- model_latency_seconds{model} (histogram)
- daily_spend_usd (gauge)
- compression_savings_tokens (counter)
- tool_executions_total{tool} (counter)

### 11.3 Debug Mode

```bash
nexus --debug  # Verbose logging, raw prompts, tool args, compression stats, routing decisions, cost breakdown, timing per operation
```

---

## 12. SECURITY

### 12.1 API Key Storage

```typescript
class SecretManager {
  private key: Buffer;
  constructor(password: string) { this.key = scryptSync(password, 'nexus-salt', 32); }

  encrypt(plaintext: string): { ciphertext: string; iv: string; tag: string } {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    return { ciphertext: cipher.update(plaintext, 'utf8', 'hex') + cipher.final('hex'), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex') };
  }

  decrypt(enc: { ciphertext: string; iv: string; tag: string }): string {
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(enc.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(enc.tag, 'hex'));
    return decipher.update(enc.ciphertext, 'hex', 'utf8') + decipher.final('utf8');
  }
}

async function storeApiKey(provider: string, key: string): Promise<void> {
  try { const keytar = await import('keytar'); await keytar.setPassword('nexus', provider, key); }
  catch { const sm = new SecretManager(await getMasterPassword()); const enc = sm.encrypt(key); await fs.writeFile(path.join(os.homedir(), '.nexus', 'keys', `${provider}.enc`), JSON.stringify(enc)); }
}
```

### 12.2 Plugin Sandbox Restrictions (isolated-vm)

- True V8 isolate — no prototype pollution escape
- No `require()` — only explicit APIs
- No `process`, `fs`, `child_process` unless permitted
- No private IP access
- No `file://` protocol
- 128MB heap limit
- 5s execution timeout
- Path validation (must be within project)
- Sensitive file blocking (.env, .ssh, .aws, id_rsa, *.key, *.pem)

### 12.3 Audit Logging

```typescript
interface AuditEvent {
  timestamp: Date;
  eventType: string;
  sessionId: string;
  tool?: string;
  model?: string;
  cost?: number;
  tokens?: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}
```

Log file: `~/.nexus/audit.log` (append-only, JSON lines)

---

## 13. DEPLOYMENT

### 13.1 Distribution

| Channel | Method |
|---------|--------|
| npm | `npm install -g @nexus/harness` |
| GitHub Releases | Pre-built binaries for all platforms |
| Homebrew | `brew install nexus` |
| Scoop | `scoop install nexus` |
| VS Code Marketplace | Search "Nexus" |
| JetBrains Marketplace | Search "Nexus" |
| Direct | nexus.dev/download |

### 13.2 Auto-Update

```typescript
async function upgrade(): Promise<void> {
  const current = getCurrentVersion();
  const latest = await fetchLatestVersion();
  if (current === latest) { console.log('Up to date'); return; }
  const url = getDownloadUrl(latest);
  const temp = path.join(os.tmpdir(), `nexus-${latest}`);
  await downloadFile(url, temp);
  const checksum = await calculateChecksum(temp);
  const expected = await fetchChecksum(latest);
  if (checksum !== expected) throw new Error('Checksum mismatch');
  await fs.rename(temp, process.argv[0]);
  await fs.chmod(process.argv[0], 0o755);
  console.log('Update complete. Restart Nexus.');
}
```

---

## 14. WALKTHROUGH.MD (Living Document)

Every developer must update `docs/walkthrough.md` after each implementation step. This document is the single source of truth for project state.

### Required Sections:

```markdown
# Nexus Walkthrough

## Current Phase: [Phase X - Name]
## Last Updated: [Date]

### Completed
- [x] Item 1 (completed by [name] on [date])
- [x] Item 2

### In Progress
- [ ] Item 3 (assigned to [name], ETA [date])

### Blocked
- [ ] Item 4 (blocked by [reason], needs [action])

### Decisions Made
- Decision 1: [rationale]
- Decision 2: [rationale]

### Technical Debt
- [ ] Issue 1: [description]

### Next Steps
1. Step 1
2. Step 2

### Architecture Notes
- [Any deviations from spec, with justification]

### API Changes
- [Any changes to public APIs]

### Performance Notes
- [Benchmarks, observations]
```

**Rule:** No commit without walkthrough update. The walkthrough is read before any new developer or AI agent starts work.

---

## 15. COMPETITIVE POSITIONING

| Feature | Claude Code | Codex | Cursor | OpenCode | **Nexus** |
|---------|-------------|-------|--------|----------|-----------|
| Cost | $17-200/mo | $20/mo | $20-200/mo | Free (BYOK) | **$0 default** |
| Local Model | No | No | No | Via Ollama | **Embedded (0.5B)** |
| External Dependencies | None | None | None | Ollama (optional) | **None** |
| Compression | None | None | None | None | **40-70% reduction** |
| Git-Native | No | No | No | No | **Branch-per-session** |
| Model Lock-in | Claude only | OpenAI only | Multi | 75+ providers | **300+ models, auto-route** |
| Plugin System | Skills | MCP | Extensions | Extensions | **Zero-overhead, sandboxed** |
| Desktop App | No | Cloud only | VS Code only | No | **Tauri, 10MB (v1.1)** |
| Transparency | Hidden prompts | Hidden | Hidden | Editable | **Full visibility** |
| Self-Modifying | No | No | No | Yes (Pi) | **Yes** |

**Nexus wins on: Cost (free), Dependencies (none), Compression (unique), Git integration (unique), Transparency (full), Size (10MB desktop).**

---

## 16. APPENDIX

### A. Glossary

| Term | Definition |
|------|-----------|
| Agent Loop | Core execution cycle: input -> route -> prompt -> model -> tools -> repeat |
| Micro-Model | 0.5B local LLM for routing and orchestration |
| Model Tier | free / cheap / standard / premium classification |
| Plugin | Extension module adding tools, commands, or UI |
| Session | Single conversation/workflow, stored as Git branch |

### B. Model Compatibility

| Model | Provider | Protocol | Tools | Vision | Stream | Cost/1M |
|-------|----------|----------|-------|--------|--------|---------|
| claude-sonnet-4.6 | Anthropic | anthropic | Yes | Yes | Yes | $3/$15 |
| gpt-4o | OpenAI | openai-completions | Yes | Yes | Yes | $5/$15 |
| gemini-1.5-pro | Google | google | Yes | Yes | Yes | $3.50/$10.50 |
| qwen3-235b:free | OpenRouter | openrouter | Yes | Yes | Yes | **$0** |
| deepseek-chat-v3:free | OpenRouter | openrouter | Yes | No | Yes | **$0** |
| qwen3.5-0.5b | Local | local | No | No | Yes | **$0** |

### C. File Size Reference

| Component | Size |
|-----------|------|
| nexus-cli binary | ~50MB |
| nexus-desktop app | ~6MB + 300MB model (v1.1) |
| Micro-model (0.5B Q4_K_M) | ~300MB |
| Full npm install | ~200MB |
| Runtime memory (idle) | ~100MB |
| Runtime memory (active) | ~500MB-1GB |
| Session storage | ~10KB/session |
| Audit log | ~1MB/day |

### D. Testing Strategy

**Framework:** Vitest (faster, ESM-native, TypeScript-first)

**Coverage Targets:**
- nexus-core: 80%
- nexus-ai: 70%
- nexus-compress: 70%
- nexus-micro: 75%
- nexus-tui: 50%

**Mock Strategy:**
- LLM responses: Deterministic fixtures with token counts
- Git operations: In-memory git repo fixtures
- File system: memfs for unit tests
- Micro-model: Mock router returning fixed decisions

**Integration Tests:**
- Full agent loop with mocked LLM
- Git branch creation and commit flow
- Compression round-trip accuracy
- Plugin sandbox execution

### E. Session Forking

Since sessions are Git-native, forking is trivial:

```bash
nexus fork --from session-123 --at message-15
```

This creates a new branch from the commit at message 15, allowing the user to try a different approach from that point.

### F. Cost Prediction

Before executing any tool call that would invoke a cloud LLM, display:

```
Estimated cost: $0.03 (1,200 input tokens, 400 output tokens)
Model: qwen/qwen3-235b-a22b:free
Actual cost may vary.
```

### G. Rate Limit Handling for Free Models

Free models on OpenRouter have aggressive rate limits. Implement:

1. **Request queuing** with backpressure
2. **Provider rotation** — try another free model while rate-limited on one
3. **User notification:** "Free model rate-limited, waiting 30s..." vs silently hanging
4. **Exponential backoff** with jitter

### H. AGENTS.md / CLAUDE.md Compatibility

Nexus reads `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, and `.nexus.md` from the project root. Format is compatible with existing conventions:

```markdown
# Agent Instructions

## Code Style
- Use TypeScript strict mode
- Prefer async/await over callbacks

## Architecture
- Follow clean architecture principles
- Domain logic in src/domain/
```

---

**Document Version:** 1.0.0
**Date:** 2026-06-22
**License:** Apache-2.0
**Walkthrough:** docs/walkthrough.md (living document)
