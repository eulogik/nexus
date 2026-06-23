import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { minimatch } from 'minimatch';
import { ErrorCode } from './types.js';
import { NexusError } from './error.js';
import type { ApprovalRule, LearnedRule, ApprovalResult } from './types.js';

const DEFAULT_LEARNED_RULES_PATH = join(homedir(), '.nexus', 'approval-rules.json');
const CONFIDENCE_DECAY_PER_MONTH = 0.9;

export class ApprovalChecker {
  private alwaysAsk: string[] = [];
  private autoApprove: string[] = [];
  private learnedRules: LearnedRule[] = [];
  private defaultLevel: 'auto' | 'notify' | 'ask';
  private persistenceEnabled: boolean;
  private rulesPath: string;
  private confidenceDecayRate: number;

  constructor(options?: {
    alwaysAsk?: string[];
    autoApprove?: string[];
    defaultLevel?: 'auto' | 'notify' | 'ask';
    persistenceEnabled?: boolean;
    rulesPath?: string;
    confidenceDecayRate?: number;
  }) {
    this.alwaysAsk = options?.alwaysAsk ?? [];
    this.autoApprove = options?.autoApprove ?? [];
    this.defaultLevel = options?.defaultLevel ?? 'auto';
    this.persistenceEnabled = options?.persistenceEnabled ?? true;
    this.rulesPath = options?.rulesPath ?? DEFAULT_LEARNED_RULES_PATH;
    this.confidenceDecayRate = options?.confidenceDecayRate ?? CONFIDENCE_DECAY_PER_MONTH;
    this.loadRules();
  }

  private loadRules(): void {
    if (!this.persistenceEnabled) return;
    try {
      if (existsSync(this.rulesPath)) {
        const raw = readFileSync(this.rulesPath, 'utf-8');
        this.learnedRules = JSON.parse(raw) as LearnedRule[];
        this.applyConfidenceDecay();
      }
    } catch {
      console.warn('[Approval] Failed to load learned rules');
    }
  }

  private saveRules(): void {
    if (!this.persistenceEnabled) return;
    try {
      const dir = this.rulesPath.substring(0, this.rulesPath.lastIndexOf('/'));
      if (dir && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.rulesPath, JSON.stringify(this.learnedRules, null, 2), 'utf-8');
    } catch {
      console.warn('[Approval] Failed to persist learned rules');
    }
  }

  private applyConfidenceDecay(): void {
    const now = Date.now();
    for (const rule of this.learnedRules) {
      const monthsElapsed = (now - rule.lastApplied) / (30 * 24 * 60 * 60 * 1000);
      if (monthsElapsed > 0) {
        rule.confidence *= Math.pow(this.confidenceDecayRate, monthsElapsed);
      }
    }
    this.learnedRules = this.learnedRules.filter((r) => r.confidence > 0.1);
  }

  private findMatchingLearnedRule(toolName: string, args: Record<string, unknown>): LearnedRule | undefined {
    const argsStr = JSON.stringify(args);
    for (const rule of this.learnedRules) {
      if (rule.toolName !== toolName) continue;
      if (minimatch(toolName, rule.pattern) || minimatch(argsStr, rule.pattern)) {
        return rule;
      }
    }
    return undefined;
  }

  private matchesAlwaysAsk(toolName: string, args: Record<string, unknown>): boolean {
    const argsStr = JSON.stringify(args);
    for (const pattern of this.alwaysAsk) {
      if (minimatch(toolName, pattern) || minimatch(argsStr, pattern)) {
        return true;
      }
    }
    return false;
  }

  private matchesAutoApprove(toolName: string, args: Record<string, unknown>): boolean {
    const argsStr = JSON.stringify(args);
    for (const pattern of this.autoApprove) {
      if (minimatch(toolName, pattern) || minimatch(argsStr, pattern)) {
        return true;
      }
    }
    return false;
  }

