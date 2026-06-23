import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ApprovalChecker } from '../src/approval.js';

describe('ApprovalChecker', () => {
  let checker: ApprovalChecker;

  beforeEach(() => {
    checker = new ApprovalChecker({
      persistenceEnabled: false,
      defaultLevel: 'auto',
    });
  });

  describe('check()', () => {
    it('approves auto-approve patterns', async () => {
      checker.setAutoApprove(['read', 'glob', 'grep']);
      const result = await checker.check('read', { filePath: '/tmp/test.txt' });
      expect(result.status).toBe('approved');
      expect(result.rule).toContain('autoApprove');
    });

    it('asks for always-ask patterns', async () => {
      checker.setAlwaysAsk(['write', 'edit', 'bash']);
      const result = await checker.check('write', { filePath: '/etc/config' });
      expect(result.status).toBe('pending');
      expect(result.notify).toBe(true);
      expect(result.rule).toContain('alwaysAsk');
    });

    it('uses defaultLevel when no rules match', async () => {
      const autoResult = await checker.check('someTool', {});
      expect(autoResult.status).toBe('approved');

      checker.setDefaultLevel('ask');
      const askResult = await checker.check('someTool', {});
      expect(askResult.status).toBe('pending');

      checker.setDefaultLevel('notify');
      const notifyResult = await checker.check('someTool', {});
      expect(notifyResult.status).toBe('pending');
      expect(notifyResult.notify).toBe(true);
    });

    it('matches auto-approve by args pattern', async () => {
      checker.setAutoApprove(['{"filePath":"*"}']);
      const result = await checker.check('read', { filePath: '/safe/file.ts' });
      expect(result.status).toBe('approved');
    });

    it('uses learned rules when confidence is high enough', async () => {
      checker.learn('read', { filePath: '/trusted/file.ts' }, true);
      const result = await checker.check('read', { filePath: '/trusted/file.ts' });
      expect(result.status).toBe('approved');
      expect(result.rule).toBeTruthy();
      expect(result.rule).toContain('learned');
    });

    it('respects learned rule with ask action', async () => {
      checker.learn('bash', { command: 'rm something' }, false);
      const result = await checker.check('bash', { command: 'rm something' });
      expect(result.status).toBe('pending');
      expect(result.rule).toBeTruthy();
      expect(result.rule).toContain('requires approval');
    });

    it('returns request info in approval result', async () => {
      checker.setAlwaysAsk(['write']);
      const result = await checker.check('write', { filePath: '/test.txt' }, { reasoning: 'needs check' });
      expect(result.request).toBeDefined();
      expect(result.request!.toolName).toBe('write');
      expect(result.request!.args).toEqual({ filePath: '/test.txt' });
      expect(result.request!.reasoning).toBe('needs check');
    });
  });

  describe('learn()', () => {
    it('creates new rules', () => {
      checker.learn('read', { filePath: '/tmp/x.txt' }, true, 'reading temp file');
      const rules = checker.getLearnedRules();
      expect(rules).toHaveLength(1);
      expect(rules[0]!.toolName).toBe('read');
      expect(rules[0]!.action).toBe('auto');
      expect(rules[0]!.confidence).toBe(0.6);
      expect(rules[0]!.source).toBe('user');
    });

    it('creates ask rules on rejection', () => {
      checker.learn('bash', { command: 'rm -rf /' }, false, 'unsafe');
      const rules = checker.getLearnedRules();
      expect(rules[0]!.action).toBe('ask');
      expect(rules[0]!.confidence).toBe(0.3);
    });

    it('updates existing rules on approval', () => {
      checker.learn('read', { filePath: '/x' }, true);
      const rulesBefore = checker.getLearnedRules();
      expect(rulesBefore).toHaveLength(1);
      const ruleId = rulesBefore[0]!.id;

      checker.learn('read', { filePath: '/x' }, true);
      const updated = checker.getLearnedRules();
      expect(updated).toHaveLength(1);
      expect(updated[0]!.id).toBe(ruleId);
      expect(updated[0]!.positiveFeedback).toBe(2);
      expect(updated[0]!.confidence).toBe(0.7);
    });

    it('updates existing rules on rejection', () => {
      checker.learn('read', { filePath: '/x' }, true);
      checker.learn('read', { filePath: '/x' }, false);
      const rules = checker.getLearnedRules();
      expect(rules).toHaveLength(1);
      expect(rules[0]!.negativeFeedback).toBe(1);
      expect(rules[0]!.confidence).toBe(0.3);
    });
  });

  describe('getLearnedRules / clearLearnedRules', () => {
    it('getLearnedRules returns all rules', () => {
      checker.learn('read', { filePath: '/a' }, true);
      checker.learn('write', { filePath: '/b' }, false);
      expect(checker.getLearnedRules()).toHaveLength(2);
    });

    it('getLearnedRules returns a copy', () => {
      checker.learn('read', { filePath: '/a' }, true);
      const rules = checker.getLearnedRules();
      rules.length = 0;
      expect(checker.getLearnedRules()).toHaveLength(1);
    });

    it('clearLearnedRules removes all rules', () => {
      checker.learn('read', { filePath: '/a' }, true);
      expect(checker.getLearnedRules()).toHaveLength(1);
      checker.clearLearnedRules();
      expect(checker.getLearnedRules()).toHaveLength(0);
    });
  });

  describe('removeLearnedRule', () => {
    it('removes specific rule by id', () => {
      checker.learn('read', { filePath: '/a' }, true);
      const ruleId = checker.getLearnedRules()[0]!.id;
      const removed = checker.removeLearnedRule(ruleId);
      expect(removed).toBe(true);
      expect(checker.getLearnedRules()).toHaveLength(0);
    });

    it('returns false for non-existent id', () => {
      expect(checker.removeLearnedRule('nonexistent')).toBe(false);
    });
  });

  describe('confidence decay', () => {
    it('decays over time when persistence is enabled', () => {
      const frozen = Date.now();
      vi.setSystemTime(frozen);

      const rulesDir = mkdtempSync(join(tmpdir(), 'nexus-approval-decay-'));
      const rulesPath = join(rulesDir, 'rules.json');

      const c1 = new ApprovalChecker({
        persistenceEnabled: true,
        rulesPath,
        defaultLevel: 'auto',
        confidenceDecayRate: 0.5,
      });
      c1.learn('read', { filePath: '/a' }, true);
      const initial = c1.getLearnedRules()[0]!.confidence;
      expect(initial).toBe(0.6);

      vi.setSystemTime(frozen + 30 * 24 * 60 * 60 * 1000 + 1);

      const c2 = new ApprovalChecker({
        persistenceEnabled: true,
        rulesPath,
        defaultLevel: 'auto',
        confidenceDecayRate: 0.5,
      });
      const decayed = c2.getLearnedRules()[0]!.confidence;
      expect(decayed).toBeLessThan(0.6);

      rmSync(rulesDir, { recursive: true, force: true });
      vi.useRealTimers();
    });
  });

  describe('setAlwaysAsk / getAlwaysAsk', () => {
    it('setAlwaysAsk/getAlwaysAsk work', () => {
      checker.setAlwaysAsk(['write', 'edit']);
      expect(checker.getAlwaysAsk()).toEqual(['write', 'edit']);
    });

    it('getAlwaysAsk returns a copy', () => {
      checker.setAlwaysAsk(['bash']);
      const list = checker.getAlwaysAsk();
      list.push('extra');
      expect(checker.getAlwaysAsk()).toEqual(['bash']);
    });
  });

  describe('setAutoApprove / getAutoApprove', () => {
    it('setAutoApprove/getAutoApprove work', () => {
      checker.setAutoApprove(['read', 'glob', 'grep']);
      expect(checker.getAutoApprove()).toEqual(['read', 'glob', 'grep']);
    });

    it('getAutoApprove returns a copy', () => {
      checker.setAutoApprove(['read']);
      const list = checker.getAutoApprove();
      list.push('extra');
      expect(checker.getAutoApprove()).toEqual(['read']);
    });
  });

  describe('setDefaultLevel / getDefaultLevel', () => {
    it('setDefaultLevel affects check results', async () => {
      checker.setDefaultLevel('ask');
      const result = await checker.check('unknownTool', {});
      expect(result.status).toBe('pending');

      checker.setDefaultLevel('auto');
      const autoResult = await checker.check('unknownTool', {});
      expect(autoResult.status).toBe('approved');
    });
  });

  describe('persistence', () => {
    it('loads rules from file when persistence is enabled', () => {
      const rulesDir = mkdtempSync(join(tmpdir(), 'nexus-approval-rules-'));
      const rulesPath = join(rulesDir, 'rules.json');

      const c1 = new ApprovalChecker({
        persistenceEnabled: true,
        rulesPath,
        defaultLevel: 'auto',
      });
      c1.learn('read', { filePath: '/x' }, true);

      const c2 = new ApprovalChecker({
        persistenceEnabled: true,
        rulesPath,
        defaultLevel: 'auto',
      });
      expect(c2.getLearnedRules()).toHaveLength(1);
      expect(c2.getLearnedRules()[0]!.toolName).toBe('read');

      rmSync(rulesDir, { recursive: true, force: true });
    });
  });
});
