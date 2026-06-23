import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentLoop } from '../src/agent-loop.js';
import { SessionManager } from '../src/session-manager.js';
import { ApprovalChecker } from '../src/approval.js';
import { GitManager } from '../src/git-manager.js';
import { ConfigManager } from '../src/config.js';
import type { LLMRequest, LLMResponse, RoutingDecision } from 'nexus-ai';

let baseDir: string;
let sessionsDir: string;
let configPath: string;
let originalCwd: string;

function createMockProviderRegistry() {
  return {
    send: vi.fn().mockResolvedValue({
      content: 'Task completed successfully. Here is the result.',
      usage: { input: 50, output: 20, total: 70 },
      model: 'qwen/qwen3-235b-a22b:free',
      id: 'mock-response-id',
    } as LLMResponse),
    selectModel: vi.fn().mockReturnValue({ id: 'test-model', provider: 'openrouter' }),
    getModels: vi.fn().mockReturnValue([]),
    registerProvider: vi.fn(),
    getProvider: vi.fn(),
    setModels: vi.fn(),
    setFallbackOrder: vi.fn(),
    getCostTracker: vi.fn(),
    addModel: vi.fn(),
    stream: vi.fn(),
  };
}

function createFailingProviderRegistry() {
  return {
    send: vi.fn().mockRejectedValue(new Error('Provider unavailable')),
    selectModel: vi.fn().mockReturnValue({ id: 'test-model', provider: 'openrouter' }),
    getModels: vi.fn().mockReturnValue([]),
    registerProvider: vi.fn(),
    getProvider: vi.fn(),
    setModels: vi.fn(),
    setFallbackOrder: vi.fn(),
    getCostTracker: vi.fn(),
    addModel: vi.fn(),
    stream: vi.fn(),
  };
}

beforeAll(() => {
  originalCwd = process.cwd();
  baseDir = mkdtempSync(join(tmpdir(), 'nexus-agent-loop-'));
  sessionsDir = join(baseDir, 'sessions');
  configPath = join(baseDir, 'config.json');
  vi.spyOn(process, 'cwd').mockReturnValue(baseDir);
});

