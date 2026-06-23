import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ErrorCode } from './types.js';
import { NexusError, withRetry, toNexusError } from './error.js';
import { SessionManager } from './session-manager.js';
import { ApprovalChecker } from './approval.js';
import { GitManager } from './git-manager.js';
import { ConfigManager } from './config.js';
import { getAllTools } from './tools.js';
import type {
  Session, SessionMetadata, AgentResult, Message,
  UserMessage, AssistantMessage, ToolMessage, SystemMessage,
  ToolCall, BashArgs, ReadArgs, WriteArgs, EditArgs,
} from './types.js';
import type {
  ProviderRegistry, LLMMessage, LLMResponse,
  RoutingDecision,
} from 'nexus-ai';

const MAX_ITERATIONS = 50;
const DEFAULT_MODEL = 'qwen/qwen3-235b-a22b:free';

interface AgentLoopConfig {
  model?: string;
  routing?: RoutingDecision;
  systemPrompt?: string;
  maxIterations?: number;
  compressionEnabled?: boolean;
  microEnabled?: boolean;
  approvalLevel?: 'auto' | 'notify' | 'ask';
  gitCommitBefore?: boolean;
  maxCost?: number;
  agentMode?: 'code' | 'architect' | 'ask';
  customInstructions?: string;
  onMessage?: (message: Message) => void;
  onApproval?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
}

function buildSystemPrompt(config?: AgentLoopConfig): string {
  const parts: string[] = [];

  const projectDir = process.cwd();
  const configFiles = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', '.nexus.md'];
  for (const file of configFiles) {
    const filePath = resolve(projectDir, file);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8').trim();
        if (content) {
          parts.push(`<${file}>\n${content}\n</${file}>`);
        }
      } catch {
        // skip unreadable files
      }
    }
  }

  const coreSystem = `You are Nexus, a coding agent that operates through tool calls. You can read, write, and edit files, execute commands, and search code.

Available tools:
- read: Read file contents with optional offset/limit/encoding
- write: Write content to files (requires overwrite flag for existing files)
- edit: Edit files using exact string replacement
- bash: Execute shell commands (blocked commands: sudo, su, chmod, chown, kill, etc.)
- glob: Find files matching glob patterns
- grep: Search file contents with regex patterns

Rules:
- Always use available tools to accomplish tasks. Do not simulate tool calls.
- When editing files, be precise with oldString matches.
- For bash commands, prefer safe read-only commands when possible.
- Use glob/grep to discover project structure before making changes.
- Keep responses concise and focused on the task.

${config?.customInstructions ?? ''}`;

  parts.unshift(coreSystem);

  return parts.join('\n\n');
}

function convertMessages(messages: Message[]): LLMMessage[] {
  const result: LLMMessage[] = [];

  for (const msg of messages) {
    switch (msg.role) {
      case 'system':
        result.push({ role: 'system', content: msg.content });
        break;
      case 'user':
        result.push({ role: 'user', content: msg.content });
        break;
      case 'assistant':
        result.push({
          role: 'assistant',
          content: msg.content,
          toolCalls: msg.toolCalls?.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.tool, arguments: JSON.stringify(tc.arguments) },
          })),
        });
        break;
      case 'tool':
        result.push({
          role: 'tool',
          content: msg.result.output || msg.result.error || '',
          toolCallId: msg.toolCallId,
          name: msg.toolName,
        });
        break;
    }
  }

  return result;
}

function getCfg<T>(mgr: ConfigManager, key: string, fallback: T): T {
  const val = mgr.get(key);
  return (val !== undefined ? val : fallback) as unknown as T;
}

export class AgentLoop {
  private sessionManager: SessionManager;
  private approvalChecker: ApprovalChecker;
  private gitManager: GitManager;
  private configManager: ConfigManager;
  private providerRegistry: ProviderRegistry;
  private tools: ReturnType<typeof getAllTools>;
  private currentSession: Session | null = null;
  private config: AgentLoopConfig;

