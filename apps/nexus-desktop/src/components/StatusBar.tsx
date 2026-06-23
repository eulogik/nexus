import { useState, useEffect, useCallback } from 'react';
import { DollarSign } from 'lucide-react';
import clsx from 'clsx';

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

function useCurrentTime(): string {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 60_000);
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000;
    const firstTick = setTimeout(() => setTime(new Date()), msUntilNextMinute);

    return () => {
      clearInterval(interval);
      clearTimeout(firstTick);
    };
  }, []);

  return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export type StatusBarStatus = 'idle' | 'thinking' | 'streaming' | 'error';

export interface StatusBarProps {
  status: StatusBarStatus;
  model?: string;
  messageCount: number;
  sessionCost: number;
  compressionSavings?: number;
  tokensUsed?: number;
  onCostToggle?: () => void;
}

export function StatusBar({
  status,
  model,
  messageCount,
  sessionCost,
  compressionSavings,
  tokensUsed,
  onCostToggle,
}: StatusBarProps) {
  const time = useCurrentTime();

  const statusConfig: Record<StatusBarStatus, { dot: string; label: string; pulse: boolean }> = {
    idle: { dot: 'bg-green-500', label: 'Ready', pulse: false },
    thinking: { dot: 'bg-amber-500', label: 'Thinking...', pulse: true },
    streaming: { dot: 'bg-green-500', label: 'Streaming...', pulse: true },
    error: { dot: 'bg-red-500', label: 'Error', pulse: false },
  };

  const cfg = statusConfig[status] ?? statusConfig.idle;

  return (
    <footer className="flex items-center justify-between h-7 px-3 bg-surface-darker border-t border-surface-border text-[11px] text-[var(--nexus-text-tertiary)] flex-shrink-0">
      {/* Left */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={clsx(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            cfg.dot,
            cfg.pulse && 'animate-pulse-slow',
          )}
        />
        <span
          className={clsx(
            'font-medium',
            status === 'error' && 'text-red-400',
            status === 'streaming' && 'text-green-400',
            status === 'thinking' && 'text-amber-400',
            status === 'idle' && 'text-[var(--nexus-text-secondary)]',
          )}
        >
          {cfg.label}
        </span>
        {model && (
          <span className="text-[var(--nexus-text-tertiary)] hidden sm:inline">· {model}</span>
        )}
      </div>

      {/* Center */}
      <div className="flex items-center gap-2">
        <span className="text-[var(--nexus-text-tertiary)]">
          {messageCount} message{messageCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2.5 min-w-0">
        {sessionCost > 0 && (
          <button
            onClick={onCostToggle}
            className="flex items-center gap-1 text-amber-400/80 hover:text-amber-300 transition-colors"
            title="Toggle cost panel"
          >
            <DollarSign size={10} />
            <span>{formatCost(sessionCost)}</span>
          </button>
        )}

        {compressionSavings !== undefined && compressionSavings > 0 && (
          <span className="text-green-500/80 text-[10px] font-medium px-1 py-0.5 rounded bg-green-500/10 leading-none">
            +{formatCost(compressionSavings)}
          </span>
        )}

        {tokensUsed !== undefined && tokensUsed > 0 && (
          <span className="text-[var(--nexus-text-tertiary)]">{formatTokens(tokensUsed)} tokens</span>
        )}

        <span className="text-[var(--nexus-text-tertiary)]">{time}</span>
      </div>
    </footer>
  );
}
