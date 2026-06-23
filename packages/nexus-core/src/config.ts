import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ErrorCode } from './types.js';
import { NexusError } from './error.js';
import type { NexusCoreConfig } from './types.js';

const DEFAULT_CONFIG_DIR = join(homedir(), '.nexus');
const DEFAULT_CONFIG_PATH = join(DEFAULT_CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: NexusCoreConfig = {
  session: {
    maxIterations: 50,
    maxToolCallsPerIteration: 1,
    defaultApprovalLevel: 'auto',
    autoContinue: false,
    saveOnEveryMessage: true,
    askOnTaskCompletion: true,
  },
  git: {
    enabled: true,
    autoCommit: true,
    autoCommitPrefix: 'nexus',
    defaultBranch: 'main',
    commitMessageTemplate: 'nexus/{session-name}-{date}',
    mergeStrategy: 'squash',
  },
  tools: {
    readMaxSize: 1_048_576,
    writeMaxSize: 1_048_576,
    bashTimeoutDefault: 30_000,
    bashTimeoutMax: 300_000,
    blockedCommands: ['sudo', 'su', 'chmod', 'chown', 'passwd', 'shutdown', 'reboot', 'init', 'systemctl', 'service', 'kill', 'pkill', 'mkfs', 'dd', 'fdisk', 'parted', 'iptables', 'ufw'],
    blockedSubstrings: ['rm -rf /', 'rm -rf ~', 'rm -rf .', ':(){ :|:& };:', '> /dev/sda', '| sh', '| bash', 'curl.*| sh', 'wget.*| sh'],
    allowedPaths: [],
    blockedPaths: ['/etc', '/usr', '/bin', '/sbin', '/dev', '/proc', '/sys'],
    dangerousPatterns: ['rm\\s+(-rf|--recursive)', 'mkfs', 'dd\\s+if=', '>\\s*/dev/', 'chmod\\s+777', 'chown\\s', 'wget.*\\|', 'curl.*\\|'],
  },
  compression: {
    enabled: true,
    minTokens: 2000,
    ratio: 0.5,
    strategy: 'truncate',
  },
  micro: {
    enabled: true,
    maxTokens: 500,
    routeThreshold: 'auto',
    preferredModel: 'qwen/qwen3-235b-a22b:free',
  },
  cost: {
    budget: 10.0,
    dailyLimit: 5.0,
    monthlyLimit: 50.0,
    warnAtPercent: 80,
    maxSessionCost: 2.0,
    trackFreeModels: true,
  },
  approval: {
    enabled: true,
    persistLearnedRules: true,
    learnedRulesFile: join(DEFAULT_CONFIG_DIR, 'approval-rules.json'),
    alwaysAsk: [],
    autoApprove: [],
    confidenceDecayPerMonth: 0.9,
  },
  plugins: {
    enabled: true,
    paths: [],
  },
};

function getEnvOverrides(): Partial<NexusCoreConfig> {
  const overrides: Partial<NexusCoreConfig> = {};
  const env = process.env;

  if (env.NEXUS_MAX_ITERATIONS) {
    overrides.session = { ...overrides.session, maxIterations: parseInt(env.NEXUS_MAX_ITERATIONS, 10) } as typeof overrides.session;
  }
  if (env.NEXUS_APPROVAL_LEVEL) {
    overrides.session = { ...overrides.session, defaultApprovalLevel: env.NEXUS_APPROVAL_LEVEL as 'auto' | 'notify' | 'ask' } as typeof overrides.session;
  }
  if (env.NEXUS_GIT_ENABLED) {
    overrides.git = { ...overrides.git, enabled: env.NEXUS_GIT_ENABLED !== 'false' } as typeof overrides.git;
  }
  if (env.NEXUS_AUTO_COMMIT) {
    overrides.git = { ...overrides.git, autoCommit: env.NEXUS_AUTO_COMMIT !== 'false' } as typeof overrides.git;
  }
  if (env.NEXUS_DEFAULT_BRANCH) {
    overrides.git = { ...overrides.git, defaultBranch: env.NEXUS_DEFAULT_BRANCH } as typeof overrides.git;
  }
  if (env.NEXUS_BASH_TIMEOUT) {
    overrides.tools = { ...overrides.tools, bashTimeoutDefault: parseInt(env.NEXUS_BASH_TIMEOUT, 10) } as typeof overrides.tools;
  }
  if (env.NEXUS_BUDGET) {
    overrides.cost = { ...overrides.cost, budget: parseFloat(env.NEXUS_BUDGET) } as typeof overrides.cost;
  }
  if (env.NEXUS_DAILY_LIMIT) {
    overrides.cost = { ...overrides.cost, dailyLimit: parseFloat(env.NEXUS_DAILY_LIMIT) } as typeof overrides.cost;
  }
  if (env.NEXUS_MONTHLY_LIMIT) {
    overrides.cost = { ...overrides.cost, monthlyLimit: parseFloat(env.NEXUS_MONTHLY_LIMIT) } as typeof overrides.cost;
  }
  if (env.NEXUS_COMPRESSION_ENABLED) {
    overrides.compression = { ...overrides.compression, enabled: env.NEXUS_COMPRESSION_ENABLED !== 'false' } as typeof overrides.compression;
  }
  if (env.NEXUS_MICRO_ENABLED) {
    overrides.micro = { ...overrides.micro, enabled: env.NEXUS_MICRO_ENABLED !== 'false' } as typeof overrides.micro;
  }
  if (env.NEXUS_BLOCKED_COMMANDS) {
    const commands = env.NEXUS_BLOCKED_COMMANDS.split(',').map((s) => s.trim());
    overrides.tools = { ...overrides.tools, blockedCommands: commands } as typeof overrides.tools;
  }
  if (env.NEXUS_ALLOWED_PATHS) {
    const paths = env.NEXUS_ALLOWED_PATHS.split(',').map((s) => s.trim());
    overrides.tools = { ...overrides.tools, allowedPaths: paths } as typeof overrides.tools;
  }

  return overrides;
}

function deepMerge<T extends Record<string, unknown>>(base: T, overrides: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(overrides) as (keyof T)[]) {
    const val = overrides[key];
    if (val !== undefined) {
      if (typeof val === 'object' && val !== null && !Array.isArray(val) && typeof result[key] === 'object' && result[key] !== null) {
        result[key] = deepMerge(result[key] as Record<string, unknown>, val as Record<string, unknown>) as T[keyof T];
      } else {
        result[key] = val as T[keyof T];
      }
    }
  }
  return result;
}

