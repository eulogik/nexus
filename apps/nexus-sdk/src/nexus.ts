import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import {
  ConfigManager,
  SessionManager,
  AgentLoop,
  ApprovalChecker,
  GitManager,
  getAllTools,
} from 'nexus-core';
import {
  ProviderRegistry,
  CostTracker,
} from 'nexus-ai';
import type {
  Session,
  SessionMetadata,
  SessionCost,
  Message,
  UserMessage,
  AgentResult,
  ReadArgs,
  WriteArgs,
  EditArgs,
  BashArgs,
} from 'nexus-core';
import type {
  LLMRequest,
  LLMResponse,
  StreamChunk,
  NexusConfig,
  RoutingDecision,
} from 'nexus-ai';

export interface NexusOptions {
  configPath?: string;
  sessionsDir?: string;
  projectPath?: string;
  apiKey?: string;
  debug?: boolean;
}

export interface CostBreakdown {
  sessionTotal: number;
  dailyTotal: number;
  monthlyTotal: number;
  budgetRemaining: number;
  tokensUsed: number;
  savingsFromCompression: number;
  savingsFromFreeModels: number;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
}

class NexusSessionEvent extends EventEmitter {
  static Events = {
    SESSION_CREATED: 'session:created',
    SESSION_UPDATED: 'session:updated',
    SESSION_DELETED: 'session:deleted',
    MESSAGE_ADDED: 'message:added',
    TOOL_CALLED: 'tool:called',
    TOOL_RESULT: 'tool:result',
    COST_UPDATED: 'cost:updated',
    ERROR: 'error',
  } as const;
}

export class Nexus {
  private configManager: ConfigManager;
  private sessionManager: SessionManager;
  private agentLoop: AgentLoop;
  private providerRegistry: ProviderRegistry;
  private approvalChecker: ApprovalChecker;
  private gitManager: GitManager;
  private costTracker: CostTracker;
  private debug: boolean;
  private projectPath: string;
  private sessionsDir: string;
  eventBus: NexusSessionEvent;

  constructor(options?: NexusOptions) {
    this.debug = options?.debug ?? false;
    this.projectPath = options?.projectPath ?? process.cwd();
    this.sessionsDir = options?.sessionsDir ?? '.nexus/sessions';
    this.eventBus = new NexusSessionEvent();

    this.configManager = new ConfigManager(options?.configPath);
    this.sessionManager = new SessionManager(this.sessionsDir);

    const nexusConfig: NexusConfig = {
      providers: {
        openrouter: {
          apiKey: options?.apiKey ?? process.env.OPENROUTER_API_KEY ?? '',
          enabled: true,
        },
      },
    };
    this.providerRegistry = new ProviderRegistry(nexusConfig);

    this.approvalChecker = new ApprovalChecker({
      defaultLevel: this.getConfigValue<'auto' | 'notify' | 'ask'>('session.defaultApprovalLevel', 'auto'),
      persistenceEnabled: this.getConfigValue<boolean>('approval.persistLearnedRules', true),
    });

    this.gitManager = new GitManager({
      enabled: this.getConfigValue<boolean>('git.enabled', true),
      defaultBranch: this.getConfigValue<string>('git.defaultBranch', 'main'),
    });

    this.costTracker = new CostTracker({
      dailyLimit: this.getConfigValue<number>('cost.dailyLimit', 5.0),
      monthlyLimit: this.getConfigValue<number>('cost.monthlyLimit', 50.0),
      sessionLimit: this.getConfigValue<number>('cost.maxSessionCost', 2.0),
      warnAtPercent: this.getConfigValue<number>('cost.warnAtPercent', 80),
    });

    this.agentLoop = new AgentLoop(
      this.sessionManager,
      this.providerRegistry,
      this.approvalChecker,
      this.gitManager,
      this.configManager,
      { maxCost: this.getConfigValue<number>('cost.maxSessionCost', 2.0) },
    );

    this.logDebug('Nexus SDK initialized');
  }

  createSession(
    name: string,
    opts?: {
      model?: string;
      compressionEnabled?: boolean;
      approvalLevel?: 'auto' | 'notify' | 'ask';
      maxCost?: number;
      agentMode?: 'code' | 'architect' | 'ask';
      customInstructions?: string;
    },
  ): Session {
    const metadata: Partial<SessionMetadata> & { projectPath: string } = {
      projectPath: this.projectPath,
      model: opts?.model ?? '',
      compressionEnabled: opts?.compressionEnabled ?? this.getConfigValue<boolean>('compression.enabled', true),
      approvalLevel: opts?.approvalLevel ?? this.getConfigValue<'auto' | 'notify' | 'ask'>('session.defaultApprovalLevel', 'auto'),
      maxCost: opts?.maxCost ?? this.getConfigValue<number>('cost.maxSessionCost', 2.0),
      agentMode: opts?.agentMode,
      customInstructions: opts?.customInstructions,
    };

    const session = this.sessionManager.create(name, metadata);
    this.eventBus.emit(NexusSessionEvent.Events.SESSION_CREATED, session);
    this.logDebug(`Session created: ${session.id} (${name})`);
    return session;
  }