  constructor(
    sessionManager: SessionManager,
    providerRegistry: ProviderRegistry,
    approvalChecker: ApprovalChecker,
    gitManager: GitManager,
    configManager: ConfigManager,
    config?: AgentLoopConfig,
  ) {
    this.sessionManager = sessionManager;
    this.providerRegistry = providerRegistry;
    this.approvalChecker = approvalChecker;
    this.gitManager = gitManager;
    this.configManager = configManager;
    this.config = config ?? {};
    this.tools = getAllTools({
      blockedPaths: getCfg<string[]>(configManager, 'tools.blockedPaths', []),
      allowedPaths: getCfg<string[]>(configManager, 'tools.allowedPaths', []),
      readMaxSize: getCfg<number>(configManager, 'tools.readMaxSize', 1_048_576),
      writeMaxSize: getCfg<number>(configManager, 'tools.writeMaxSize', 1_048_576),
      bashTimeoutDefault: getCfg<number>(configManager, 'tools.bashTimeoutDefault', 30_000),
      bashTimeoutMax: getCfg<number>(configManager, 'tools.bashTimeoutMax', 300_000),
      blockedCommands: getCfg<string[]>(configManager, 'tools.blockedCommands', []),
      blockedSubstrings: getCfg<string[]>(configManager, 'tools.blockedSubstrings', []),
    });
  }

  async runTask(task: string, options?: {
    sessionName?: string;
    projectPath?: string;
    onApproval?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
    onMessage?: (message: Message) => void;
  }): Promise<AgentResult> {
    const projectPath = options?.projectPath ?? process.cwd();
    const sessionName = options?.sessionName ?? `session-${Date.now().toString(36)}`;
    const maxIterations = this.config.maxIterations ?? MAX_ITERATIONS;
    const approvalLevel = this.config.approvalLevel ?? getCfg<'auto' | 'notify' | 'ask'>(this.configManager, 'session.defaultApprovalLevel', 'auto');
    const compressionEnabled = this.config.compressionEnabled ?? getCfg<boolean>(this.configManager, 'compression.enabled', true);
    const microEnabled = this.config.microEnabled ?? getCfg<boolean>(this.configManager, 'micro.enabled', true);
    const maxCost = this.config.maxCost ?? getCfg<number>(this.configManager, 'cost.maxSessionCost', 2.0);

    const metadata: Partial<SessionMetadata> & { projectPath: string } = {
      projectPath,
      model: this.config.model ?? DEFAULT_MODEL,
      compressionEnabled,
      approvalLevel,
      maxCost,
      gitCommitBefore: this.config.gitCommitBefore ?? false,
      agentMode: this.config.agentMode,
      customInstructions: this.config.customInstructions,
    };

    this.currentSession = this.sessionManager.create(sessionName, metadata);

    const userMessage: UserMessage = {
      role: 'user',
      id: randomUUID(),
      timestamp: Date.now(),
      content: task,
    };
    this.currentSession = this.sessionManager.addMessage(this.currentSession.id, userMessage);
    this.config.onMessage?.(userMessage);

    const systemPromptContent = buildSystemPrompt(this.config);
    const systemMessage: SystemMessage = {
      role: 'system',
      id: randomUUID(),
      timestamp: Date.now(),
      content: systemPromptContent,
      type: 'prompt',
    };

    try {
      const result = await this.runLoop(systemMessage, maxIterations, approvalLevel, options?.onApproval);
      return result;
    } catch (error) {
      const nexusError = toNexusError(error);
      this.currentSession = this.sessionManager.updateStatus(this.currentSession.id, 'error');

      const errorMessage: SystemMessage = {
        role: 'system',
        id: randomUUID(),
        timestamp: Date.now(),
        content: `Agent loop error: ${nexusError.message}`,
        type: 'error',
      };
      this.currentSession = this.sessionManager.addMessage(this.currentSession.id, errorMessage);

      return {
        success: false,
        session: this.currentSession,
        cost: this.currentSession.cost,
        error: nexusError.message,
        status: 'error',
      };
    }
  }

