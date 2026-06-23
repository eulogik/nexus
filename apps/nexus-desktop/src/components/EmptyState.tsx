import { Plus, Book, Keyboard } from 'lucide-react';

export interface EmptyStateProps {
  onCreate: () => void;
  onOpenDocs?: () => void;
}

export function EmptyState({ onCreate, onOpenDocs }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-4 px-6"
      style={{
        animation: 'fadeIn 0.4s ease-out',
      }}
    >
      {/* Logo */}
      <div
        className="w-20 h-20 rounded-2xl flex items-center justify-center mb-2"
        style={{
          background: 'var(--nexus-gradient-glass)',
          border: '1px solid var(--nexus-border-secondary)',
        }}
      >
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--nexus-accent-blue)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </div>

      {/* Title */}
      <h1
        className="text-xl font-semibold tracking-tight"
        style={{ color: 'var(--nexus-text-primary)' }}
      >
        Welcome to Nexus
      </h1>

      {/* Subtitle */}
      <p
        className="text-sm max-w-xs text-center leading-relaxed"
        style={{ color: 'var(--nexus-text-secondary)' }}
      >
        Your universal coding agent harness
      </p>

      {/* Actions */}
      <div className="flex items-center gap-3 mt-2">
        <button onClick={onCreate} className="btn-primary">
          <Plus size={14} />
          New Session
        </button>
        {onOpenDocs && (
          <button onClick={onOpenDocs} className="btn-ghost">
            <Book size={14} />
            Open Docs
          </button>
        )}
      </div>

      {/* Keyboard shortcuts */}
      <div
        className="mt-8 flex flex-col gap-1.5 text-xs"
        style={{ color: 'var(--nexus-text-tertiary)' }}
      >
        <div className="flex items-center gap-2">
          <Keyboard size={12} className="opacity-50" />
          <span>
            <kbd
              className="px-1 py-0.5 rounded text-[10px] font-mono"
              style={{
                background: 'var(--nexus-bg-tertiary)',
                border: '1px solid var(--nexus-border-secondary)',
              }}
            >
              Cmd+N
            </kbd>
            {' '}New Session
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Keyboard size={12} className="opacity-50" />
          <span>
            <kbd
              className="px-1 py-0.5 rounded text-[10px] font-mono"
              style={{
                background: 'var(--nexus-bg-tertiary)',
                border: '1px solid var(--nexus-border-secondary)',
              }}
            >
              Cmd+W
            </kbd>
            {' '}Close Session
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Keyboard size={12} className="opacity-50" />
          <span>
            <kbd
              className="px-1 py-0.5 rounded text-[10px] font-mono"
              style={{
                background: 'var(--nexus-bg-tertiary)',
                border: '1px solid var(--nexus-border-secondary)',
              }}
            >
              Cmd+Enter
            </kbd>
            {' '}Send Message
          </span>
        </div>
      </div>
    </div>
  );
}
