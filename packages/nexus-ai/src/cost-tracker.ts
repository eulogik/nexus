import type { ProviderType, SessionCost, CostBudget, CostEstimate, ModelDefinition } from './types.js';

const WARN_INTERVAL_MS = 300_000;

export class CostTracker {
  private sessions: Map<string, SessionCost> = new Map();
  private budget?: CostBudget;
  private lastWarnTime = 0;
  private warnedLimits: Set<string> = new Set();

  constructor(budget?: CostBudget) {
    this.budget = budget;
  }

  setBudget(budget: CostBudget): void {
    this.budget = budget;
  }

  addUsage(sessionId: string, tokens: { input: number; output: number }, model: ModelDefinition): SessionCost {
    const session: SessionCost = {
      sessionId,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      inputCost: (tokens.input / 1_000_000) * model.inputCostPer1M,
      outputCost: (tokens.output / 1_000_000) * model.outputCostPer1M,
      totalCost: 0,
      model: model.id,
      provider: model.provider,
      timestamp: Date.now(),
    };
    session.totalCost = session.inputCost + session.outputCost;

    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.inputTokens += session.inputTokens;
      existing.outputTokens += session.outputTokens;
      existing.inputCost += session.inputCost;
      existing.outputCost += session.outputCost;
      existing.totalCost += session.totalCost;
      existing.timestamp = session.timestamp;
    } else {
      this.sessions.set(sessionId, session);
    }

    return session;
  }

  /** Get total cost for a given session */
  getSessionCost(sessionId: string): SessionCost | undefined {
    return this.sessions.get(sessionId);
  }

  /** Get total cost for a time range */
  getCostSince(timestamp: number): number {
    let total = 0;
    for (const session of this.sessions.values()) {
      if (session.timestamp >= timestamp) {
        total += session.totalCost;
      }
    }
    return total;
  }

  /** Get daily cost (last 24h) */
  get dailyCost(): number {
    return this.getCostSince(Date.now() - 86_400_000);
  }

  /** Get monthly cost (last 30d) */
  get monthlyCost(): number {
    return this.getCostSince(Date.now() - 2_592_000_000);
  }

  /** Check if current usage is within budget. Returns true if OK, false if over budget. */
  checkBudget(): boolean {
    if (!this.budget) return true;

    const daily = this.dailyCost;
    const monthly = this.monthlyCost;
    const now = Date.now();

    if (daily >= this.budget.dailyLimit) {
      if (!this.warnedLimits.has('daily') || now - this.lastWarnTime > WARN_INTERVAL_MS) {
        console.warn(`[CostTracker] Daily budget exceeded: $${daily.toFixed(4)} / $${this.budget.dailyLimit.toFixed(4)}`);
        this.warnedLimits.add('daily');
        this.lastWarnTime = now;
      }
      return false;
    }

    if (monthly >= this.budget.monthlyLimit) {
      if (!this.warnedLimits.has('monthly') || now - this.lastWarnTime > WARN_INTERVAL_MS) {
        console.warn(`[CostTracker] Monthly budget exceeded: $${monthly.toFixed(4)} / $${this.budget.monthlyLimit.toFixed(4)}`);
        this.warnedLimits.add('monthly');
        this.lastWarnTime = now;
      }
      return false;
    }

    if (this.budget.warnAtPercent > 0) {
      const dailyRatio = daily / this.budget.dailyLimit;
      const monthlyRatio = monthly / this.budget.monthlyLimit;
      if (dailyRatio >= this.budget.warnAtPercent / 100 || monthlyRatio >= this.budget.warnAtPercent / 100) {
        if (now - this.lastWarnTime > WARN_INTERVAL_MS) {
          console.warn(
            `[CostTracker] Budget warning: daily=${(dailyRatio * 100).toFixed(1)}%, monthly=${(monthlyRatio * 100).toFixed(1)}%`
          );
          this.lastWarnTime = now;
        }
      }
    }

    return true;
  }

  /** Estimate cost for a given model and token count */
  estimateCost(model: ModelDefinition, inputTokens: number, outputTokens: number): CostEstimate {
    const inputCost = (inputTokens / 1_000_000) * model.inputCostPer1M;
    const outputCost = (outputTokens / 1_000_000) * model.outputCostPer1M;
    return {
      inputTokens,
      outputTokens,
      inputCost: model.isFree ? 0 : inputCost,
      outputCost: model.isFree ? 0 : outputCost,
      totalCost: model.isFree ? 0 : inputCost + outputCost,
      model: model.id,
    };
  }

  /** Get all session costs */
  getAllSessions(): SessionCost[] {
    return Array.from(this.sessions.values());
  }

  /** Reset all tracking */
  reset(): void {
    this.sessions.clear();
    this.warnedLimits.clear();
    this.lastWarnTime = 0;
  }
}
