import { useState, useMemo } from 'react';
import {
  DollarSign,
  GitBranch,
  Clock,
  Download,
  FileText,
  Trash2,
  Copy,
  Check,
  BarChart3,
} from 'lucide-react';
import clsx from 'clsx';
import type { Session } from '../hooks/use-nexus';

function formatCost(cost: number): string {
  if (cost <= 0) return '$0.00';
  if (cost >= 0.01) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(4)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const statusConfig: Record<string, { label: string; dot: string; bg: string }> = {
  active: { label: 'Active', dot: 'bg-green-500', bg: 'bg-green-500/10 text-green-400' },
  paused: { label: 'Paused', dot: 'bg-amber-500', bg: 'bg-amber-500/10 text-amber-400' },
  completed: { label: 'Completed', dot: 'bg-blue-500', bg: 'bg-blue-500/10 text-blue-400' },
  error: { label: 'Error', dot: 'bg-red-500', bg: 'bg-red-500/10 text-red-400' },
  aborted: { label: 'Aborted', dot: 'bg-neutral-500', bg: 'bg-neutral-500/10 text-neutral-400' },
};

function ProgressBar({ value, max, color }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const barColor =
    color ??
    (pct > 50
      ? 'var(--nexus-accent-green)'
      : pct > 25
        ? 'var(--nexus-accent-orange)'
        : 'var(--nexus-accent-red)');

  return (
    <div className="w-full h-1.5 rounded-full" style={{ background: 'var(--nexus-bg-tertiary)' }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: barColor }}
      />
    </div>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="w-16 h-3 rounded-sm flex-shrink-0" style={{ background: 'var(--nexus-bg-tertiary)' }}>
      <div
        className="h-full rounded-sm"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded-md hover:bg-surface-hover text-[var(--nexus-text-tertiary)] hover:text-[var(--nexus-text-primary)] transition-colors"
      title="Copy session ID"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: typeof DollarSign; children: React.ReactNode }) {
  return (
    <div className="card-glass p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-nexus-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--nexus-text-secondary)]">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

export interface SessionViewProps {
  session: Session;
  onExportJson: (id: string) => void;
  onExportMarkdown: (id: string) => void;
  onDelete: (id: string) => void;
  onFork: (id: string) => void;
}

export function SessionView({ session, onExportJson, onExportMarkdown, onDelete, onFork }: SessionViewProps) {
  const status = statusConfig[session.status] ?? statusConfig.completed;
  const cost = session.cost;
  const budget = session.metadata.maxCost;
  const tokenMax = useMemo(() => {
    const max = Math.max(cost.tokensUsed, 1);
    return max;
  }, [cost.tokensUsed]);

  const messages = session.messages;
  const userMsgs = messages.filter((m) => m.role === 'user').length;
  const assistantMsgs = messages.filter((m) => m.role === 'assistant').length;
  const toolMsgs = messages.filter((m) => m.role === 'tool').length;

  return (
    <div className="h-full overflow-y-auto px-6 py-5 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white tracking-tight">{session.name}</h1>
          <p className="text-xs text-[var(--nexus-text-tertiary)] mt-0.5 font-mono">
            {session.id.slice(0, 12)}...
          </p>
        </div>
      </div>

      {/* Session Info */}
      <SectionCard title="Session Info" icon={Clock}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-[11px] text-[var(--nexus-text-tertiary)]">Name</span>
            <p className="text-white text-[13px] font-medium mt-0.5">{session.name}</p>
          </div>
          <div>
            <span className="text-[11px] text-[var(--nexus-text-tertiary)]">ID</span>
            <div className="flex items-center gap-1 mt-0.5">
              <code className="text-[12px] text-[var(--nexus-text-secondary)] font-mono truncate">{session.id}</code>
              <CopyButton text={session.id} />
            </div>
          </div>
          <div>
            <span className="text-[11px] text-[var(--nexus-text-tertiary)]">Created</span>
            <p className="text-[13px] text-[var(--nexus-text-secondary)] mt-0.5">{formatDate(session.createdAt)}</p>
          </div>
          <div>
            <span className="text-[11px] text-[var(--nexus-text-tertiary)]">Updated</span>
            <p className="text-[13px] text-[var(--nexus-text-secondary)] mt-0.5">{formatDate(session.updatedAt)}</p>
          </div>
          <div>
            <span className="text-[11px] text-[var(--nexus-text-tertiary)]">Status</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={clsx('w-1.5 h-1.5 rounded-full', status.dot)} />
              <span className={clsx('text-[11px] font-medium px-1.5 py-0.5 rounded-md', status.bg)}>
                {status.label}
              </span>
            </div>
          </div>
          <div>
            <span className="text-[11px] text-[var(--nexus-text-tertiary)]">Branch</span>
            <div className="flex items-center gap-1 mt-0.5">
              <GitBranch size={12} className="text-[var(--nexus-text-tertiary)]" />
              <span className="text-[13px] text-[var(--nexus-text-secondary)]">{session.branch || 'main'}</span>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Model Info */}
      <SectionCard title="Model Info" icon={BarChart3}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[11px] text-[var(--nexus-text-tertiary)]">Model</span>
              <p className="text-[13px] text-white font-medium mt-0.5">{session.metadata.model || 'Auto'}</p>
            </div>
            <div>
              <span className="text-[11px] text-[var(--nexus-text-tertiary)]">Provider</span>
              <p className="text-[13px] text-[var(--nexus-text-secondary)] mt-0.5">
                {session.metadata.model ? 'OpenRouter' : 'Auto-detect'}
              </p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[var(--nexus-text-tertiary)]">Context Window</span>
              <span className="text-[11px] text-[var(--nexus-text-secondary)]">
                {formatTokens(cost.tokensUsed)} / {formatTokens(Math.max(cost.tokensUsed, 128_000))}
              </span>
            </div>
            <ProgressBar value={cost.tokensUsed} max={Math.max(cost.tokensUsed, 128_000)} color="var(--nexus-accent-blue)" />
          </div>
        </div>
      </SectionCard>

      {/* Cost Breakdown */}
      <SectionCard title="Cost Breakdown" icon={DollarSign}>
        <div className="space-y-4">
          {/* Session total */}
          <div className="text-center py-2">
            <span className="text-[11px] text-[var(--nexus-text-tertiary)]">Session Total</span>
            <p className="text-2xl font-bold text-white mt-1">{formatCost(cost.sessionTotal)}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[11px] text-[var(--nexus-text-tertiary)]">Daily Total</span>
              <p className="text-sm text-[var(--nexus-text-secondary)] mt-0.5">{formatCost(cost.dailyTotal)}</p>
            </div>
            <div>
              <span className="text-[11px] text-[var(--nexus-text-tertiary)]">Monthly Total</span>
              <p className="text-sm text-[var(--nexus-text-secondary)] mt-0.5">{formatCost(cost.monthlyTotal)}</p>
            </div>
          </div>

          {/* Budget */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[var(--nexus-text-tertiary)]">Budget Remaining</span>
              <span className="text-[11px] text-[var(--nexus-text-secondary)]">
                {formatCost(cost.budgetRemaining)} / {formatCost(budget)}
              </span>
            </div>
            <ProgressBar value={cost.sessionTotal} max={budget} />
          </div>

          {/* Token breakdown */}
          <div>
            <span className="text-[11px] text-[var(--nexus-text-tertiary)]">Token Usage</span>
            {(() => {
              const inputTokens = messages
                .filter((m) => m.role === 'assistant')
                .reduce((sum, m) => sum + (m as typeof m & { tokens: { input: number; output: number } }).tokens.input, 0);
              const outputTokens = messages
                .filter((m) => m.role === 'assistant')
                .reduce((sum, m) => sum + (m as typeof m & { tokens: { input: number; output: number } }).tokens.output, 0);
              const totalTokens = inputTokens + outputTokens || 1;
              return (
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <MiniBar value={inputTokens} max={totalTokens} color="var(--nexus-accent-blue)" />
                    <span className="text-[12px] text-[var(--nexus-text-secondary)]">
                      Input: {formatTokens(inputTokens)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MiniBar value={outputTokens} max={totalTokens} color="var(--nexus-accent-green)" />
                    <span className="text-[12px] text-[var(--nexus-text-secondary)]">
                      Output: {formatTokens(outputTokens)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MiniBar value={totalTokens} max={totalTokens} color="var(--nexus-accent-purple)" />
                    <span className="text-[12px] text-[var(--nexus-text-secondary)]">
                      Total: {formatTokens(totalTokens)}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Savings */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t" style={{ borderColor: 'var(--nexus-border-secondary)' }}>
            <div>
              <span className="text-[11px] text-[var(--nexus-text-tertiary)]">Compression Savings</span>
              <p className="text-sm text-green-400 font-medium mt-0.5">
                +{formatCost(cost.savingsFromCompression)}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-[var(--nexus-text-tertiary)]">Free Model Savings</span>
              <p className="text-sm text-green-400 font-medium mt-0.5">
                +{formatCost(cost.savingsFromFreeModels)}
              </p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Messages Summary */}
      <SectionCard title="Messages Summary" icon={FileText}>
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <p className="text-lg font-semibold text-white">{messages.length}</p>
            <span className="text-[11px] text-[var(--nexus-text-tertiary)]">Total</span>
          </div>
          <div>
            <p className="text-lg font-semibold text-nexus-400">{userMsgs}</p>
            <span className="text-[11px] text-[var(--nexus-text-tertiary)]">User</span>
          </div>
          <div>
            <p className="text-lg font-semibold text-green-400">{assistantMsgs}</p>
            <span className="text-[11px] text-[var(--nexus-text-tertiary)]">Assistant</span>
          </div>
          <div>
            <p className="text-lg font-semibold text-amber-400">{toolMsgs}</p>
            <span className="text-[11px] text-[var(--nexus-text-tertiary)]">Tool Calls</span>
          </div>
        </div>
      </SectionCard>

      {/* Actions */}
      <SectionCard title="Actions" icon={FileText}>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onExportJson(session.id)}
            className="btn-ghost text-xs"
          >
            <Download size={12} />
            Export JSON
          </button>
          <button
            onClick={() => onExportMarkdown(session.id)}
            className="btn-ghost text-xs"
          >
            <FileText size={12} />
            Export Markdown
          </button>
          <button
            onClick={() => onFork(session.id)}
            className="btn-ghost text-xs"
          >
            <GitBranch size={12} />
            Fork Session
          </button>
          <button
            onClick={() => onDelete(session.id)}
            className="btn-ghost text-xs hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/30"
          >
            <Trash2 size={12} />
            Delete Session
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
