import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GitManager } from '../src/git-manager.js';
import type { Session } from '../src/types.js';

let repoDir: string;
let gitManager: GitManager;

function git(...args: string[]): string {
  const escaped = args.map((a) => (a.includes(' ') ? `'${a}'` : a)).join(' ');
  return execSync(`git ${escaped}`, {
    cwd: repoDir,
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim();
}

function initRepo(): void {
  repoDir = mkdtempSync(join(tmpdir(), 'nexus-git-test-'));
  git('init');
  git('config', 'user.email', 'test@test.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(repoDir, 'README.md'), '# Test', 'utf-8');
  git('add', '-A');
  git('commit', '-m', 'initial commit');
}

beforeAll(() => {
  initRepo();
  gitManager = new GitManager({ cwd: repoDir, enabled: true });
});

afterAll(() => {
  if (repoDir) {
    rmSync(repoDir, { recursive: true, force: true });
  }
});

function makeSession(name = 'test-session'): Session {
  return {
    id: 'test-id-123',
    name,
    branch: `nexus/${name}-20250623-1200`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'active',
    messages: [],
    metadata: {
      projectPath: repoDir,
      model: 'test',
      compressionEnabled: false,
      maxCost: 2.0,
      approvalLevel: 'auto',
      gitCommitBefore: false,
    },
    cost: {
      sessionTotal: 0,
      dailyTotal: 0,
      monthlyTotal: 0,
      budgetRemaining: 10,
      tokensUsed: 0,
      savingsFromCompression: 0,
      savingsFromFreeModels: 0,
    },
  };
}

describe('GitManager', () => {
  it('isAvailable() returns true when git is installed and in a repo', () => {
    expect(gitManager.isAvailable()).toBe(true);
  });

  it('isAvailable() returns false when git is disabled', () => {
    const disabled = new GitManager({ cwd: repoDir, enabled: false });
    expect(disabled.isAvailable()).toBe(false);
  });

  it('getDefaultBranch() returns branch name', () => {
    const branch = gitManager.getDefaultBranch();
    expect(branch).toBeTruthy();
    expect(typeof branch).toBe('string');
  });

  it('createSessionBranch() creates a branch', () => {
    const branchName = gitManager.createSessionBranch('test-feature');
    expect(branchName).toMatch(/^nexus\/test-feature-/);
    const branches = git('branch', '--list');
    expect(branches).toContain(branchName);
  });

  it('getCurrentBranch() returns branch name', () => {
    const branch = gitManager.getCurrentBranch();
    expect(branch).toBeTruthy();
    expect(typeof branch).toBe('string');
  });

  it('hasUncommittedChanges() detects clean state', () => {
    gitManager.getCurrentBranch();
    expect(gitManager.hasUncommittedChanges()).toBe(false);
  });

  it('hasUncommittedChanges() detects dirty state', () => {
    writeFileSync(join(repoDir, 'dirty.txt'), 'dirty content', 'utf-8');
    expect(gitManager.hasUncommittedChanges()).toBe(true);
    try { rmSync(join(repoDir, 'dirty.txt')); } catch { /* ignore */ }
  });

  it('commitSession() creates a commit', () => {
    writeFileSync(join(repoDir, 'commit-test.txt'), 'to commit', 'utf-8');
    const session = makeSession('commit-test');
    const hash = gitManager.commitSession(session);
    expect(hash).not.toBe('(nothing to commit)');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('commitSession() returns nothing-to-commit when clean', () => {
    const session = makeSession('nothing-to-commit');
    const result = gitManager.commitSession(session);
    expect(result).toBe('(nothing to commit)');
  });

  it('stash() stashes tracked changes', async () => {
    writeFileSync(join(repoDir, 'stash-tracked.txt'), 'stash me', 'utf-8');
    git('add', 'stash-tracked.txt');
    const stashList = gitManager.stash('test stash');
    expect(stashList).toBeTruthy();
    expect(existsSync(join(repoDir, 'stash-tracked.txt'))).toBe(false);
  });

  it('stashPop() restores from stash', async () => {
    writeFileSync(join(repoDir, 'stash-pop.txt'), 'pop me', 'utf-8');
    git('add', 'stash-pop.txt');
    gitManager.stash('pop test');
    gitManager.stashPop();
    expect(existsSync(join(repoDir, 'stash-pop.txt'))).toBe(true);
  });

  it('reset() performs soft reset', () => {
    writeFileSync(join(repoDir, 'reset-test.txt'), 'reset me', 'utf-8');
    git('add', 'reset-test.txt');
    gitManager.reset('mixed');
    const status = git('status', '--porcelain');
    expect(status).toContain('reset-test.txt');
  });

  it('push() throws when no remote is configured', () => {
    expect(() => gitManager.push('main')).toThrow();
  });

  it('deleteBranch() removes a branch', () => {
    const branch = gitManager.createSessionBranch('to-delete');
    const currentBranch = gitManager.getCurrentBranch();
    git('checkout', 'main');
    gitManager.deleteBranch(branch);
    const branches = git('branch', '--list');
    expect(branches).not.toContain(branch);
  });

  it('getLog() returns commit history', () => {
    const log = gitManager.getLog(5);
    expect(log).toBeTruthy();
    expect(log.length).toBeGreaterThan(0);
  });

  it('abortMerge() does not throw when not merging', () => {
    expect(() => gitManager.abortMerge()).not.toThrow();
  });

  it('getConflictedFiles() returns empty when no conflict', () => {
    const conflicts = gitManager.getConflictedFiles();
    expect(conflicts).toEqual([]);
  });
});
