import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigManager, getConfigManager, DEFAULT_CONFIG, DEFAULT_CONFIG_DIR, DEFAULT_CONFIG_PATH } from '../src/config.js';

function createTempConfigPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'nexus-config-test-'));
  return join(dir, 'config.json');
}

describe('ConfigManager', () => {
  let tempConfigPath: string;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'nexus-config-test-'));
    tempConfigPath = join(tempDir, 'config.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('DEFAULT_CONFIG has all required fields', () => {
    const cfg = DEFAULT_CONFIG;
    expect(cfg.session).toBeDefined();
    expect(cfg.session.maxIterations).toBe(50);
    expect(cfg.session.defaultApprovalLevel).toBe('auto');
    expect(cfg.git).toBeDefined();
    expect(cfg.git.enabled).toBe(true);
    expect(cfg.git.defaultBranch).toBe('main');
    expect(cfg.tools).toBeDefined();
    expect(cfg.tools.blockedCommands).toContain('sudo');
    expect(cfg.compression).toBeDefined();
    expect(cfg.compression.enabled).toBe(true);
    expect(cfg.cost).toBeDefined();
    expect(cfg.cost.budget).toBe(10.0);
    expect(cfg.approval).toBeDefined();
    expect(cfg.approval.enabled).toBe(true);
    expect(cfg.plugins).toBeDefined();
    expect(cfg.plugins.enabled).toBe(true);
  });

  it('get() retrieves full config', () => {
    const mgr = new ConfigManager(tempConfigPath);
    const full = mgr.get();
    expect(full).toHaveProperty('session');
    expect(full).toHaveProperty('git');
    expect(full).toHaveProperty('tools');
  });

  it('get() retrieves values by dot path', () => {
    const mgr = new ConfigManager(tempConfigPath);
    expect(mgr.get('session.maxIterations')).toBe(50);
    expect(mgr.get('git.defaultBranch')).toBe('main');
    expect(mgr.get('cost.budget')).toBe(10.0);
    expect(mgr.get('tools.blockedCommands')).toContain('sudo');
  });

  it('get() returns undefined for invalid dot path', () => {
    const mgr = new ConfigManager(tempConfigPath);
    expect(mgr.get('session.nonexistent')).toBeUndefined();
    expect(mgr.get('completely.invalid.path')).toBeUndefined();
  });

  it('get() returns undefined for null intermediate path', () => {
    const mgr = new ConfigManager(tempConfigPath);
    expect(mgr.get('session.maxIterations.nested')).toBeUndefined();
  });

  it('set() modifies values', () => {
    const mgr = new ConfigManager(tempConfigPath);
    mgr.set('session.maxIterations', 100);
    expect(mgr.get('session.maxIterations')).toBe(100);
  });

  it('set() writes through dot paths', () => {
    const mgr = new ConfigManager(tempConfigPath);
    mgr.set('cost.budget', 50.0);
    expect(mgr.get('cost.budget')).toBe(50.0);
  });

  it('set() creates intermediate objects', () => {
    const mgr = new ConfigManager(tempConfigPath);
    mgr.set('newSection.nested.value', 'test');
    expect(mgr.get('newSection.nested.value')).toBe('test');
  });

  it('write() saves to disk and can be reloaded', () => {
    const mgr = new ConfigManager(tempConfigPath);
    mgr.set('session.maxIterations', 99);
    mgr.write();

    const mgr2 = new ConfigManager(tempConfigPath);
    expect(mgr2.get('session.maxIterations')).toBe(99);
  });

  it('write() accepts a config object', () => {
    const mgr = new ConfigManager(tempConfigPath);
    const newConfig = { ...DEFAULT_CONFIG, session: { ...DEFAULT_CONFIG.session, maxIterations: 77 } };
    mgr.write(newConfig);
    expect(mgr.get('session.maxIterations')).toBe(77);

    const mgr2 = new ConfigManager(tempConfigPath);
    expect(mgr2.get('session.maxIterations')).toBe(77);
  });

  it('reset() restores defaults', () => {
    const mgr = new ConfigManager(tempConfigPath);
    mgr.set('session.maxIterations', 999);
    expect(mgr.get('session.maxIterations')).toBe(999);
    mgr.reset();
    expect(mgr.get('session.maxIterations')).toBe(50);
  });

  it('getDefaultConfig returns complete config object', () => {
    const defaultCfg = ConfigManager.getDefaultConfig();
    expect(defaultCfg).toEqual(DEFAULT_CONFIG);
    expect(defaultCfg.session.maxIterations).toBe(50);
  });

  it('getDefaultConfig returns a deep copy', () => {
    const cfg1 = ConfigManager.getDefaultConfig();
    const cfg2 = ConfigManager.getDefaultConfig();
    cfg1.session.maxIterations = 100;
    expect(cfg2.session.maxIterations).toBe(50);
  });

  it('loads existing config from disk', () => {
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(tempConfigPath, JSON.stringify({ session: { maxIterations: 25 } }), 'utf-8');
    const mgr = new ConfigManager(tempConfigPath);
    expect(mgr.get('session.maxIterations')).toBe(25);
    expect(mgr.get('session.autoContinue')).toBe(false);
  });

  it('handles corrupt config gracefully', () => {
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(tempConfigPath, '{invalid json}', 'utf-8');
    const mgr = new ConfigManager(tempConfigPath);
    expect(mgr.get('session.maxIterations')).toBe(50);
  });

  describe('getConfigManager singleton', () => {
    afterEach(() => {
      const registry = new Map<string, ConfigManager>();
    });

    it('returns a singleton instance', () => {
      const a = getConfigManager(tempConfigPath);
      const b = getConfigManager(tempConfigPath);
      expect(a).toBe(b);
    });
  });
});

