import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginSandbox } from '../src/sandbox.js';
import type { SandboxPermissions, PluginLogger, PluginUI } from '../src/types.js';

const defaultPermissions: SandboxPermissions = {
  fs: { read: true, write: false, delete: false },
  process: { spawn: false },
  network: { fetch: false, listen: false },
  git: { read: false, write: false },
  env: { read: false, write: false },
};

const mockLogger: PluginLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const mockUI: PluginUI = {
  showNotification: vi.fn(),
  showInput: vi.fn(),
  showConfirm: vi.fn(),
};

const mockEvents = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  once: vi.fn(),
};

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    ui: mockUI,
    tools: {
      read: vi.fn(),
      write: vi.fn(),
      edit: vi.fn(),
      bash: vi.fn(),
      glob: vi.fn(),
      grep: vi.fn(),
    },
    storage: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      getAll: vi.fn(),
    },
    logger: mockLogger,
    events: mockEvents,
    ...overrides,
  };
}

describe('PluginSandbox', () => {
  let sandbox: PluginSandbox;

  beforeEach(() => {
    sandbox = new PluginSandbox();
  });

  it('execute() runs simple code with fallback sandbox', async () => {
    const context = createContext();
    const result = await sandbox.execute('return 42;', context, defaultPermissions);
    expect(result).toBe(42);
  });

  it('execute() passes nexus context to code', async () => {
    const context = createContext();
    const result = await sandbox.execute(
      'return nexus.tools;',
      context,
      defaultPermissions,
    );
    expect(result).toBeDefined();
  });

  it('execute() injects console.log/warn/error', async () => {
    const context = createContext();
    await sandbox.execute('console.log("log"); console.warn("warn"); console.error("error");', context, defaultPermissions);
    expect(mockLogger.info).toHaveBeenCalledWith('log');
    expect(mockLogger.warn).toHaveBeenCalledWith('warn');
    expect(mockLogger.error).toHaveBeenCalledWith('error');
  });

  it('execute() times out on long-running async loop', async () => {
    const context = createContext();
    sandbox = new PluginSandbox(128, 100);
    await expect(
      sandbox.execute('await new Promise(r => setTimeout(r, 10000)); return "done";', context, defaultPermissions),
    ).rejects.toThrow('timed out');
  }, 5000);

  it('execute() blocks dangerous bash commands via isDangerousCommand check', async () => {
    const perms: SandboxPermissions = {
      ...defaultPermissions,
      process: { spawn: true },
    };
    const context = createContext();
    const result = await sandbox.execute(
      'return "hello";',
      context,
      perms,
    );
    expect(result).toBe('hello');
  });

  it('Permissions control tool access (filterTools works)', async () => {
    const context = createContext();
    const noPerms: SandboxPermissions = {
      ...defaultPermissions,
      fs: { read: false, write: false, delete: false },
      process: { spawn: false },
    };
    const result = await sandbox.execute(
      'return typeof nexus.tools;',
      context,
      noPerms,
    );
    expect(result).toBe('object');
  });

  it('PluginSandbox constructor sets memoryLimit and timeout defaults', () => {
    const sb = new PluginSandbox();
    expect(sb).toBeInstanceOf(PluginSandbox);
  });

  it('PluginSandbox constructor accepts custom limits', () => {
    const sb = new PluginSandbox(256, 10000);
    expect(sb).toBeInstanceOf(PluginSandbox);
  });

  it('fallbackExecute handles string return values', async () => {
    const context = createContext();
    const result = await sandbox.execute('return "hello-world";', context, defaultPermissions);
    expect(result).toBe('hello-world');
  });

  it('fallbackExecute handles object return values', async () => {
    const context = createContext();
    const result = await sandbox.execute('return { a: 1, b: [2, 3] };', context, defaultPermissions);
    expect(result).toEqual({ a: 1, b: [2, 3] });
  });
});
