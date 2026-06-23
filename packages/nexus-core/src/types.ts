import type { ModelDefinition } from 'nexus-ai';

// ── Message System ──────────────────────────────────────────────────────────

export interface MessageBase {
  id: string;
  timestamp: number;
}

export interface UserMessage extends MessageBase {
  role: 'user';
  content: string;
}

export interface AssistantMessage extends MessageBase {
  role: 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  reasoning?: string;
  model: string;
  tokens: { input: number; output: number };
  cost: number;
  compressionSavings?: number;
}

export interface ToolMessage extends MessageBase {
  role: 'tool';
  toolCallId: string;
  toolName: string;
  result: {
    success: boolean;
    output: string;
    error?: string;
    exitCode?: number;
  };
  tokens: number;
  compressed: boolean;
  originalTokens?: number;
}

export interface SystemMessage extends MessageBase {
  role: 'system';
  content: string;
  type: 'prompt' | 'config' | 'error' | 'warning' | 'info';
}

export type Message = UserMessage | AssistantMessage | ToolMessage | SystemMessage;

// ── Tool Calls ──────────────────────────────────────────────────────────────

export interface ToolCall {
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'approved' | 'rejected';
  startedAt: number;
  completedAt?: number;
}

// ── Tool Arguments ───────────────────────────────────────────────────────────

export interface ReadArgs {
  filePath: string;
  offset?: number;
  limit?: number;
  encoding?: 'utf-8' | 'ascii' | 'base64' | 'hex';
}

export interface WriteArgs {
  filePath: string;
  content: string;
  overwrite?: boolean;
}

export interface EditArgs {
  filePath: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

export interface BashArgs {
  command: string;
  description?: string;
  timeout?: number;
  workdir?: string;
  env?: Record<string, string>;
}

// ── Cost ────────────────────────────────────────────────────────────────────

export interface SessionCost {
  sessionTotal: number;
  dailyTotal: number;
  monthlyTotal: number;
  budgetRemaining: number;
  tokensUsed: number;
  savingsFromCompression: number;
  savingsFromFreeModels: number;
}

// ── Session Metadata ────────────────────────────────────────────────────────

export interface SessionMetadata {
  projectPath: string;
  model: string;
  compressionEnabled: boolean;
  maxCost: number;
  approvalLevel: 'auto' | 'notify' | 'ask';
  gitCommitBefore: boolean;
  agentMode?: 'code' | 'architect' | 'ask';
  customInstructions?: string;
}

// ── Session ─────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  name: string;
  branch: string;
  createdAt: number;
  updatedAt: number;
  status: 'active' | 'paused' | 'completed' | 'error' | 'aborted';
  messages: Message[];
  metadata: SessionMetadata;
  cost: SessionCost;
}

// ── Agent Results ───────────────────────────────────────────────────────────

export interface AgentResult {
  success: boolean;
  finalMessage?: string;
  session: Session;
  cost?: SessionCost;
  error?: string;
  status?: string;
  approvalRequest?: ApprovalResult;
}

export interface ApprovalResult {
  status: 'approved' | 'rejected' | 'pending';
  rule?: string;
  request?: {
    toolName: string;
    args: Record<string, unknown>;
    reasoning?: string;
  };
  notify?: boolean;
}

// ── Merge ───────────────────────────────────────────────────────────────────

export interface MergeResult {
  success: boolean;
  conflicts: string[];
}

// ── Tool API ────────────────────────────────────────────────────────────────

export interface ToolAPI {
  read(args: ReadArgs): Promise<ToolMessage['result']>;
  write(args: WriteArgs): Promise<ToolMessage['result']>;
  edit(args: EditArgs): Promise<ToolMessage['result']>;
  bash(args: BashArgs): Promise<ToolMessage['result']>;
  search?(args: { pattern: string; path?: string }): Promise<ToolMessage['result']>;
  glob?(args: { pattern: string; path?: string }): Promise<ToolMessage['result']>;
  grep?(args: { pattern: string; path?: string; include?: string }): Promise<ToolMessage['result']>;
}

// ── Approval Rules ──────────────────────────────────────────────────────────

export interface ApprovalRule {
  id: string;
  pattern: string;
  toolName: string;
  action: 'auto' | 'notify' | 'ask';
  reason: string;
  createdAt: number;
  lastApplied: number;
  confidence: number;
  appliedCount: number;
}

export interface LearnedRule extends ApprovalRule {
  source: 'user' | 'auto';
  positiveFeedback: number;
  negativeFeedback: number;
}

// ── Config ──────────────────────────────────────────────────────────────────