  private async runLoop(
    systemMessage: SystemMessage,
    maxIterations: number,
    approvalLevel: 'auto' | 'notify' | 'ask',
    onApproval?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>,
  ): Promise<AgentResult> {
    const session = this.currentSession!;
    const routingDecision: RoutingDecision = {
      strategy: 'cost',
      preferredModel: this.config.model ?? DEFAULT_MODEL,
      maxCost: getCfg<number>(this.configManager, 'cost.maxSessionCost', 2.0),
      requireToolUse: true,
    };

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      if (session.status !== 'active') {
        break;
      }

      const tokenLimit = 200_000;
      const messages = convertMessages(session.messages.slice(-50));
      const totalTokens = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);

      let compressedMessages = messages;
      if (this.config.compressionEnabled && totalTokens > tokenLimit) {
        try {
          compressedMessages = await this.compressMessages(messages, tokenLimit);
        } catch {
          console.warn('[AgentLoop] Compression failed, proceeding with original messages');
        }
      }

      const requestMessages = [convertMessages([systemMessage])[0]!, ...compressedMessages];

      let response: LLMResponse;
      try {
        response = await withRetry(() =>
          this.providerRegistry.send(routingDecision, {
            model: routingDecision.preferredModel ?? DEFAULT_MODEL,
            messages: requestMessages,
          }),
          { maxRetries: 2, context: { iteration } },
        );
      } catch (error) {
        const fallbackRouting: RoutingDecision = {
          ...routingDecision,
          strategy: 'fallback',
          preferredModel: undefined,
        };
        try {
          response = await this.providerRegistry.send(fallbackRouting, {
            model: DEFAULT_MODEL,
            messages: requestMessages,
          });
        } catch {
          throw new NexusError(ErrorCode.LOOP_MODEL_FAILURE, `Model call failed: ${(error as Error).message}`);
        }
      }

      const model = response.model;
      const tokens = {
        input: response.usage?.input ?? 0,
        output: response.usage?.output ?? 0,
      };
      const estimatedCost = tokens.input * 0.000001 + tokens.output * 0.000004;

      const assistantMessage: AssistantMessage = {
        role: 'assistant',
        id: randomUUID(),
        timestamp: Date.now(),
        content: response.content,
        toolCalls: response.toolCalls?.map((tc) => ({
          id: tc.id,
          tool: tc.function.name,
          arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
          status: 'pending' as const,
          startedAt: Date.now(),
        })),
        model,
        tokens,
        cost: estimatedCost,
      };

      session.cost.sessionTotal += estimatedCost;
      session.cost.tokensUsed += tokens.input + tokens.output;

      const maxSessionCost = getCfg<number>(this.configManager, 'cost.maxSessionCost', 2.0);
      if (session.cost.sessionTotal > maxSessionCost) {
        throw new NexusError(ErrorCode.LOOP_COST_EXCEEDED,
          `Session cost $${session.cost.sessionTotal.toFixed(4)} exceeds max $${maxSessionCost.toFixed(4)}`);
      }

      this.sessionManager.addMessage(session.id, assistantMessage);
      this.config.onMessage?.(assistantMessage);

      if (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0) {
        session.status = 'completed';
        this.sessionManager.updateStatus(session.id, 'completed');

        if (getCfg<boolean>(this.configManager, 'git.autoCommit', false)) {
          try {
            this.gitManager.commitSession(session);
          } catch {
            console.warn('[AgentLoop] Auto-commit failed');
          }
        }

        return {
          success: true,
          finalMessage: response.content,
          session,
          cost: session.cost,
          status: 'completed',
        };
      }

