import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('nexus-core', () => {
  const mockSession = {
    id: 'session-1',
    name: 'test-session',
    metadata: {
      model: 'gpt-4',
      projectPath: '/test',
      compressionEnabled: true,
      approvalLevel: 'auto',
      maxCost: 2.0,
    },
    cost: {
      sessionTotal: 0.5,
      dailyTotal: 1.2,
      monthlyTotal: 5.0,
      budgetRemaining: 4.5,
      tokensUsed: 1000,
      savingsFromCompression: 0.1,
      savingsFromFreeModels: 0.05,
    },
    messages: [],
    created: Date.now(),
    updated: Date.now(),
  };

  const mockSessionManager = {
    create: vi.fn(() => mockSession),
    load: vi.fn(() => mockSession),
    list: vi.fn(() => [mockSession]),
    delete: vi.fn(),
    addMessage: vi.fn(),
  };

  class MockConfigManager {
    private config: Record<string, unknown> = {};
    get(key?: string) {
      if (key) return this.config[key];
      return this.config;
    }
    set(key: string, value: unknown) { this.config[key] = value; }
    write() {}
  }

  class MockAgentLoop {
    setConfig = vi.fn();
    runTask = vi.fn(() => ({ success: true, output: 'done', toolCalls: [] }));
  }

  class MockApprovalChecker {
    constructor(_opts: Record<string, unknown>) {}
  }

  class MockGitManager {
    constructor(_opts: Record<string, unknown>) {}
  }

  function getAllTools(_opts: Record<string, unknown>) {
    return {
      read: vi.fn(() => ({ success: true, output: 'file content', error: null, exitCode: 0 })),
      write: vi.fn(() => ({ success: true, output: 'written', error: null, exitCode: 0 })),
      edit: vi.fn(() => ({ success: true, output: 'edited', error: null, exitCode: 0 })),
      bash: vi.fn(() => ({ success: true, output: 'ok', error: null, exitCode: 0 })),
      glob: vi.fn(() => ({ success: true, output: '[]', error: null, exitCode: 0 })),
      grep: vi.fn(() => ({ success: true, output: '[]', error: null, exitCode: 0 })),
    };
  }

  return {
    ConfigManager: MockConfigManager,
    SessionManager: vi.fn(() => mockSessionManager),
    AgentLoop: MockAgentLoop,
    ApprovalChecker: MockApprovalChecker,
    GitManager: MockGitManager,
    getAllTools,
    mockSessionManager,
    mockSession,
  };
});

vi.mock('nexus-ai', () => {
  class MockProviderRegistry {
    constructor(_config: Record<string, unknown>) {}
    stream = vi.fn();
  }

  class MockCostTracker {
    constructor(_opts: Record<string, unknown>) {}
  }

  return {
    ProviderRegistry: MockProviderRegistry,
    CostTracker: MockCostTracker,
  };
});

vi.mock('nexus-plugin-sdk', () => {
  return {
    PluginLoader: vi.fn(() => ({
      load: vi.fn(),
      unload: vi.fn(),
      listPlugins: vi.fn(() => []),
    })),
  };
});

vi.mock('nexus-compress', () => ({
  Compressor: vi.fn(() => ({
    compress: vi.fn((s: string) => s),
    decompress: vi.fn((s: string) => s),
  })),
}));

vi.mock('nexus-micro', () => ({
  MicroManager: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'mock-uuid'),
}));

import { Nexus } from '../src/nexus.js';
import type { NexusOptions } from '../src/nexus.js';

const mockModules = await vi.importMock<typeof import('nexus-core')>('nexus-core');
const { mockSessionManager, mockSession } = mockModules as unknown as {
  mockSessionManager: {
    create: ReturnType<typeof vi.fn>;
    load: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    addMessage: ReturnType<typeof vi.fn>;
  };
  mockSession: Record<string, unknown>;
};

describe('Nexus', () => {
  let nexus: Nexus;

  beforeEach(() => {
    vi.clearAllMocks();
    nexus = new Nexus({ debug: false });
  });

  afterEach(() => {
    nexus.destroy();
  });

  it('constructor initializes subsystems', () => {
    expect(nexus).toBeInstanceOf(Nexus);
    expect(nexus.eventBus).toBeDefined();
  });

  it('createSession() creates and returns a session', () => {
    const session = nexus.createSession('my-session', { model: 'gpt-4' });
    expect(session).toBeDefined();
    expect(session.id).toBe('session-1');
    expect(session.name).toBe('test-session');
  });

  it('getSession() retrieves session by ID', () => {
    const session = nexus.getSession('session-1');
    expect(session).toBeDefined();
    expect(session.id).toBe('session-1');
  });

  it('listSessions() returns all sessions', () => {
    const sessions = nexus.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('session-1');
  });

  it('deleteSession() removes session', () => {
    nexus.deleteSession('session-1');
    expect(mockSessionManager.delete).toHaveBeenCalledWith('session-1');
  });

  it('updateConfig() modifies configuration', () => {
    nexus.updateConfig('test.key', 'value');
    const config = nexus.getConfig();
    expect(config).toBeDefined();
  });

  it('getConfig() returns config', () => {
    const config = nexus.getConfig();
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
  });

  it('on()/off() event handlers work', () => {
    const handler = vi.fn();
    nexus.on('test-event', handler);
    nexus.eventBus.emit('test-event', 'arg1');
    expect(handler).toHaveBeenCalledWith('arg1');

    nexus.off('test-event', handler);
    nexus.eventBus.emit('test-event', 'arg2');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('getCost() returns cost breakdown', () => {
    const cost = nexus.getCost('session-1');
    expect(cost).toBeDefined();
    expect(cost.sessionTotal).toBe(0.5);
    expect(cost.tokensUsed).toBe(1000);
    expect(cost.budgetRemaining).toBe(4.5);
  });

  it('destroy() cleans up resources', () => {
    const handler = vi.fn();
    nexus.on('evt', handler);
    nexus.destroy();
    nexus.eventBus.emit('evt');
    expect(handler).not.toHaveBeenCalled();
  });

  it('getSession() returns null for missing session', () => {
    mockSessionManager.load.mockReturnValueOnce(null);
    const session = nexus.getSession('nonexistent');
    expect(session).toBeNull();
  });

  it('deleteSession() emits delete event', () => {
    const handler = vi.fn();
    nexus.on('session:deleted', handler);
    nexus.deleteSession('session-1');
    expect(handler).toHaveBeenCalled();
  });
});
