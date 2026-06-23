import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionManager } from '../src/session-manager.js';
import type { Session, Message } from '../src/types.js';

let sessionsDir: string;
let manager: SessionManager;

beforeEach(() => {
  sessionsDir = mkdtempSync(join(tmpdir(), 'nexus-session-test-'));
  manager = new SessionManager(sessionsDir);
});

afterEach(() => {
  rmSync(sessionsDir, { recursive: true, force: true });
});

function makeMessage(role: 'user' | 'assistant' | 'tool' = 'user', content = 'hello'): Message {
  return {
    role,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    content,
    ...(role === 'assistant' ? {
      model: 'test',
      tokens: { input: 10, output: 5 },
      cost: 0.001,
    } : {}),
    ...(role === 'tool' ? {
      toolCallId: 'tc-1',
      toolName: 'read',
      result: { success: true, output: 'data', exitCode: 0 },
      tokens: 5,
      compressed: false,
    } : {}),
  } as Message;
}

describe('SessionManager', () => {
  it('create() returns a session with UUID, timestamp, branch name', () => {
    const session = manager.create('test-session', { projectPath: '/tmp' });
    expect(session.id).toBeTruthy();
    expect(session.id.length).toBeGreaterThan(0);
    expect(session.name).toBe('test-session');
    expect(session.createdAt).toBeGreaterThan(0);
    expect(session.updatedAt).toBeGreaterThan(0);
    expect(session.branch).toMatch(/^nexus\//);
    expect(session.status).toBe('active');
    expect(session.messages).toEqual([]);
    expect(session.cost.sessionTotal).toBe(0);
  });

  it('create() saves session file to disk', () => {
    const session = manager.create('disk-session', { projectPath: '/tmp' });
    const filePath = join(sessionsDir, `${session.id}.json`);
    expect(existsSync(filePath)).toBe(true);
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(raw.name).toBe('disk-session');
  });

  it('create() rejects empty name', () => {
    expect(() => manager.create('', { projectPath: '/tmp' })).toThrow();
    expect(() => manager.create('   ', { projectPath: '/tmp' })).toThrow();
  });

  it('create() accepts initial messages', () => {
    const msgs = [makeMessage('user', 'init msg')];
    const session = manager.create('with-msgs', { projectPath: '/tmp' }, msgs);
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0]!.content).toBe('init msg');
  });

  it('load() retrieves session by ID', () => {
    const created = manager.create('load-test', { projectPath: '/tmp' });
    const loaded = manager.load(created.id);
    expect(loaded.id).toBe(created.id);
    expect(loaded.name).toBe('load-test');
  });

  it('load() throws for non-existent session', () => {
    expect(() => manager.load('nonexistent-id')).toThrow();
  });

  it('save() updates session file', () => {
    const session = manager.create('save-test', { projectPath: '/tmp' });
    session.name = 'updated-name';
    manager.save(session);
    const loaded = manager.load(session.id);
    expect(loaded.name).toBe('updated-name');
  });

  it('list() returns all sessions', () => {
    manager.create('s1', { projectPath: '/tmp' });
    manager.create('s2', { projectPath: '/tmp' });
    manager.create('s3', { projectPath: '/tmp' });
    const sessions = manager.list();
    expect(sessions).toHaveLength(3);
  });

  it('list() sorts by updatedAt descending', async () => {
    const s1 = manager.create('first', { projectPath: '/tmp' });
    await new Promise((r) => setTimeout(r, 5));
    const s2 = manager.create('second', { projectPath: '/tmp' });
    const sessions = manager.list();
    expect(sessions[0]!.id).toBe(s2.id);
    expect(sessions[1]!.id).toBe(s1.id);
  });

  it('delete() removes session file', () => {
    const session = manager.create('delete-me', { projectPath: '/tmp' });
    expect(existsSync(join(sessionsDir, `${session.id}.json`))).toBe(true);
    manager.delete(session.id);
    expect(existsSync(join(sessionsDir, `${session.id}.json`))).toBe(false);
    expect(manager.list()).toHaveLength(0);
  });

  it('delete() is idempotent for already deleted sessions', () => {
    const session = manager.create('del-idempotent', { projectPath: '/tmp' });
    manager.delete(session.id);
    expect(() => manager.delete(session.id)).not.toThrow();
  });

  it('updateStatus() changes status', () => {
    const session = manager.create('status-test', { projectPath: '/tmp' });
    expect(session.status).toBe('active');
    const updated = manager.updateStatus(session.id, 'completed');
    expect(updated.status).toBe('completed');
    const loaded = manager.load(session.id);
    expect(loaded.status).toBe('completed');
  });

  it('addMessage() appends message to session', () => {
    const session = manager.create('msg-test', { projectPath: '/tmp' });
    const msg = makeMessage('user', 'new message');
    const updated = manager.addMessage(session.id, msg);
    expect(updated.messages).toHaveLength(1);
    expect(updated.messages[0]!.content).toBe('new message');
    expect(updated.updatedAt).toBeGreaterThanOrEqual(session.createdAt);
  });

  it('addMessage() updates cost for assistant messages', () => {
    const session = manager.create('cost-msg', { projectPath: '/tmp' });
    const assistantMsg: Message = {
      role: 'assistant',
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      content: 'response',
      model: 'test',
      tokens: { input: 100, output: 50 },
      cost: 0.005,
      compressionSavings: 0.001,
    };
    const updated = manager.addMessage(session.id, assistantMsg);
    expect(updated.cost.tokensUsed).toBe(150);
    expect(updated.cost.sessionTotal).toBe(0.005);
    expect(updated.cost.savingsFromCompression).toBe(0.001);
  });

  it('updateCost() modifies session cost', () => {
    const session = manager.create('cost-update', { projectPath: '/tmp' });
    const updated = manager.updateCost(session.id, { sessionTotal: 42, tokensUsed: 1000 });
    expect(updated.cost.sessionTotal).toBe(42);
    expect(updated.cost.tokensUsed).toBe(1000);
  });

  it('listByStatus() filters by status', () => {
    const active = manager.create('active-s', { projectPath: '/tmp' });
    manager.updateStatus(active.id, 'active');
    const completed = manager.create('done-s', { projectPath: '/tmp' });
    manager.updateStatus(completed.id, 'completed');
    const allActive = manager.listByStatus('active');
    const allCompleted = manager.listByStatus('completed');
    expect(allActive).toHaveLength(1);
    expect(allCompleted).toHaveLength(1);
    expect(allActive[0]!.name).toBe('active-s');
    expect(allCompleted[0]!.name).toBe('done-s');
  });

  it('exists() checks if session exists', () => {
    const session = manager.create('exists-test', { projectPath: '/tmp' });
    expect(manager.exists(session.id)).toBe(true);
    expect(manager.exists('nonexistent')).toBe(false);
  });

  it('getActiveSession() returns the active session', () => {
    manager.create('s1', { projectPath: '/tmp' });
    manager.create('s2', { projectPath: '/tmp' });
    const active = manager.getActiveSession();
    expect(active).toBeTruthy();
    expect(active!.status).toBe('active');
  });

  it('reload() reloads sessions from disk', () => {
    const s1 = manager.create('reload-test', { projectPath: '/tmp' });
    manager.updateStatus(s1.id, 'completed');
    const before = manager.list().length;
    const mgr2 = new SessionManager(sessionsDir);
    expect(mgr2.list()).toHaveLength(before);
    const loaded = mgr2.load(s1.id);
    expect(loaded.status).toBe('completed');
  });

  it('handles loading sessions from disk at construction', () => {
    const s1 = manager.create('construct-test', { projectPath: '/tmp' });
    const mgr2 = new SessionManager(sessionsDir);
    expect(mgr2.exists(s1.id)).toBe(true);
  });
});