      for (const toolCall of assistantMessage.toolCalls) {
        toolCall.status = 'running';

        try {
          const approvalResult = await this.approvalChecker.check(toolCall.tool, toolCall.arguments);

          if (approvalResult.status === 'pending') {
            let approved = false;

            if (onApproval) {
              approved = await onApproval(toolCall.tool, toolCall.arguments);
            } else {
              approved = approvalLevel !== 'ask';
            }

            this.approvalChecker.learn(toolCall.tool, toolCall.arguments, approved);

            if (!approved) {
              toolCall.status = 'rejected';
              toolCall.completedAt = Date.now();

              const rejectionMessage: ToolMessage = {
                role: 'tool',
                id: randomUUID(),
                timestamp: Date.now(),
                toolCallId: toolCall.id,
                toolName: toolCall.tool,
                result: {
                  success: false,
                  output: '',
                  error: 'Tool call rejected by user',
                  exitCode: 1,
                },
                tokens: 0,
                compressed: false,
              };

              this.sessionManager.addMessage(session.id, rejectionMessage);
              this.config.onMessage?.(rejectionMessage);
              continue;
            }
          }

          if (approvalResult.status === 'approved') {
            toolCall.status = 'running';

            const toolResult = await this.executeToolCall(toolCall);

            toolCall.status = toolResult.result.success ? 'completed' : 'failed';
            toolCall.completedAt = Date.now();

            this.sessionManager.addMessage(session.id, toolResult);
            this.config.onMessage?.(toolResult);
          }
        } catch (error) {
          toolCall.status = 'failed';
          toolCall.completedAt = Date.now();

          const errorResult: ToolMessage = {
            role: 'tool',
            id: randomUUID(),
            timestamp: Date.now(),
            toolCallId: toolCall.id,
            toolName: toolCall.tool,
            result: {
              success: false,
              output: '',
              error: `Tool execution error: ${(error as Error).message}`,
              exitCode: 1,
            },
            tokens: 0,
            compressed: false,
          };

          this.sessionManager.addMessage(session.id, errorResult);
          this.config.onMessage?.(errorResult);
        }
      }
    }

    if (session.status === 'active') {
      session.status = 'completed';
      this.sessionManager.updateStatus(session.id, 'completed');
    }

    return {
      success: session.status === 'completed',
      session,
      cost: session.cost,
      status: session.status,
    };
  }

  private async executeToolCall(toolCall: ToolCall): Promise<ToolMessage> {
    try {
      let result: ToolMessage['result'];

      switch (toolCall.tool) {
        case 'read': {
          const args = toolCall.arguments as unknown as ReadArgs;
          if (!args.filePath) {
            throw new NexusError(ErrorCode.TOOL_INVALID_ARGS, 'read requires filePath');
          }
          result = await this.tools.read(args);
          break;
        }
        case 'write': {
          const args = toolCall.arguments as unknown as WriteArgs;
          if (!args.filePath || args.content === undefined) {
            throw new NexusError(ErrorCode.TOOL_INVALID_ARGS, 'write requires filePath and content');
          }
          result = await this.tools.write(args);
          break;
        }
        case 'edit': {
          const args = toolCall.arguments as unknown as EditArgs;
          if (!args.filePath || args.oldString === undefined || args.newString === undefined) {
            throw new NexusError(ErrorCode.TOOL_INVALID_ARGS, 'edit requires filePath, oldString, and newString');
          }
          result = await this.tools.edit(args);
          break;
        }
        case 'bash': {
          const args = toolCall.arguments as unknown as BashArgs;
          if (!args.command) {
            throw new NexusError(ErrorCode.TOOL_INVALID_ARGS, 'bash requires command');
          }
          result = await this.tools.bash(args);
          break;
        }
        case 'glob': {
          const args = toolCall.arguments as { pattern: string; path?: string };
          if (!args.pattern) {
            throw new NexusError(ErrorCode.TOOL_INVALID_ARGS, 'glob requires pattern');
          }
          result = await this.tools.glob!(args);
          break;
        }
        case 'grep': {
          const args = toolCall.arguments as { pattern: string; path?: string; include?: string };
          if (!args.pattern) {
            throw new NexusError(ErrorCode.TOOL_INVALID_ARGS, 'grep requires pattern');
          }
          result = await this.tools.grep!(args);
          break;
        }
        case 'search': {
          const args = toolCall.arguments as { pattern: string; path?: string };
          if (!args.pattern) {
            throw new NexusError(ErrorCode.TOOL_INVALID_ARGS, 'search requires pattern');
          }
          result = await this.tools.search!(args);
          break;
        }
        default:
          result = {
            success: false,
            output: '',
            error: `Unknown tool: ${toolCall.tool}`,
            exitCode: 1,
          };
      }

      return {
        role: 'tool',
        id: randomUUID(),
        timestamp: Date.now(),
        toolCallId: toolCall.id,
        toolName: toolCall.tool,
        result,
        tokens: Math.ceil(result.output.length / 4),
        compressed: false,
      };
    } catch (error) {
      return {
        role: 'tool',
        id: randomUUID(),
        timestamp: Date.now(),
        toolCallId: toolCall.id,
        toolName: toolCall.tool,
        result: {
          success: false,
          output: '',
          error: `Tool execution error: ${(error as Error).message}`,
          exitCode: 1,
        },
        tokens: 0,
        compressed: false,
      };
    }
  }

  private async compressMessages(
    messages: LLMMessage[],
    tokenLimit: number,
  ): Promise<LLMMessage[]> {
    const summaryMsg: LLMMessage = {
      role: 'system',
      content: `[Previous conversation history compressed. Total messages: ${messages.length}. Key context retained in remaining messages.]`,
    };

    let totalTokens = 0;
    const retained: LLMMessage[] = [];
    const compressible: LLMMessage[] = [];

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]!;
      const tokens = Math.ceil(msg.content.length / 4);
      if (totalTokens + tokens < tokenLimit) {
        retained.unshift(msg);
        totalTokens += tokens;
      } else {
        if (msg.role === 'system') {
          retained.unshift(msg);
        } else {
          compressible.unshift(msg);
        }
      }
    }

    if (compressible.length > 0) {
      const compressedContent = compressible
        .map((m) => `[${m.role}]: ${m.content.slice(0, 100)}`)
        .join('\n');
      const compressedMsg: LLMMessage = {
        role: 'system',
        content: `## Compressed History\n${compressedContent}`,
      };

      const compressedTokens = Math.ceil(compressedContent.length / 4);
      while (totalTokens + compressedTokens > tokenLimit && retained.length > 1) {
        const oldestMsg = retained.shift()!;
        if (oldestMsg.role !== 'system') {
          totalTokens -= Math.ceil(oldestMsg.content.length / 4);
        } else {
          retained.unshift(oldestMsg);
          break;
        }
      }
      retained.unshift(compressedMsg);
      retained.unshift(summaryMsg);
    }

    return retained;
  }

  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  setProviderRegistry(registry: ProviderRegistry): void {
    this.providerRegistry = registry;
  }

  setConfig(config: Partial<AgentLoopConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export async function runAgentLoop(
  task: string,
  options: AgentLoopConfig & {
    sessionManager?: SessionManager;
    providerRegistry: ProviderRegistry;
    approvalChecker?: ApprovalChecker;
    gitManager?: GitManager;
    configManager?: ConfigManager;
  },
): Promise<AgentResult> {
  const configManager = options?.configManager ?? new ConfigManager();
  const sessionManager = options?.sessionManager ?? new SessionManager();
  const approvalChecker = options?.approvalChecker ?? new ApprovalChecker({
    defaultLevel: options?.approvalLevel ?? getCfg<'auto' | 'notify' | 'ask'>(configManager, 'session.defaultApprovalLevel', 'auto'),
    alwaysAsk: getCfg<string[]>(configManager, 'approval.alwaysAsk', []),
    autoApprove: getCfg<string[]>(configManager, 'approval.autoApprove', []),
    persistenceEnabled: getCfg<boolean>(configManager, 'approval.persistLearnedRules', true),
  });
  const gitManager = options?.gitManager ?? new GitManager({
    enabled: getCfg<boolean>(configManager, 'git.enabled', true),
    defaultBranch: getCfg<string>(configManager, 'git.defaultBranch', 'main'),
    autoCommitPrefix: getCfg<string>(configManager, 'git.autoCommitPrefix', 'nexus'),
    mergeStrategy: getCfg<'merge' | 'squash' | 'rebase'>(configManager, 'git.mergeStrategy', 'squash'),
  });

  const loop = new AgentLoop(
    sessionManager,
    options.providerRegistry,
    approvalChecker,
    gitManager,
    configManager,
    options,
  );

  return loop.runTask(task, {
    sessionName: options?.customInstructions?.slice(0, 40) ?? `task-${Date.now().toString(36)}`,
    projectPath: process.cwd(),
    onApproval: options?.onApproval,
    onMessage: options?.onMessage,
  });
}