export class ConfigManager {
  private config: NexusCoreConfig;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath ?? DEFAULT_CONFIG_PATH;
    this.config = this.loadConfig();
  }

  private loadConfig(): NexusCoreConfig {
    try {
      if (existsSync(this.configPath)) {
        const raw = readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<NexusCoreConfig>;
        const merged = deepMerge(structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>, parsed as unknown as Record<string, unknown>);
        return merged as unknown as NexusCoreConfig;
      }
    } catch {
      console.warn(`[Config] Failed to load config from ${this.configPath}, using defaults`);
    }
    return structuredClone(DEFAULT_CONFIG);
  }

  private applyEnvOverrides(): void {
    const envOverrides = getEnvOverrides();
    this.config = deepMerge(structuredClone(this.config) as unknown as Record<string, unknown>, envOverrides as unknown as Record<string, unknown>) as unknown as NexusCoreConfig;
  }

  get(): NexusCoreConfig;
  get(key: string): unknown;
  get(key?: string): unknown {
    if (key === undefined) return this.config;

    const keys = key.split('.');
    let val: unknown = this.config as unknown as Record<string, unknown>;
    for (const k of keys) {
      if (val === null || val === undefined || typeof val !== 'object') {
        return undefined;
      }
      val = (val as Record<string, unknown>)[k];
    }
    return val;
  }

  set(key: string, value: unknown): void {
    const keys = key.split('.');
    let obj: Record<string, unknown> = this.config as unknown as Record<string, unknown>;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]!;
      if (!obj[k] || typeof obj[k] !== 'object') {
        obj[k] = {};
      }
      obj = obj[k] as Record<string, unknown>;
    }
    obj[keys[keys.length - 1]!] = value;
  }

  write(config?: NexusCoreConfig): void {
    try {
      if (config) {
        this.config = config;
      }
      if (!existsSync(DEFAULT_CONFIG_DIR)) {
        mkdirSync(DEFAULT_CONFIG_DIR, { recursive: true });
      }
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (error) {
      throw new NexusError(ErrorCode.CONFIG_SAVE_FAILED, `Failed to save config: ${(error as Error).message}`);
    }
  }

  reset(): void {
    this.config = structuredClone(DEFAULT_CONFIG);
    this.applyEnvOverrides();
  }

  getConfig(): NexusCoreConfig {
    return this.config;
  }

  static getDefaultConfig(): NexusCoreConfig {
    return structuredClone(DEFAULT_CONFIG);
  }
}

let _defaultConfigManager: ConfigManager | null = null;

export function getConfigManager(configPath?: string): ConfigManager {
  if (!_defaultConfigManager) {
    _defaultConfigManager = new ConfigManager(configPath);
  }
  return _defaultConfigManager;
}

export { DEFAULT_CONFIG, DEFAULT_CONFIG_DIR, DEFAULT_CONFIG_PATH };
