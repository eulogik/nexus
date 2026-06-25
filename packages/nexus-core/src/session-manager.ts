import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ErrorCode } from './types.js';
import { NexusError } from './error.js';
import type { Session, SessionMetadata, SessionCost, Message } from './types.js';

function generateId(): string {
  return randomUUID();
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}${m}${d}-${h}${min}`;
}

function sanitizeBranchName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

function createDefaultCost(): SessionCost {
  return {
    sessionTotal: 0,
    dailyTotal: 0,
    monthlyTotal: 0,
    budgetRemaining: 0,
    tokensUsed: 0,
    savingsFromCompression: 0,
    savingsFromFreeModels: 0,
  };
}

function normalizeSession(data: any): Session {
  const cost = data.cost || {};
  return {
    id: data.id || '',
    name: data.name || 'Session',
    branch: data.branch || '',
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : data.created_at ? new Date(data.created_at).getTime() : Date.now(),
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : data.updated_at ? new Date(data.updated_at).getTime() : (typeof data.createdAt === 'number' ? data.createdAt : Date.now()),
    status: data.status || 'completed',
    messages: data.messages || [],
    metadata: data.metadata || { projectPath: '' },
    cost: {
      sessionTotal: typeof cost.sessionTotal === 'number' ? cost.sessionTotal : 0,
      dailyTotal: typeof cost.dailyTotal === 'number' ? cost.dailyTotal : 0,
      monthlyTotal: typeof cost.monthlyTotal === 'number' ? cost.monthlyTotal : 0,
      budgetRemaining: typeof cost.budgetRemaining === 'number' ? cost.budgetRemaining : 0,
      tokensUsed: typeof cost.tokensUsed === 'number' ? cost.tokensUsed : 0,
      savingsFromCompression: typeof cost.savingsFromCompression === 'number' ? cost.savingsFromCompression : 0,
      savingsFromFreeModels: typeof cost.savingsFromFreeModels === 'number' ? cost.savingsFromFreeModels : 0,
    }
  };
}

export class SessionManager {
  private sessionsDir: string;
  private sessions: Map<string, Session> = new Map();

  constructor(sessionsDir?: string) {
    this.sessionsDir = sessionsDir ?? '.nexus/sessions';
    this.ensureDir();
    this.loadAll();
  }

  private ensureDir(): void {
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  private sessionPath(id: string): string {
    return join(this.sessionsDir, `${id}.json`);
  }

  private loadAll(): void {
    try {
      if (!existsSync(this.sessionsDir)) return;
      const files = readdirSync(this.sessionsDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        try {
          const id = file.replace('.json', '');
          const raw = readFileSync(join(this.sessionsDir, file), 'utf-8');
          const session = normalizeSession(JSON.parse(raw));
          this.sessions.set(id, session);
        } catch {
          console.warn(`[SessionManager] Failed to load session file: ${file}`);
        }
      }
    } catch {
      console.warn('[SessionManager] Failed to load sessions directory');
    }
  }

  create(
    name: string,
    config: Partial<SessionMetadata> & { projectPath: string },
    initialMessages?: Message[],
  ): Session {
    if (!name || name.trim().length === 0) {
      throw new NexusError(ErrorCode.SESSION_INVALID_STATE, 'Session name is required');
    }

    const id = generateId();
    const now = Date.now();
    const dateStr = formatDate(new Date(now));
    const safeName = sanitizeBranchName(name);
    const branch = `nexus/${safeName}-${dateStr}`;

    const session: Session = {
      id,
      name: name.trim(),
      branch,
      createdAt: now,
      updatedAt: now,
      status: 'active',
      messages: initialMessages ?? [],
      metadata: {
        projectPath: config.projectPath,
        model: config.model ?? '',
        compressionEnabled: config.compressionEnabled ?? true,
        maxCost: config.maxCost ?? 2.0,
        approvalLevel: config.approvalLevel ?? 'auto',
        gitCommitBefore: config.gitCommitBefore ?? false,
        agentMode: config.agentMode,
        customInstructions: config.customInstructions,
      },
      cost: createDefaultCost(),
    };

    this.sessions.set(id, session);
    this.save(session);
    return session;
  }

  load(id: string): Session {
    const cached = this.sessions.get(id);
    if (cached) return cached;

    try {
      const path = this.sessionPath(id);
      if (!existsSync(path)) {
        throw new NexusError(ErrorCode.SESSION_NOT_FOUND, `Session '${id}' not found`);
      }
      const raw = readFileSync(path, 'utf-8');
      const session = normalizeSession(JSON.parse(raw));
      this.sessions.set(id, session);
      return session;
    } catch (error) {
      if (error instanceof NexusError) throw error;
      throw new NexusError(ErrorCode.SESSION_LOAD_FAILED, `Failed to load session '${id}': ${(error as Error).message}`);
    }
  }

  save(session: Session): void {
    session.updatedAt = Date.now();
    try {
      this.ensureDir();
      writeFileSync(this.sessionPath(session.id), JSON.stringify(session, null, 2), 'utf-8');
      this.sessions.set(session.id, session);
    } catch (error) {
      throw new NexusError(ErrorCode.SESSION_SAVE_FAILED, `Failed to save session '${session.id}': ${(error as Error).message}`);
    }
  }

  list(): Session[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  listByStatus(status: Session['status']): Session[] {
    return this.list().filter((s) => s.status === status);
  }

  delete(id: string): void {
    const path = this.sessionPath(id);
    try {
      if (existsSync(path)) {
        rmSync(path);
      }
      this.sessions.delete(id);
    } catch (error) {
      throw new NexusError(ErrorCode.SESSION_SAVE_FAILED, `Failed to delete session '${id}': ${(error as Error).message}`);
    }
  }

  updateStatus(id: string, status: Session['status']): Session {
    const session = this.load(id);
    session.status = status;
    session.updatedAt = Date.now();
    this.save(session);
    return session;
  }

  addMessage(id: string, message: Message): Session {
    const session = this.load(id);
    session.messages.push(message);
    if (message.role === 'assistant') {
      session.cost.tokensUsed += message.tokens.input + message.tokens.output;
      session.cost.sessionTotal += message.cost;
      if (message.compressionSavings) {
        session.cost.savingsFromCompression += message.compressionSavings;
      }
    }
    session.updatedAt = Date.now();
    this.save(session);
    return session;
  }

  updateCost(id: string, cost: Partial<SessionCost>): Session {
    const session = this.load(id);
    session.cost = { ...session.cost, ...cost };
    session.updatedAt = Date.now();
    this.save(session);
    return session;
  }

  getActiveSession(): Session | undefined {
    return this.list().find((s) => s.status === 'active');
  }

  exists(id: string): boolean {
    return this.sessions.has(id) || existsSync(this.sessionPath(id));
  }

  reload(): void {
    this.sessions.clear();
    this.loadAll();
  }
}
