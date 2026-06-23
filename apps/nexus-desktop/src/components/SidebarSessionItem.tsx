import { Circle, Trash2, Download, Copy } from 'lucide-react';
import type { Session } from '../hooks/use-nexus';

export interface SidebarSessionItemProps {
  session: Session;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
}

const statusStyles: Record<string, { color: string; glow: string }> = {
  active: { color: 'var(--nexus-accent-green)', glow: 'rgba(63,185,80,0.4)' },
  paused: { color: 'var(--nexus-accent-orange)', glow: 'rgba(210,153,34,0.4)' },
  completed: { color: 'var(--nexus-text-tertiary)', glow: 'transparent' },
  error: { color: 'var(--nexus-accent-red)', glow: 'rgba(248,81,73,0.4)' },
  aborted: { color: 'var(--nexus-text-tertiary)', glow: 'transparent' },
};

function formatCost(cost: number): string | null {
  if (cost <= 0) return null;
  if (cost >= 0.01) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(4)}`;
}

function formatTime(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function SidebarSessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
  onExport,
}: SidebarSessionItemProps) {
  const status = statusStyles[session.status] ?? statusStyles.completed;
  const costDisplay = formatCost(session.cost?.sessionTotal ?? 0);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete session "${session.name}"?`)) {
      onDelete(session.id);
    }
  };

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(session.id);
  };

  const handleExport = (e: React.MouseEvent) => {
    e.stopPropagation();
    onExport(session.id);
  };

  return (
    <div
      onClick={() => onSelect(session.id)}
      className={`group relative flex items-start gap-3 px-4 py-2.5 mx-2 rounded-lg cursor-pointer transition-all duration-150 ${
        isActive
          ? 'bg-nexus-500/10 border-l-2 border-nexus-500 -ml-[1px]'
          : 'border-l-2 border-transparent hover:bg-surface-hover'
      }`}
    >
      <div className="flex-shrink-0 mt-1">
        <Circle
          size={8}
          fill={status.color}
          color={status.color}
          style={{
            filter:
              status.glow !== 'transparent'
                ? `drop-shadow(0 0 4px ${status.glow})`
                : 'none',
          }}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium truncate ${
              isActive ? 'text-white' : 'text-[var(--nexus-text-primary)]'
            }`}
          >
            {session.name}
          </span>
          {costDisplay && (
            <span className="flex-shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 leading-none">
              {costDisplay}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-[var(--nexus-text-tertiary)] truncate max-w-[120px]">
            {session.metadata?.model || 'No model'}
          </span>
          <span className="text-[11px] text-[var(--nexus-text-tertiary)] flex-shrink-0">
            {formatTime(session.createdAt)}
          </span>
        </div>
      </div>

      <div
        className={`flex items-center gap-0.5 flex-shrink-0 transition-opacity duration-150 ${
          isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <button
          onClick={handleExport}
          className="p-1 rounded-md hover:bg-surface-hover text-[var(--nexus-text-tertiary)] hover:text-[var(--nexus-text-primary)] transition-colors"
          title="Export session"
        >
          <Download size={13} />
        </button>
        <button
          onClick={handleCopyId}
          className="p-1 rounded-md hover:bg-surface-hover text-[var(--nexus-text-tertiary)] hover:text-[var(--nexus-text-primary)] transition-colors"
          title="Copy session ID"
        >
          <Copy size={13} />
        </button>
        <button
          onClick={handleDelete}
          className="p-1 rounded-md hover:bg-red-500/20 text-[var(--nexus-text-tertiary)] hover:text-[var(--nexus-accent-red)] transition-colors"
          title="Delete session"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