describe('Environment variable overrides', () => {
  let tempConfigPath: string;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'nexus-config-env-'));
    tempConfigPath = join(tempDir, 'config.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('NEXUS_MAX_ITERATIONS overrides session.maxIterations', () => {
    vi.stubEnv('NEXUS_MAX_ITERATIONS', '42');
    const mgr = new ConfigManager(tempConfigPath);
    mgr.reset();
    expect(mgr.get('session.maxIterations')).toBe(42);
    vi.unstubAllEnvs();
  });

  it('NEXUS_APPROVAL_LEVEL overrides session.defaultApprovalLevel', () => {
    vi.stubEnv('NEXUS_APPROVAL_LEVEL', 'ask');
    const mgr = new ConfigManager(tempConfigPath);
    mgr.reset();
    expect(mgr.get('session.defaultApprovalLevel')).toBe('ask');
    vi.unstubAllEnvs();
  });

  it('NEXUS_GIT_ENABLED=false disables git', () => {
    vi.stubEnv('NEXUS_GIT_ENABLED', 'false');
    const mgr = new ConfigManager(tempConfigPath);
    mgr.reset();
    expect(mgr.get('git.enabled')).toBe(false);
    vi.unstubAllEnvs();
  });

  it('NEXUS_BASH_TIMEOUT overrides tools.bashTimeoutDefault', () => {
    vi.stubEnv('NEXUS_BASH_TIMEOUT', '15000');
    const mgr = new ConfigManager(tempConfigPath);
    mgr.reset();
    expect(mgr.get('tools.bashTimeoutDefault')).toBe(15000);
    vi.unstubAllEnvs();
  });

  it('NEXUS_BUDGET overrides cost.budget', () => {
    vi.stubEnv('NEXUS_BUDGET', '100');
    const mgr = new ConfigManager(tempConfigPath);
    mgr.reset();
    expect(mgr.get('cost.budget')).toBe(100);
    vi.unstubAllEnvs();
  });

  it('NEXUS_BLOCKED_COMMANDS overrides tools.blockedCommands', () => {
    vi.stubEnv('NEXUS_BLOCKED_COMMANDS', 'rm,dd,chmod');
    const mgr = new ConfigManager(tempConfigPath);
    mgr.reset();
    expect(mgr.get('tools.blockedCommands')).toEqual(['rm', 'dd', 'chmod']);
    vi.unstubAllEnvs();
  });

  it('NEXUS_DAILY_LIMIT overrides cost.dailyLimit', () => {
    vi.stubEnv('NEXUS_DAILY_LIMIT', '2.5');
    const mgr = new ConfigManager(tempConfigPath);
    mgr.reset();
    expect(mgr.get('cost.dailyLimit')).toBe(2.5);
    vi.unstubAllEnvs();
  });

  it('NEXUS_AUTO_COMMIT=false disables autoCommit', () => {
    vi.stubEnv('NEXUS_AUTO_COMMIT', 'false');
    const mgr = new ConfigManager(tempConfigPath);
    mgr.reset();
    expect(mgr.get('git.autoCommit')).toBe(false);
    vi.unstubAllEnvs();
  });
});