afterAll(() => {
  vi.restoreAllMocks();
  if (baseDir) {
    try {
      rmSync(baseDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AgentLoop', () => {
  it('runTask() with simple task returns a result', async () => {
    const sessionManager = new SessionManager(sessionsDir);
    const approvalChecker = new ApprovalChecker({ persistenceEnabled: false, defaultLevel: 'auto' });
    const gitManager = new GitManager({ enabled: false });
    const configManager = new ConfigManager(configPath);
    const mockRegistry = createMockProviderRegistry();

    const loop = new AgentLoop(sessionManager, mockRegistry, approvalChecker, gitManager, configManager);

    const result = await loop.runTask('Write hello world to a file', { projectPath: baseDir });

    expect(result.success).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.finalMessage).toBe('Task completed successfully. Here is the result.');
    expect(result.session).toBeDefined();
    expect(result.session!.status).toBe('completed');
    expect(result.cost).toBeDefined();
    expect(result.cost!.tokensUsed).toBeGreaterThan(0);
  });

  it('getCurrentSession() returns the session', async () => {
    const sessionManager = new SessionManager(sessionsDir);
    const approvalChecker = new ApprovalChecker({ persistenceEnabled: false, defaultLevel: 'auto' });
    const gitManager = new GitManager({ enabled: false });
    const configManager = new ConfigManager(configPath);
    const mockRegistry = createMockProviderRegistry();

    const loop = new AgentLoop(sessionManager, mockRegistry, approvalChecker, gitManager, configManager);

    expect(loop.getCurrentSession()).toBeNull();

    await loop.runTask('Test session', { projectPath: baseDir });

    const session = loop.getCurrentSession();
    expect(session).not.toBeNull();
    expect(session!.name).toBeTruthy();
    expect(session!.status).toBe('completed');
    expect(session!.id).toBeTruthy();
  });

  it('runTask() creates a session with the correct name', async () => {
    const sessionManager = new SessionManager(sessionsDir);
    const approvalChecker = new ApprovalChecker({ persistenceEnabled: false, defaultLevel: 'auto' });
    const gitManager = new GitManager({ enabled: false });
    const configManager = new ConfigManager(configPath);
    const mockRegistry = createMockProviderRegistry();

    const loop = new AgentLoop(sessionManager, mockRegistry, approvalChecker, gitManager, configManager);

    const customName = 'my-custom-test-session';
    const result = await loop.runTask('Do something', { sessionName: customName, projectPath: baseDir });

    expect(result.session.name).toBe(customName);
  });

  it('runTask() attaches project path to session metadata', async () => {
    const sessionManager = new SessionManager(sessionsDir);
    const approvalChecker = new ApprovalChecker({ persistenceEnabled: false, defaultLevel: 'auto' });
    const gitManager = new GitManager({ enabled: false });
    const configManager = new ConfigManager(configPath);
    const mockRegistry = createMockProviderRegistry();

    const loop = new AgentLoop(sessionManager, mockRegistry, approvalChecker, gitManager, configManager);

    const result = await loop.runTask('Test path', { projectPath: '/custom/project' });

    expect(result.session.metadata.projectPath).toBe('/custom/project');
  });

  it('handles provider errors gracefully', async () => {
    const sessionManager = new SessionManager(sessionsDir);
    const approvalChecker = new ApprovalChecker({ persistenceEnabled: false, defaultLevel: 'auto' });
    const gitManager = new GitManager({ enabled: false });
    const configManager = new ConfigManager(configPath);
    const mockRegistry = createFailingProviderRegistry();

    const loop = new AgentLoop(sessionManager, mockRegistry, approvalChecker, gitManager, configManager);

    const result = await loop.runTask('This will fail', { projectPath: baseDir });

    expect(result.success).toBe(false);
    expect(result.status).toBe('error');
    expect(result.error).toBeTruthy();
    expect(result.session.status).toBe('error');
  });

  it('handles provider errors gracefully with onMessage callback', async () => {
    const sessionManager = new SessionManager(sessionsDir);
    const approvalChecker = new ApprovalChecker({ persistenceEnabled: false, defaultLevel: 'auto' });
    const gitManager = new GitManager({ enabled: false });
    const configManager = new ConfigManager(configPath);
    const mockRegistry = createFailingProviderRegistry();
    const onMessageSpy = vi.fn();

    const loop = new AgentLoop(sessionManager, mockRegistry, approvalChecker, gitManager, configManager);

    const result = await loop.runTask('Fail with callback', {
      projectPath: baseDir,
      onMessage: onMessageSpy,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('respects agentMode config', async () => {
    const sessionManager = new SessionManager(sessionsDir);
    const approvalChecker = new ApprovalChecker({ persistenceEnabled: false, defaultLevel: 'auto' });
    const gitManager = new GitManager({ enabled: false });
    const configManager = new ConfigManager(configPath);
    const mockRegistry = createMockProviderRegistry();

    const loop = new AgentLoop(sessionManager, mockRegistry, approvalChecker, gitManager, configManager, {
      agentMode: 'architect',
    });

    const result = await loop.runTask('Design something', { projectPath: baseDir });

    expect(result.session.metadata.agentMode).toBe('architect');
  });

  it('respects customInstructions config', async () => {
    const sessionManager = new SessionManager(sessionsDir);
    const approvalChecker = new ApprovalChecker({ persistenceEnabled: false, defaultLevel: 'auto' });
    const gitManager = new GitManager({ enabled: false });
    const configManager = new ConfigManager(configPath);
    const mockRegistry = createMockProviderRegistry();

    const loop = new AgentLoop(sessionManager, mockRegistry, approvalChecker, gitManager, configManager, {
      customInstructions: 'Always use TypeScript',
    });

    const result = await loop.runTask('Code something', { projectPath: baseDir });

    expect(result.session.metadata.customInstructions).toBe('Always use TypeScript');
  });

  it('respects maxIterations config', async () => {
    const sessionManager = new SessionManager(sessionsDir);
    const approvalChecker = new ApprovalChecker({ persistenceEnabled: false, defaultLevel: 'auto' });
    const gitManager = new GitManager({ enabled: false });
    const configManager = new ConfigManager(configPath);
    const mockRegistry = createMockProviderRegistry();

    const loop = new AgentLoop(sessionManager, mockRegistry, approvalChecker, gitManager, configManager, {
      maxIterations: 1,
    });

    const result = await loop.runTask('Short task', { projectPath: baseDir });

    expect(result.success).toBe(true);
    expect(result.status).toBe('completed');
  });

  it('setConfig updates configuration', () => {
    const sessionManager = new SessionManager(sessionsDir);
    const approvalChecker = new ApprovalChecker({ persistenceEnabled: false, defaultLevel: 'auto' });
    const gitManager = new GitManager({ enabled: false });
    const configManager = new ConfigManager(configPath);
    const mockRegistry = createMockProviderRegistry();

    const loop = new AgentLoop(sessionManager, mockRegistry, approvalChecker, gitManager, configManager);

    loop.setConfig({ agentMode: 'ask' });
    expect(loop.getCurrentSession()).toBeNull();
  });

  it('setProviderRegistry updates the provider', () => {
    const sessionManager = new SessionManager(sessionsDir);
    const approvalChecker = new ApprovalChecker({ persistenceEnabled: false, defaultLevel: 'auto' });
    const gitManager = new GitManager({ enabled: false });
    const configManager = new ConfigManager(configPath);
    const mockRegistry = createMockProviderRegistry();

    const loop = new AgentLoop(sessionManager, mockRegistry, approvalChecker, gitManager, configManager);
    const newMock = createMockProviderRegistry();
    loop.setProviderRegistry(newMock);
  });

  it('returns proper session cost breakdown', async () => {
    const sessionManager = new SessionManager(sessionsDir);
    const approvalChecker = new ApprovalChecker({ persistenceEnabled: false, defaultLevel: 'auto' });
    const gitManager = new GitManager({ enabled: false });
    const configManager = new ConfigManager(configPath);
    const mockRegistry = createMockProviderRegistry();

    const loop = new AgentLoop(sessionManager, mockRegistry, approvalChecker, gitManager, configManager);

    const result = await loop.runTask('Cost test', { projectPath: baseDir });

    expect(result.cost).toBeDefined();
    expect(typeof result.cost!.sessionTotal).toBe('number');
    expect(typeof result.cost!.tokensUsed).toBe('number');
    expect(result.cost!.tokensUsed).toBeGreaterThan(0);
  });
});
