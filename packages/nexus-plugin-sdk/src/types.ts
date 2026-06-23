export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  [key: string]: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  main: string;
  permissions: string[];
  tools?: {
    name: string;
    description: string;
    parameters: JSONSchema;
  }[];
  hooks?: {
    event: string;
    handler: string;
  }[];
  commands?: {
    name: string;
    description: string;
    aliases?: string[];
  }[];
  ui?: {
    panels?: {
      id: string;
      title: string;
      component: string;
    }[];
  };
}

export interface ToolAPI {
  read(path: string, opts?: { encoding?: string }): Promise<string>;
  write(path: string, content: string, opts?: { encoding?: string }): Promise<void>;
  edit(path: string, oldStr: string, newStr: string): Promise<void>;
  bash(command: string, opts?: { cwd?: string; timeout?: number }): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  glob(pattern: string): Promise<string[]>;
  grep(regex: string, pattern?: string): Promise<{ file: string; line: number; content: string }[]>;
}

export interface PluginStorage {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  getAll(): Promise<Record<string, unknown>>;
}

export interface PluginUI {
  showNotification(message: string, type?: "info" | "warning" | "error"): Promise<void>;
  showInput(prompt: string, defaultValue?: string): Promise<string | null>;
  showConfirm(message: string): Promise<boolean>;
}

export interface PluginLogger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface PluginContext {
  ui: PluginUI;
  tools: ToolAPI;
  storage: PluginStorage;
  logger: PluginLogger;
  events: {
    on(event: string, handler: (...args: unknown[]) => void): void;
    off(event: string, handler: (...args: unknown[]) => void): void;
    emit(event: string, ...args: unknown[]): void;
    once(event: string, handler: (...args: unknown[]) => void): void;
  };
}

export interface PluginAPI {
  initialize(context: PluginContext): Promise<void>;
  activate?(): Promise<void>;
  deactivate?(): Promise<void>;
}

export interface PluginRegistration {
  manifest: PluginManifest;
  api: PluginAPI;
  tools: Map<string, ToolDefinition>;
  hooks: { event: string; handler: string }[];
}

export interface PluginSandboxConfig {
  enabled: boolean;
  memoryLimit?: number;
  timeout?: number;
  networkAllowlist?: string[];
}

export interface SandboxPermissions {
  fs: { read: boolean; write: boolean; delete: boolean };
  process: { spawn: boolean };
  network: { fetch: boolean; listen: boolean };
  git: { read: boolean; write: boolean };
  env: { read: boolean; write: boolean };
}

export const DEFAULT_SANDBOX_CONFIG: PluginSandboxConfig = {
  enabled: true,
  memoryLimit: 128,
  timeout: 5000,
  networkAllowlist: [],
};

export const ALL_SANDBOX_PERMISSIONS: SandboxPermissions = {
  fs: { read: true, write: true, delete: true },
  process: { spawn: true },
  network: { fetch: true, listen: true },
  git: { read: true, write: true },
  env: { read: true, write: false },
};