  async check(
    toolName: string,
    args: Record<string, unknown>,
    options?: { reasoning?: string },
  ): Promise<ApprovalResult> {
    const request = {
      toolName,
      args,
      reasoning: options?.reasoning,
    };

    if (this.matchesAlwaysAsk(toolName, args)) {
      return {
        status: 'pending',
        request,
        notify: true,
        rule: 'alwaysAsk pattern matched',
      };
    }

    if (this.matchesAutoApprove(toolName, args)) {
      return {
        status: 'approved',
        request,
        rule: 'autoApprove pattern matched',
      };
    }

    const learnedRule = this.findMatchingLearnedRule(toolName, args);
    if (learnedRule) {
      learnedRule.lastApplied = Date.now();
      learnedRule.appliedCount++;
      this.saveRules();

      if (learnedRule.action === 'auto' && learnedRule.confidence >= 0.5) {
        return {
          status: 'approved',
          request,
          rule: `learned rule: ${learnedRule.reason} (confidence: ${learnedRule.confidence.toFixed(2)})`,
        };
      }

      if (learnedRule.action === 'ask') {
        return {
          status: 'pending',
          request,
          notify: true,
          rule: `learned rule requires approval: ${learnedRule.reason}`,
        };
      }

      if (learnedRule.action === 'notify') {
        return {
          status: 'pending',
          request,
          notify: true,
          rule: `learned rule with notify: ${learnedRule.reason}`,
        };
      }
    }

    switch (this.defaultLevel) {
      case 'auto':
        return { status: 'approved', request };
      case 'notify':
        return { status: 'pending', request, notify: true };
      case 'ask':
        return { status: 'pending', request, notify: true };
    }
  }

  learn(
    toolName: string,
    args: Record<string, unknown>,
    approved: boolean,
    reason?: string,
  ): void {
    const argsStr = JSON.stringify(args);
    const existing = this.learnedRules.find(
      (r) => r.toolName === toolName && (r.pattern === toolName || r.pattern === argsStr),
    );

    if (existing) {
      if (approved) {
        existing.positiveFeedback++;
        existing.confidence = Math.min(1, existing.confidence + 0.1);
        existing.action = 'auto';
      } else {
        existing.negativeFeedback++;
        existing.confidence = Math.max(0, existing.confidence - 0.3);
        if (existing.confidence < 0.3) {
          existing.action = 'ask';
        }
      }
      existing.lastApplied = Date.now();
      existing.appliedCount++;
    } else {
      const pattern = reason && reason.length < 40 ? reason : toolName;
      const rule: LearnedRule = {
        id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        pattern: reason && reason.length < 40 ? reason : toolName,
        toolName,
        action: approved ? 'auto' : 'ask',
        reason: reason ?? `Learned from ${approved ? 'approval' : 'rejection'} of ${toolName}`,
        createdAt: Date.now(),
        lastApplied: Date.now(),
        confidence: approved ? 0.6 : 0.3,
        appliedCount: 1,
        source: 'user',
        positiveFeedback: approved ? 1 : 0,
        negativeFeedback: approved ? 0 : 1,
      };
      this.learnedRules.push(rule);
    }

    this.saveRules();
  }

  getLearnedRules(): LearnedRule[] {
    return [...this.learnedRules];
  }

  clearLearnedRules(): void {
    this.learnedRules = [];
    this.saveRules();
  }

  removeLearnedRule(id: string): boolean {
    const idx = this.learnedRules.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    this.learnedRules.splice(idx, 1);
    this.saveRules();
    return true;
  }

  updateLearnedRule(id: string, updates: Partial<LearnedRule>): boolean {
    const rule = this.learnedRules.find((r) => r.id === id);
    if (!rule) return false;
    Object.assign(rule, updates);
    this.saveRules();
    return true;
  }

  setAlwaysAsk(patterns: string[]): void {
    this.alwaysAsk = patterns;
  }

  setAutoApprove(patterns: string[]): void {
    this.autoApprove = patterns;
  }

  getAlwaysAsk(): string[] {
    return [...this.alwaysAsk];
  }

  getAutoApprove(): string[] {
    return [...this.autoApprove];
  }

  setDefaultLevel(level: 'auto' | 'notify' | 'ask'): void {
    this.defaultLevel = level;
  }
}