export interface NexusCoreConfig {
  session: {
    maxIterations: number;
    maxToolCallsPerIteration: number;
    defaultApprovalLevel: 'auto' | 'notify' | 'ask';
    autoContinue: boolean;
    saveOnEveryMessage: boolean;
    askOnTaskCompletion: boolean;
  };
  git: {
    enabled: boolean;
    autoCommit: boolean;
    autoCommitPrefix: string;
    defaultBranch: string;
    commitMessageTemplate: string;
    mergeStrategy: 'merge' | 'squash' | 'rebase';
  };
  tools: {
    readMaxSize: number;
    writeMaxSize: number;
    bashTimeoutDefault: number;
    bashTimeoutMax: number;
    blockedCommands: string[];
    blockedSubstrings: string[];
    allowedPaths: string[];
    blockedPaths: string[];
    dangerousPatterns: string[];
  };
  compression: {
    enabled: boolean;
    minTokens: number;
    ratio: number;
    strategy: 'truncate' | 'summarize';
  };
  micro: {
    enabled: boolean;
    maxTokens: number;
    routeThreshold: 'always' | 'auto' | 'never';
    preferredModel: string;
  };
  cost: {
    budget: number;
    dailyLimit: number;
    monthlyLimit: number;
    warnAtPercent: number;
    maxSessionCost: number;
    trackFreeModels: boolean;
  };
  approval: {
    enabled: boolean;
    persistLearnedRules: boolean;
    learnedRulesFile: string;
    alwaysAsk: string[];
    autoApprove: string[];
    confidenceDecayPerMonth: number;
  };
  plugins: {
    enabled: boolean;
    paths: string[];
  };
}

// ── Error Codes ─────────────────────────────────────────────────────────────

export enum ErrorCode {
  // Session errors (S-XXX)
  SESSION_NOT_FOUND = 'S-001',
  SESSION_ALREADY_EXISTS = 'S-002',
  SESSION_INVALID_STATE = 'S-003',
  SESSION_SAVE_FAILED = 'S-004',
  SESSION_LOAD_FAILED = 'S-005',

  // Agent loop errors (L-XXX)
  LOOP_MAX_ITERATIONS = 'L-001',
  LOOP_MODEL_FAILURE = 'L-002',
  LOOP_TOOL_FAILURE = 'L-003',
  LOOP_COST_EXCEEDED = 'L-004',
  LOOP_COMPRESSION_FAILED = 'L-005',
  LOOP_SYSTEM_PROMPT_FAILED = 'L-006',

  // Tool errors (T-XXX)
  TOOL_READ_FAILED = 'T-001',
  TOOL_WRITE_FAILED = 'T-002',
  TOOL_EDIT_FAILED = 'T-003',
  TOOL_BASH_FAILED = 'T-004',
  TOOL_SEARCH_FAILED = 'T-005',
  TOOL_INVALID_ARGS = 'T-006',
  TOOL_SAFETY_BLOCKED = 'T-007',
  TOOL_FILE_TOO_LARGE = 'T-008',
  TOOL_PATH_BLOCKED = 'T-009',
  TOOL_OVERWRITE_BLOCKED = 'T-010',
  TOOL_ENCODING_ERROR = 'T-011',

  // Approval errors (A-XXX)
  APPROVAL_REJECTED = 'A-001',
  APPROVAL_PENDING = 'A-002',
  APPROVAL_RULE_PARSE_FAILED = 'A-003',
  APPROVAL_PERSIST_FAILED = 'A-004',

  // Git errors (G-XXX)
  GIT_NOT_FOUND = 'G-001',
  GIT_BRANCH_FAILED = 'G-002',
  GIT_COMMIT_FAILED = 'G-003',
  GIT_MERGE_FAILED = 'G-004',
  GIT_STASH_FAILED = 'G-005',
  GIT_CONFLICT = 'G-006',
  GIT_NOT_A_REPO = 'G-007',

  // Config errors (C-XXX)
  CONFIG_LOAD_FAILED = 'C-001',
  CONFIG_SAVE_FAILED = 'C-002',
  CONFIG_INVALID = 'C-003',
  CONFIG_KEY_NOT_FOUND = 'C-004',

  // Compression errors (P-XXX)
  COMPRESSION_FAILED = 'P-001',
  DECOMPRESSION_FAILED = 'P-002',

  // General errors (E-XXX)
  UNKNOWN = 'E-001',
  NOT_IMPLEMENTED = 'E-002',
  INVALID_STATE = 'E-003',
  TIMEOUT = 'E-004',
  CIRCUIT_OPEN = 'E-005',
}

// ── Recovery Strategy ───────────────────────────────────────────────────────

export type RecoveryStrategy = 'retry' | 'fallback' | 'abort' | 'skip' | 'degrade' | 'ask_user';

export interface ErrorRecoveryEntry {
  code: ErrorCode;
  strategy: RecoveryStrategy;
  retryCount: number;
  fallbackAction?: string;
  message: string;
}

