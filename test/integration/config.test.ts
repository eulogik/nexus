import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ConfigManager,
  DEFAULT_CONFIG,
} from '../../packages/nexus-core/src/config.js';
import type { NexusCoreConfig } from '../../packages/nexus-core/src/types.js';

function createTempConfigPath(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'nexus-int-config-'));
  return { dir, path: join(dir, 'config.json') };
}

describe('Config Integration', () => {
  let tempDir: string;
  let tempConfigPath: string;

  beforeEach(() => {
    const result = createTempConfigPath();
    tempDir = result.dir;
    tempConfigPath = result.path;
  });

  afterEach(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
    vi.unstubAllEnvs();
  });

  describe('Loading from disk', () => {
    it('loads config from a real file on disk', () => {
      const customConfig: Partial<NexusCoreConfig> = {
        session: {
          maxIterations: 25,
          maxToolCallsPerIteration: 3,
          defaultApprovalLevel: 'ask',
          autoContinue: true,
          askOnTaskCompletion: false,
        },
        git: {
          enabled: false,
          autoCommit: false,
          autoCommitPrefix: 'custom-nexus',
          defaultBranch: 'develop',
          commitMessageTemplate: 'custom/{session-name}-{date}',
          mergeStrategy: 'squash',
        },
      };

      mkdirSync(tempDir, { recursive: true });
      writeFileSync(tempConfigPath, JSON.stringify(customConfig), 'utf-8');

      const mgr = new ConfigManager(tempConfigPath);

      expect(mgr.get('session.maxIterations')).toBe(25);
      expect(mgr.get('session.maxToolCallsPerIteration')).toBe(3);
      expect(mgr.get('session.defaultApprovalLevel')).toBe('ask');
      expect(mgr.get('session.autoContinue')).toBe(true);
      expect(mgr.get('session.askOnTaskCompletion')).toBe(false);
      expect(mgr.get('git.enabled')).toBe(false);
      expect(mgr.get('git.autoCommit')).toBe(false);
      expect(mgr.get('git.autoCommitPrefix')).toBe('custom-nexus');
      expect(mgr.get('git.defaultBranch')).toBe('develop');
      expect(mgr.get('git.commitMessageTemplate')).toBe('custom/{session-name}-{date}');
    });

    it('falls back to defaults when config file does not exist', () => {
      const mgr = new ConfigManager(join(tempDir, 'nonexistent', 'config.json'));
      expect(mgr.get('session.maxIterations')).toBe(50);
      expect(mgr.get('session.defaultApprovalLevel')).toBe('auto');
      expect(mgr.get('git.enabled')).toBe(true);
      expect(mgr.get('cost.budget')).toBe(10.0);
    });

    it('falls back to defaults when config file is corrupted', () => {
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(tempConfigPath, '{invalid json content!!!}', 'utf-8');
      const mgr = new ConfigManager(tempConfigPath);
      expect(mgr.get('session.maxIterations')).toBe(50);
      expect(mgr.get('tools.blockedCommands')).toContain('sudo');
    });

    it('loads partial config and merges with defaults', () => {
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(tempConfigPath, JSON.stringify({
        session: { maxIterations: 10 },
        cost: { budget: 50.0 },
      }), 'utf-8');

      const mgr = new ConfigManager(tempConfigPath);

      expect(mgr.get('session.maxIterations')).toBe(10);
      expect(mgr.get('session.defaultApprovalLevel')).toBe('auto');
      expect(mgr.get('cost.budget')).toBe(50.0);
      expect(mgr.get('cost.dailyLimit')).toBe(5.0);
      expect(mgr.get('git.enabled')).toBe(true);
      expect(mgr.get('tools.blockedPaths')).toContain('/etc');
    });

    it('nested config sections merge correctly', () => {
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(tempConfigPath, JSON.stringify({
        tools: {
          blockedCommands: ['rm', 'dd'],
          readMaxSize: 999999,
        },
      }), 'utf-8');

      const mgr = new ConfigManager(tempConfigPath);

      expect(mgr.get('tools.blockedCommands')).toEqual(['rm', 'dd']);
      expect(mgr.get('tools.readMaxSize')).toBe(999999);
      expect(mgr.get('tools.writeMaxSize')).toBe(DEFAULT_CONFIG.tools.writeMaxSize);
      expect(mgr.get('tools.allowedPaths')).toEqual([]);
    });
  });

  describe('Config merging with defaults', () => {
    it('get() returns complete config object with all sections', () => {
      const mgr = new ConfigManager(tempConfigPath);
      const full = mgr.get() as NexusCoreConfig;

      expect(full.session).toBeDefined();
      expect(full.git).toBeDefined();
      expect(full.tools).toBeDefined();
      expect(full.compression).toBeDefined();
      expect(full.micro).toBeDefined();
      expect(full.cost).toBeDefined();
      expect(full.approval).toBeDefined();
      expect(full.plugins).toBeDefined();
    });

    it('get() with dot-path returns nested values', () => {
      const mgr = new ConfigManager(tempConfigPath);
      expect(mgr.get('session.maxIterations')).toBe(50);
      expect(mgr.get('session.defaultApprovalLevel')).toBe('auto');
      expect(mgr.get('git.enabled')).toBe(true);
      expect(mgr.get('git.defaultBranch')).toBe('main');
      expect(mgr.get('tools.blockedCommands')).toContain('sudo');
      expect(mgr.get('compression.enabled')).toBe(true);
      expect(mgr.get('compression.strategy')).toBe('truncate');
      expect(mgr.get('micro.enabled')).toBe(true);
      expect(mgr.get('micro.preferredModel')).toBe('qwen/qwen3-235b-a22b:free');
      expect(mgr.get('cost.budget')).toBe(10.0);
      expect(mgr.get('cost.maxSessionCost')).toBe(2.0);
      expect(mgr.get('approval.enabled')).toBe(true);
      expect(mgr.get('plugins.enabled')).toBe(true);
    });

    it('set() updates values and persists through write()', () => {
      const mgr = new ConfigManager(tempConfigPath);
      mgr.set('session.maxIterations', 42);
      mgr.set('cost.budget', 100);
      mgr.set('compression.enabled', false);
      mgr.write();

      const mgr2 = new ConfigManager(tempConfigPath);
      expect(mgr2.get('session.maxIterations')).toBe(42);
      expect(mgr2.get('cost.budget')).toBe(100);
      expect(mgr2.get('compression.enabled')).toBe(false);
    });

    it('reset() restores all values to defaults', () => {
      const mgr = new ConfigManager(tempConfigPath);
      mgr.set('session.maxIterations', 999);
      mgr.set('cost.budget', 9999);
      mgr.set('git.enabled', false);

      mgr.reset();

      expect(mgr.get('session.maxIterations')).toBe(50);
      expect(mgr.get('cost.budget')).toBe(10.0);
      expect(mgr.get('git.enabled')).toBe(true);
    });

    it('write() with provided config object replaces entire config', () => {
      const mgr = new ConfigManager(tempConfigPath);
      const newConfig = structuredClone(DEFAULT_CONFIG);
      newConfig.session.maxIterations = 77;
      newConfig.git.enabled = false;
      newConfig.cost.budget = 200;

      mgr.write(newConfig);
      expect(mgr.get('session.maxIterations')).toBe(77);
      expect(mgr.get('git.enabled')).toBe(false);
      expect(mgr.get('cost.budget')).toBe(200);
    });

    it('get() returns undefined for invalid dot paths', () => {
      const mgr = new ConfigManager(tempConfigPath);
      expect(mgr.get('session.nonexistent')).toBeUndefined();
      expect(mgr.get('completely.invalid.path')).toBeUndefined();
    });
  });

  describe('Environment variable overrides', () => {
    it('NEXUS_MAX_ITERATIONS overrides session.maxIterations', () => {
      vi.stubEnv('NEXUS_MAX_ITERATIONS', '42');
      const mgr = new ConfigManager(tempConfigPath);
      mgr.reset();
      expect(mgr.get('session.maxIterations')).toBe(42);
    });

    it('NEXUS_APPROVAL_LEVEL overrides session.defaultApprovalLevel', () => {
      vi.stubEnv('NEXUS_APPROVAL_LEVEL', 'ask');
      const mgr = new ConfigManager(tempConfigPath);
      mgr.reset();
      expect(mgr.get('session.defaultApprovalLevel')).toBe('ask');
    });

    it('NEXUS_GIT_ENABLED=false disables git', () => {
      vi.stubEnv('NEXUS_GIT_ENABLED', 'false');
      const mgr = new ConfigManager(tempConfigPath);
      mgr.reset();
      expect(mgr.get('git.enabled')).toBe(false);
    });

    it('NEXUS_AUTO_COMMIT=false disables auto-commit', () => {
      vi.stubEnv('NEXUS_AUTO_COMMIT', 'false');
      const mgr = new ConfigManager(tempConfigPath);
      mgr.reset();
      expect(mgr.get('git.autoCommit')).toBe(false);
    });

    it('NEXUS_DEFAULT_BRANCH overrides git.defaultBranch', () => {
      vi.stubEnv('NEXUS_DEFAULT_BRANCH', 'develop');
      const mgr = new ConfigManager(tempConfigPath);
      mgr.reset();
      expect(mgr.get('git.defaultBranch')).toBe('develop');
    });

    it('NEXUS_BASH_TIMEOUT overrides tools.bashTimeoutDefault', () => {
      vi.stubEnv('NEXUS_BASH_TIMEOUT', '15000');
      const mgr = new ConfigManager(tempConfigPath);
      mgr.reset();
      expect(mgr.get('tools.bashTimeoutDefault')).toBe(15000);
    });

    it('NEXUS_BUDGET overrides cost.budget', () => {
      vi.stubEnv('NEXUS_BUDGET', '100');
      const mgr = new ConfigManager(tempConfigPath);
      mgr.reset();
      expect(mgr.get('cost.budget')).toBe(100);
    });

    it('NEXUS_DAILY_LIMIT overrides cost.dailyLimit', () => {
      vi.stubEnv('NEXUS_DAILY_LIMIT', '2.5');
      const mgr = new ConfigManager(tempConfigPath);
      mgr.reset();
      expect(mgr.get('cost.dailyLimit')).toBe(2.5);
    });

    it('NEXUS_MONTHLY_LIMIT overrides cost.monthlyLimit', () => {
      vi.stubEnv('NEXUS_MONTHLY_LIMIT', '25');
      const mgr = new ConfigManager(tempConfigPath);
      mgr.reset();
      expect(mgr.get('cost.monthlyLimit')).toBe(25);
    });

    it('NEXUS_COMPRESSION_ENABLED=false disables compression', () => {
      vi.stubEnv('NEXUS_COMPRESSION_ENABLED', 'false');
      const mgr = new ConfigManager(tempConfigPath);
      mgr.reset();
      expect(mgr.get('compression.enabled')).toBe(false);
    });

    it('NEXUS_MICRO_ENABLED=false disables micro routing', () => {
      vi.stubEnv('NEXUS_MICRO_ENABLED', 'false');
      const mgr = new ConfigManager(tempConfigPath);
      mgr.reset();
      expect(mgr.get('micro.enabled')).toBe(false);
    });

    it('NEXUS_BLOCKED_COMMANDS overrides tools.blockedCommands', () => {
      vi.stubEnv('NEXUS_BLOCKED_COMMANDS', 'rm,dd,chmod,shutdown');
      const mgr = new ConfigManager(tempConfigPath);
      mgr.reset();
      expect(mgr.get('tools.blockedCommands')).toEqual(['rm', 'dd', 'chmod', 'shutdown']);
    });

    it('NEXUS_ALLOWED_PATHS overrides tools.allowedPaths', () => {
      vi.stubEnv('NEXUS_ALLOWED_PATHS', '/home/user/projects,/tmp/work');
      const mgr = new ConfigManager(tempConfigPath);
      mgr.reset();
      expect(mgr.get('tools.allowedPaths')).toEqual(['/home/user/projects', '/tmp/work']);
    });

    it('multiple env vars override simultaneously', () => {
      vi.stubEnv('NEXUS_MAX_ITERATIONS', '15');
      vi.stubEnv('NEXUS_BUDGET', '200');
      vi.stubEnv('NEXUS_GIT_ENABLED', 'false');
      vi.stubEnv('NEXUS_APPROVAL_LEVEL', 'ask');

      const mgr = new ConfigManager(tempConfigPath);
      mgr.reset();

      expect(mgr.get('session.maxIterations')).toBe(15);
      expect(mgr.get('cost.budget')).toBe(200);
      expect(mgr.get('git.enabled')).toBe(false);
      expect(mgr.get('session.defaultApprovalLevel')).toBe('ask');
    });

    it('env var overrides take precedence over file config', () => {
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(tempConfigPath, JSON.stringify({
        session: { maxIterations: 5 },
        cost: { budget: 10 },
      }), 'utf-8');

      vi.stubEnv('NEXUS_MAX_ITERATIONS', '99');
      vi.stubEnv('NEXUS_BUDGET', '500');

      const mgr = new ConfigManager(tempConfigPath);
      mgr.reset();

      expect(mgr.get('session.maxIterations')).toBe(99);
      expect(mgr.get('cost.budget')).toBe(500);
      expect(mgr.get('session.defaultApprovalLevel')).toBe('auto');
    });
  });

  describe('ConfigManager static methods', () => {
    it('getDefaultConfig returns a complete config', () => {
      const cfg = ConfigManager.getDefaultConfig();
      expect(cfg.session.maxIterations).toBe(50);
      expect(cfg.git.enabled).toBe(true);
      expect(cfg.compression.strategy).toBe('truncate');
      expect(cfg.micro.routeThreshold).toBe('auto');
    });

    it('getDefaultConfig returns deep copies (immutable)', () => {
      const cfg1 = ConfigManager.getDefaultConfig();
      const cfg2 = ConfigManager.getDefaultConfig();
      cfg1.session.maxIterations = 999;
      expect(cfg2.session.maxIterations).toBe(50);
    });
  });
});
