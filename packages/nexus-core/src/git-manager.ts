import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ErrorCode } from './types.js';
import { NexusError } from './error.js';
import type { Session, MergeResult } from './types.js';

function runGit(args: string[], cwd?: string, timeout = 30_000): string {
  try {
    const cmd = `git ${args.join(' ')}`;
    return execSync(cmd, {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf-8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (error: unknown) {
    const err = error as Error & { stderr?: string; status?: number };
    const stderr = err.stderr?.trim() ?? err.message;
    throw new NexusError(ErrorCode.GIT_COMMIT_FAILED, `Git command failed: ${stderr}`, {
      command: args.join(' '),
      exitCode: err.status,
    });
  }
}

function isGitInstalled(): boolean {
  try {
    execSync('git --version', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function isGitRepo(cwd?: string): boolean {
  try {
    runGit(['rev-parse', '--git-dir'], cwd, 5_000);
    return true;
  } catch {
    return false;
  }
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}${m}${d}-${h}${min}`;
}

export class GitManager {
  private cwd: string;
  private defaultBranch: string;
  private autoCommitPrefix: string;
  private commitTemplate: string;
  private mergeStrategy: 'merge' | 'squash' | 'rebase';
  private enabled: boolean;

  constructor(options?: {
    cwd?: string;
    defaultBranch?: string;
    autoCommitPrefix?: string;
    commitTemplate?: string;
    mergeStrategy?: 'merge' | 'squash' | 'rebase';
    enabled?: boolean;
  }) {
    this.cwd = options?.cwd ?? process.cwd();
    this.defaultBranch = options?.defaultBranch ?? 'main';
    this.autoCommitPrefix = options?.autoCommitPrefix ?? 'nexus';
    this.commitTemplate = options?.commitTemplate ?? 'nexus/{session-name}-{date}';
    this.mergeStrategy = options?.mergeStrategy ?? 'squash';
    this.enabled = options?.enabled ?? true;
  }

  isAvailable(): boolean {
    return this.enabled && isGitInstalled() && isGitRepo(this.cwd);
  }

  getDefaultBranch(): string {
    try {
      if (isGitRepo(this.cwd)) {
        const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], this.cwd);
        if (branch && branch !== 'HEAD') {
          return branch;
        }
      }
    } catch {
      // fall through
    }
    return this.defaultBranch;
  }

  createSessionBranch(name: string): string {
    if (!this.enabled) {
      throw new NexusError(ErrorCode.GIT_NOT_FOUND, 'Git is disabled in configuration');
    }
    if (!isGitInstalled()) {
      throw new NexusError(ErrorCode.GIT_NOT_FOUND, 'Git is not installed');
    }
    if (!isGitRepo(this.cwd)) {
      throw new NexusError(ErrorCode.GIT_NOT_A_REPO, 'Not a git repository');
    }

    const dateStr = formatDate(new Date());
    const safeName = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);

    const branchName = `nexus/${safeName}-${dateStr}`;

    try {
      const defaultBranch = this.getDefaultBranch();
      runGit(['checkout', defaultBranch], this.cwd);
      runGit(['pull', '--ff-only', 'origin', defaultBranch], this.cwd, 15_000);
    } catch {
      // If pull fails, continue anyway
    }

    try {
      runGit(['checkout', '-b', branchName], this.cwd);
    } catch (error) {
      throw new NexusError(ErrorCode.GIT_BRANCH_FAILED, `Failed to create branch '${branchName}'`, {
        branchName,
        error: (error as Error).message,
      });
    }

    return branchName;
  }

  commitSession(session: Session, message?: string): string {
    if (!this.isAvailable()) {
      throw new NexusError(ErrorCode.GIT_NOT_FOUND, 'Git is not available');
    }

    const commitMsg = message ?? this.buildCommitMessage(session);

    try {
      runGit(['add', '-A'], this.cwd);
      const status = runGit(['status', '--porcelain'], this.cwd);
      if (!status) {
        return '(nothing to commit)';
      }
      runGit(['commit', '-m', commitMsg], this.cwd);
      return runGit(['rev-parse', 'HEAD'], this.cwd);
    } catch (error) {
      throw new NexusError(ErrorCode.GIT_COMMIT_FAILED, `Failed to commit session: ${(error as Error).message}`, {
        sessionName: session.name,
      });
    }
  }

  private buildCommitMessage(session: Session): string {
    const dateStr = formatDate(new Date(session.updatedAt));
    const safeName = session.name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50);

    return this.commitTemplate
      .replace('{session-name}', safeName)
      .replace('{name}', safeName)
      .replace('{date}', dateStr)
      .replace('{id}', session.id.slice(0, 8));
  }

  merge(branch: string, strategy?: 'merge' | 'squash' | 'rebase'): MergeResult {
    if (!this.isAvailable()) {
      throw new NexusError(ErrorCode.GIT_NOT_FOUND, 'Git is not available');
    }

    const mergeStrategy = strategy ?? this.mergeStrategy;
    const targetBranch = this.getDefaultBranch();

    try {
      runGit(['checkout', targetBranch], this.cwd);

      switch (mergeStrategy) {
        case 'squash': {
          runGit(['merge', '--squash', branch], this.cwd);
          runGit(['commit', '-m', `feat: merge session '${branch}'`], this.cwd);
          break;
        }
        case 'rebase': {
          runGit(['rebase', branch], this.cwd);
          break;
        }
        case 'merge':
        default: {
          runGit(['merge', '--no-ff', branch, '-m', `feat: merge session '${branch}'`], this.cwd);
          break;
        }
      }

      return { success: true, conflicts: [] };
    } catch (error: unknown) {
      const err = error as Error;
      const conflicts = this.getConflictedFiles();
      return { success: false, conflicts };
    }
  }

  abortMerge(): void {
    if (!this.isAvailable()) return;
    try {
      runGit(['merge', '--abort'], this.cwd);
    } catch {
      // ignore
    }
  }

  getConflictedFiles(): string[] {
    if (!this.isAvailable()) return [];
    try {
      const output = runGit(['diff', '--name-only', '--diff-filter=U'], this.cwd);
      return output ? output.split('\n').filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  hasUncommittedChanges(): boolean {
    if (!this.isAvailable()) return false;
    try {
      const status = runGit(['status', '--porcelain'], this.cwd);
      return status.length > 0;
    } catch {
      return false;
    }
  }

  hasStagedChanges(): boolean {
    if (!this.isAvailable()) return false;
    try {
      const status = runGit(['diff', '--cached', '--name-only'], this.cwd);
      return status.length > 0;
    } catch {
      return false;
    }
  }

  stash(message?: string): string {
    if (!this.isAvailable()) {
      throw new NexusError(ErrorCode.GIT_NOT_FOUND, 'Git is not available');
    }
    try {
      const msg = message ? `save "${message}"` : 'save';
      runGit(['stash', msg], this.cwd);
      return runGit(['stash', 'list'], this.cwd);
    } catch (error) {
      throw new NexusError(ErrorCode.GIT_STASH_FAILED, `Failed to stash: ${(error as Error).message}`);
    }
  }

  stashPop(): void {
    if (!this.isAvailable()) return;
    try {
      runGit(['stash', 'pop'], this.cwd);
    } catch {
      // ignore
    }
  }

  reset(mode: 'soft' | 'mixed' | 'hard' = 'mixed', ref = 'HEAD'): void {
    if (!this.isAvailable()) {
      throw new NexusError(ErrorCode.GIT_NOT_FOUND, 'Git is not available');
    }
    try {
      runGit(['reset', `--${mode}`, ref], this.cwd);
    } catch (error) {
      throw new NexusError(ErrorCode.GIT_COMMIT_FAILED, `Failed to reset: ${(error as Error).message}`);
    }
  }

  getCurrentBranch(): string {
    if (!this.isAvailable()) return 'unknown';
    try {
      return runGit(['rev-parse', '--abbrev-ref', 'HEAD'], this.cwd);
    } catch {
      return 'unknown';
    }
  }

  push(branch?: string): void {
    if (!this.isAvailable()) {
      throw new NexusError(ErrorCode.GIT_NOT_FOUND, 'Git is not available');
    }
    const targetBranch = branch ?? this.getCurrentBranch();
    try {
      runGit(['push', '-u', 'origin', targetBranch], this.cwd, 60_000);
    } catch (error) {
      throw new NexusError(ErrorCode.GIT_COMMIT_FAILED, `Failed to push: ${(error as Error).message}`);
    }
  }

  deleteBranch(branch: string): void {
    if (!this.isAvailable()) return;
    try {
      runGit(['branch', '-D', branch], this.cwd);
    } catch {
      // ignore
    }
  }

  getLog(limit = 10): string {
    if (!this.isAvailable()) return '';
    try {
      return runGit(['log', `--max-count=${limit}`, '--oneline', '--graph'], this.cwd);
    } catch {
      return '';
    }
  }
}