  async chat(sessionId: string, message: string): Promise<AsyncIterable<StreamChunk>> {
    const session = this.sessionManager.load(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const userMessage: UserMessage = {
      role: 'user',
      id: randomUUID(),
      timestamp: Date.now(),
      content: message,
    };
    this.sessionManager.addMessage(sessionId, userMessage);
    this.eventBus.emit(NexusSessionEvent.Events.MESSAGE_ADDED, userMessage);

    const routing: RoutingDecision = {
      strategy: 'cost',
      preferredModel: session.metadata.model || undefined,
      maxCost: session.metadata.maxCost,
      requireToolUse: false,
    };

    try {
      const stream = await this.providerRegistry.stream(routing, {
        model: routing.preferredModel ?? '',
        messages: [{
          role: 'user',
          content: message,
        }],
        stream: true,
      });

      return stream;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.eventBus.emit(NexusSessionEvent.Events.ERROR, errMsg);
      throw error;
    }
  }

  getSession(id: string): Session {
    return this.sessionManager.load(id);
  }

  listSessions(): Session[] {
    return this.sessionManager.list();
  }

  deleteSession(id: string): void {
    this.sessionManager.delete(id);
    this.eventBus.emit(NexusSessionEvent.Events.SESSION_DELETED, id);
  }

  getCost(sessionId: string): CostBreakdown {
    const session = this.sessionManager.load(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return {
      sessionTotal: session.cost.sessionTotal,
      dailyTotal: session.cost.dailyTotal,
      monthlyTotal: session.cost.monthlyTotal,
      budgetRemaining: session.cost.budgetRemaining,
      tokensUsed: session.cost.tokensUsed,
      savingsFromCompression: session.cost.savingsFromCompression,
      savingsFromFreeModels: session.cost.savingsFromFreeModels,
    };
  }

  getConfig(): Record<string, unknown> {
    return this.configManager.get() as unknown as Record<string, unknown>;
  }

  getConfigValue<T>(key: string, fallback: T): T {
    const val = this.configManager.get(key);
    return (val !== undefined ? val : fallback) as T;
  }

  updateConfig(key: string, value: unknown): void {
    this.configManager.set(key, value);
    this.configManager.write();
    this.logDebug(`Config updated: ${key}`);
  }

  async runTool(toolCall: {
    tool: string;
    arguments: Record<string, unknown>;
  }): Promise<ToolResult> {
    const toolApi = getAllTools({
      blockedPaths: this.getConfigValue<string[]>('tools.blockedPaths', []),
      allowedPaths: this.getConfigValue<string[]>('tools.allowedPaths', []),
      readMaxSize: this.getConfigValue<number>('tools.readMaxSize', 1_048_576),
      writeMaxSize: this.getConfigValue<number>('tools.writeMaxSize', 1_048_576),
      bashTimeoutDefault: this.getConfigValue<number>('tools.bashTimeoutDefault', 30_000),
      bashTimeoutMax: this.getConfigValue<number>('tools.bashTimeoutMax', 300_000),
      blockedCommands: this.getConfigValue<string[]>('tools.blockedCommands', []),
      blockedSubstrings: this.getConfigValue<string[]>('tools.blockedSubstrings', []),
    });

    let result: ToolResult;
    try {
      switch (toolCall.tool) {
        case 'read': {
          const r = await toolApi.read(toolCall.arguments as unknown as ReadArgs);
          result = { success: r.success, output: r.output, error: r.error, exitCode: r.exitCode };
          break;
        }
        case 'write': {
          const r = await toolApi.write(toolCall.arguments as unknown as WriteArgs);
          result = { success: r.success, output: r.output, error: r.error, exitCode: r.exitCode };
          break;
        }
        case 'edit': {
          const r = await toolApi.edit(toolCall.arguments as unknown as EditArgs);
          result = { success: r.success, output: r.output, error: r.error, exitCode: r.exitCode };
          break;
        }
        case 'bash': {
          const r = await toolApi.bash(toolCall.arguments as unknown as BashArgs);
          result = { success: r.success, output: r.output, error: r.error, exitCode: r.exitCode };
          break;
        }
        case 'glob': {
          const r = await toolApi.glob!(toolCall.arguments as unknown as { pattern: string; path?: string });
          result = { success: r.success, output: r.output, error: r.error, exitCode: r.exitCode };
          break;
        }
        case 'grep': {
          const r = await toolApi.grep!(toolCall.arguments as unknown as { pattern: string; path?: string; include?: string });
          result = { success: r.success, output: r.output, error: r.error, exitCode: r.exitCode };
          break;
        }
        default: {
          result = { success: false, output: '', error: `Unknown tool: ${toolCall.tool}`, exitCode: 1 };
        }
      }
    } catch (error) {
      result = { success: false, output: '', error: `Tool execution error: ${(error as Error).message}`, exitCode: 1 };
    }

    this.eventBus.emit(NexusSessionEvent.Events.TOOL_RESULT, result);
    return result;
  }

  async runTask(
    task: string,
    options?: {
      sessionName?: string;
      model?: string;
      onMessage?: (msg: Message) => void;
      onApproval?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
    },
  ): Promise<AgentResult> {
    this.agentLoop.setConfig({
      model: options?.model,
    });
    return this.agentLoop.runTask(task, {
      sessionName: options?.sessionName,
      projectPath: this.projectPath,
      onMessage: (msg: Message) => {
        this.eventBus.emit(NexusSessionEvent.Events.MESSAGE_ADDED, msg);
        options?.onMessage?.(msg);
      },
      onApproval: options?.onApproval,
    });
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    this.eventBus.on(event, handler);
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    this.eventBus.off(event, handler);
  }

  destroy(): void {
    this.eventBus.removeAllListeners();
    this.logDebug('Nexus SDK destroyed');
  }

  private logDebug(msg: string): void {
    if (this.debug) {
      console.error(`[Nexus SDK] ${msg}`);
    }
  }
}
