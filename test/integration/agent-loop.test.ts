import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentLoop } from '../../packages/nexus-core/src/agent-loop.js';
import { SessionManager } from '../../packages/nexus-core/src/session-manager.js';
import { ConfigManager } from '../../packages/nexus-core/src/config.js';
import { ApprovalChecker } from '../../packages/nexus-core/src/approval.js';
import { GitManager } from '../../packages/nexus-core/src/git-manager.js';
import type { LLMResponse, ToolCall } from '../../packages/nexus-ai/src/types.js';

function createMockProviderRegistry(sequence?: Array<{
  content: string;
  toolCalls?: ToolCall[];
}>) {
  const defaultSequence = sequence ?? [
    {
      content: 'I will create the file now.',
      toolCalls: [{
        id: 'call-write-1',
        type: 'function' as const,
        function: { name: 'write', arguments: JSON.stringify({ filePath: 'hello.txt', content: 'Hello World' }) },
      }],
    },
    {
      content: 'The file has been created successfully.',
    },
  ];

  let callCount = 0;

  const getNextResponse = (): LLMResponse => {
    const resp = defaultSequence[callCount] ?? defaultSequence[defaultSequence.length - 1]!;
    callCount++;
    return {
      content: resp.content,
      toolCalls: resp.toolCalls,
      usage: { input: 50, output: 20, total: 70 },
      model: 'qwen/qwen3-235b-a22b:free',
      id: `mock-response-${callCount}`,
    };
  };

  const sendMock = vi.fn().mockImplementation(getNextResponse);

  return {
    send: sendMock,
    selectModel: vi.fn().mockReturnValue({ id: 'test-model', provider: 'openrouter', supportsToolUse: true }),
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

function createReadSequenceMock() {
  return createMockProviderRegistry([
    {
      content: 'Let me read the file to verify.',
      toolCalls: [{
        id: 'call-read-1',
        type: 'function' as const,
        function: { name: 'read', arguments: JSON.stringify({ filePath: 'hello.txt' }) },
      }],
    },
    {
      content: 'The file content has been read successfully.',
    },
  ]);
}

function createBashSequenceMock() {
  return createMockProviderRegistry([
    {
      content: 'Running the echo command.',
      toolCalls: [{
        id: 'call-bash-1',
        type: 'function' as const,
        function: { name: 'bash', arguments: JSON.stringify({ command: "echo 'hello from nexus'" }) },
      }],
    },
    {
      content: 'Command executed successfully.',
    },
  ]);
}

function createMultiIterationMock() {
  let callCount = 0;

  const sequence: Array<{ content: string; toolCalls?: ToolCall[] }> = [
    {
      content: 'Creating the file.',
      toolCalls: [{
        id: 'call-1',
        type: 'function' as const,
        function: { name: 'write', arguments: JSON.stringify({ filePath: 'data.txt', content: 'initial content' }) },
      }],
    },
    {
      content: 'Reading to verify.',
      toolCalls: [{
        id: 'call-2',
        type: 'function' as const,
        function: { name: 'read', arguments: JSON.stringify({ filePath: 'data.txt' }) },
      }],
    },
    {
      content: 'Editing the file.',
      toolCalls: [{
        id: 'call-3',
        type: 'function' as const,
        function: { name: 'edit', arguments: JSON.stringify({ filePath: 'data.txt', oldString: 'initial content', newString: 'updated content' }) },
      }],
    },
    {
      content: 'All operations completed successfully.',
    },
  ];

  return {
    send: vi.fn().mockImplementation(() => {
      const resp = sequence[callCount] ?? sequence[sequence.length - 1]!;
      callCount++;
      return Promise.resolve({
        content: resp.content,
        toolCalls: resp.toolCalls,
        usage: { input: 50, output: 20, total: 70 },
        model: 'qwen/qwen3-235b-a22b:free',
        id: `mock-response-${callCount}`,
      } as LLMResponse);
    }),
    selectModel: vi.fn().mockReturnValue({ id: 'test-model', provider: 'openrouter', supportsToolUse: true }),
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

function createApprovalRejectionMock() {
  return createMockProviderRegistry([
    {
      content: 'I will create a file.',
      toolCalls: [{
        id: 'call-reject-1',
        type: 'function' as const,
        function: { name: 'write', arguments: JSON.stringify({ filePath: 'rejected.txt', content: 'should not appear' }) },
      }],
    },
    {
      content: 'Task finished.',
    },
  ]);
}

let baseDir: string;
let sessionsDir: string;
let configPath: string;
let originalCwd: string;

beforeAll(() => {
  originalCwd = process.cwd();
  baseDir = mkdtempSync(join(tmpdir(), 'nexus-int-agent-'));
  sessionsDir = join(baseDir, 'sessions');
  configPath = join(baseDir, 'config.json');
  writeFileSync(configPath, JSON.stringify({ git: { enabled: false, autoCommit: false } }), 'utf-8');
  vi.spyOn(process, 'cwd').mockReturnValue(baseDir);
});

afterAll(() => {
  vi.restoreAllMocks();
  if (baseDir) {
    try { rmSync(baseDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AgentLoop Integration', () => {
  it('creates a file via agent loop', async () => {
    const sessionManager = new SessionManager(sessionsDir);
    const approvalChecker = new ApprovalChecker({ persistenceEnabled: false, defaultLevel: 'auto' });
    const gitManager = new GitManager({ enabled: false });
    const configManager = new ConfigManager(configPath);
    const mockRegistry = createMockProviderRegistry();

    const loop = new AgentLoop(sessionManager, mockRegistry, approvalChecker, gitManager, configManager, {
      maxIterations: 5,
    });

    const result = await loop.runTask('Create hello.txt with Hello World', { projectPath: baseDir });

    expect(result.success).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.session).toBeDefined();
    expect(result.session.status).toBe('completed');

    const filePath = join(baseDir, 'hello.txt');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe('Hello World');

    expect(result.session.messages.length).toBeGreaterThanOrEqual(3);
    const userMsg = result.session.messages.find(m => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg!.content).toContain('Create hello.txt');

    const toolMsg = result.session.messages.find(m => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.role).toBe('tool');

    expect(result.cost).toBeDefined();
    expect(result.cost!.tokensUsed).toBeGreaterThan(0);
    expect(result.cost!.sessionTotal).toBeGreaterThanOrEqual(0);
  });

  it('handles read requests', async () => {
    const testFilePath = join(baseDir, 'hello.txt');
    const testContent = 'Hello World for read test';
    const { writeFileSync } = await import('node:fs');
    writeFileSync(testFilePath, testContent, 'utf-8');

    const sessionManager = new SessionManager(sessionsDir);
    const approvalChecker = new ApprovalChecker({ persistenceEnabled: false, defaultLevel: 'auto' });
    const gitManager = new GitManager({ enabled: false });
    const configManager = new ConfigManager(configPath);
    const mockRegistry = createReadSequenceMock();

    const loop = new AgentLoop(sessionManager, mockRegistry, approvalChecker, gitManager, configManager, {
      maxIterations: 5,
    });

    const result = await loop.runTask('Read hello.txt', { projectPath: baseDir });

    expect(result.success).toBe(true);
    expect(result.status).toBe('completed');

    const toolMessages = result.session.messages.filter(m => m.role === 'tool');
    expect(toolMessages.length).toBeGreaterThanOrEqual(1);

    const readToolMsg = toolMessages.find(m => m.role === 'tool');
    expect(readToolMsg).toBeDefined();
  });

  it('handles bash execution', async () => {
    const sessionManager = new SessionManager(sessionsDir);
    const approvalChecker = new ApprovalChecker({ persistenceEnabled: false, defaultLevel: 'auto' });
    const gitManager = new GitManager({ enabled: false });
    const configManager = new ConfigManager(configPath);
    const mockRegistry = createBashSequenceMock();

    const loop = new AgentLoop(sessionManager, mockRegistry, approvalChecker, gitManager, configManager, {
      maxIterations: 5,
    });

    const result = await loop.runTask('Run echo command', { projectPath: baseDir });

    expect(result.success).toBe(true);
    expect(result.status).toBe('completed');

    const toolMessages = result.session.messages.filter(m => m.role === 'tool');
    expect(toolMessages.length).toBeGreaterThanOrEqual(1);

    const bashToolMsg = toolMessages.find(m => m.role === 'tool');
    expect(bashToolMsg).toBeDefined();
  });

  it('tracks session cost', async () => {
    const sessionManager = new SessionManager(sessionsDir);
    const approvalChecker = new ApprovalChecker({ persistenceEnabled: false, defaultLevel: 'auto' });
    const gitManager = new GitManager({ enabled: false });
    const configManager = new ConfigManager(configPath);
    const mockRegistry = createMockProviderRegistry();

    const loop = new AgentLoop(sessionManager, mockRegistry, approvalChecker, gitManager, configManager, {
      maxIterations: 5,
    });

    const result = await loop.runTask('Cost tracking test', { projectPath: baseDir });

    expect(result.cost).toBeDefined();
    expect(result.cost!.sessionTotal).toBeGreaterThanOrEqual(0);
    expect(result.cost!.tokensUsed).toBeGreaterThan(0);
    expect(typeof result.cost!.sessionTotal).toBe('number');
    expect(typeof result.cost!.tokensUsed).toBe('number');

    const session = result.session;
    expect(session.cost.sessionTotal).toBe(result.cost!.sessionTotal);
    expect(session.cost.tokensUsed).toBe(result.cost!.tokensUsed);
  });

  it('handles approval rejection', async () => {
    const sessionManager = new SessionManager(sessionsDir);
    const approvalChecker = new ApprovalChecker({ persistenceEnabled: false, defaultLevel: 'ask' });
    const gitManager = new GitManager({ enabled: false });
    const configManager = new ConfigManager(configPath);
    const mockRegistry = createApprovalRejectionMock();

    const onApproval = vi.fn().mockResolvedValue(false);

    const loop = new AgentLoop(sessionManager, mockRegistry, approvalChecker, gitManager, configManager, {
      maxIterations: 5,
      approvalLevel: 'ask',
    });

    const result = await loop.runTask('Test rejection', {
      projectPath: baseDir,
      onApproval,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('completed');

    expect(onApproval).toHaveBeenCalled();

    const rejectedFilePath = join(baseDir, 'rejected.txt');
    expect(existsSync(rejectedFilePath)).toBe(false);
  });

  it('handles multiple iterations', async () => {
    const sessionManager = new SessionManager(sessionsDir);
    const approvalChecker = new ApprovalChecker({ persistenceEnabled: false, defaultLevel: 'auto' });
    const gitManager = new GitManager({ enabled: false });
    const configManager = new ConfigManager(configPath);
    const mockRegistry = createMultiIterationMock();

    const loop = new AgentLoop(sessionManager, mockRegistry, approvalChecker, gitManager, configManager, {
      maxIterations: 10,
    });

    const result = await loop.runTask('Write, read, and edit data.txt', { projectPath: baseDir });

    expect(result.success).toBe(true);
    expect(result.status).toBe('completed');

    const filePath = join(baseDir, 'data.txt');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe('updated content');

    const toolMsgs = result.session.messages.filter(m => m.role === 'tool');
    expect(toolMsgs.length).toBeGreaterThanOrEqual(3);

    const assistantMsgs = result.session.messages.filter(m => m.role === 'assistant');
    expect(assistantMsgs.length).toBeGreaterThanOrEqual(3);

    const userMsg = result.session.messages.find(m => m.role === 'user');
    expect(userMsg).toBeDefined();
  });

  it('saves session state', async () => {
    const sessionManager = new SessionManager(sessionsDir);
    const approvalChecker = new ApprovalChecker({ persistenceEnabled: false, defaultLevel: 'auto' });
    const gitManager = new GitManager({ enabled: false });
    const configManager = new ConfigManager(configPath);
    const mockRegistry = createMockProviderRegistry();

    const loop = new AgentLoop(sessionManager, mockRegistry, approvalChecker, gitManager, configManager, {
      maxIterations: 5,
    });

    const result = await loop.runTask('Session persistence test', { projectPath: baseDir });

    expect(result.session.id).toBeTruthy();

    const sessionFilePath = join(sessionsDir, `${result.session.id}.json`);
    expect(existsSync(sessionFilePath)).toBe(true);

    const raw = JSON.parse(readFileSync(sessionFilePath, 'utf-8'));
    expect(raw.id).toBe(result.session.id);
    expect(raw.status).toBe('completed');
    expect(raw.messages.length).toBeGreaterThan(0);
    expect(raw.cost).toBeDefined();
    expect(raw.cost.tokensUsed).toBeGreaterThan(0);

    const reloadedSession = sessionManager.load(result.session.id);
    expect(reloadedSession.id).toBe(result.session.id);
    expect(reloadedSession.messages.length).toBe(result.session.messages.length);

    const sessionsList = sessionManager.list();
    const found = sessionsList.find(s => s.id === result.session.id);
    expect(found).toBeDefined();
  });
});