export const ERROR_RECOVERY_MATRIX: ErrorRecoveryEntry[] = [
  { code: ErrorCode.SESSION_NOT_FOUND, strategy: 'abort', retryCount: 0, message: 'Session not found. Aborting.' },
  { code: ErrorCode.SESSION_INVALID_STATE, strategy: 'abort', retryCount: 0, message: 'Session in invalid state.' },
  { code: ErrorCode.SESSION_SAVE_FAILED, strategy: 'retry', retryCount: 3, message: 'Failed to save session.' },
  { code: ErrorCode.SESSION_LOAD_FAILED, strategy: 'retry', retryCount: 3, message: 'Failed to load session.' },
  { code: ErrorCode.LOOP_MAX_ITERATIONS, strategy: 'abort', retryCount: 0, message: 'Agent loop exceeded max iterations.' },
  { code: ErrorCode.LOOP_MODEL_FAILURE, strategy: 'fallback', retryCount: 2, fallbackAction: 'switch_model', message: 'Model call failed.' },
  { code: ErrorCode.LOOP_TOOL_FAILURE, strategy: 'retry', retryCount: 2, message: 'Tool execution failed.' },
  { code: ErrorCode.LOOP_COST_EXCEEDED, strategy: 'abort', retryCount: 0, message: 'Cost budget exceeded.' },
  { code: ErrorCode.LOOP_COMPRESSION_FAILED, strategy: 'skip', retryCount: 0, message: 'Compression failed, skipping.' },
  { code: ErrorCode.TOOL_READ_FAILED, strategy: 'retry', retryCount: 2, message: 'Failed to read file.' },
  { code: ErrorCode.TOOL_WRITE_FAILED, strategy: 'retry', retryCount: 2, message: 'Failed to write file.' },
  { code: ErrorCode.TOOL_EDIT_FAILED, strategy: 'retry', retryCount: 2, message: 'Failed to edit file.' },
  { code: ErrorCode.TOOL_BASH_FAILED, strategy: 'retry', retryCount: 1, message: 'Command execution failed.' },
  { code: ErrorCode.TOOL_SAFETY_BLOCKED, strategy: 'abort', retryCount: 0, message: 'Safety check blocked this action.' },
  { code: ErrorCode.TOOL_PATH_BLOCKED, strategy: 'abort', retryCount: 0, message: 'Path is blocked by configuration.' },
  { code: ErrorCode.APPROVAL_REJECTED, strategy: 'abort', retryCount: 0, message: 'User rejected the action.' },
  { code: ErrorCode.APPROVAL_PENDING, strategy: 'ask_user', retryCount: 0, message: 'Awaiting user approval.' },
  { code: ErrorCode.GIT_NOT_FOUND, strategy: 'degrade', retryCount: 0, fallbackAction: 'disable_git', message: 'Git not found, disabling git features.' },
  { code: ErrorCode.GIT_NOT_A_REPO, strategy: 'degrade', retryCount: 0, fallbackAction: 'init_repo', message: 'Not a git repository.' },
  { code: ErrorCode.GIT_BRANCH_FAILED, strategy: 'retry', retryCount: 2, message: 'Failed to create branch.' },
  { code: ErrorCode.GIT_COMMIT_FAILED, strategy: 'retry', retryCount: 2, message: 'Failed to commit.' },
  { code: ErrorCode.GIT_MERGE_FAILED, strategy: 'retry', retryCount: 1, message: 'Merge failed.' },
  { code: ErrorCode.CONFIG_LOAD_FAILED, strategy: 'degrade', retryCount: 0, fallbackAction: 'default_config', message: 'Failed to load config, using defaults.' },
  { code: ErrorCode.CONFIG_INVALID, strategy: 'degrade', retryCount: 0, fallbackAction: 'default_config', message: 'Invalid config, using defaults.' },
  { code: ErrorCode.COMPRESSION_FAILED, strategy: 'skip', retryCount: 0, message: 'Compression failed, proceeding without.' },
  { code: ErrorCode.TIMEOUT, strategy: 'retry', retryCount: 2, message: 'Operation timed out.' },
  { code: ErrorCode.CIRCUIT_OPEN, strategy: 'fallback', retryCount: 0, fallbackAction: 'switch_provider', message: 'Circuit breaker is open.' },
  { code: ErrorCode.UNKNOWN, strategy: 'abort', retryCount: 0, message: 'An unknown error occurred.' },
];

export function getRecoveryStrategy(code: ErrorCode): ErrorRecoveryEntry {
  return ERROR_RECOVERY_MATRIX.find((e) => e.code === code) ?? {
    code: ErrorCode.UNKNOWN,
    strategy: 'abort',
    retryCount: 0,
    message: 'Unknown error code.',
  };
}
