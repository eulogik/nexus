import { useState, useEffect, useRef, useMemo, type ComponentType } from 'react';
import {
  Plus,
  Settings,
  PanelLeft,
  Download,
  Stethoscope,
  Book,
  MessageSquare,
  GitFork,
  Search,
} from 'lucide-react';

interface Command {
  id: string;
  name: string;
  shortcut?: string;
  icon: ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  action: () => void;
}

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNewSession?: () => void;
  onOpenSettings?: () => void;
  onToggleSidebar?: () => void;
  onExport?: () => void;
  onRunDoctor?: () => void;
  onOpenDocs?: () => void;
  onViewSessions?: () => void;
  onForkSession?: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onNewSession,
  onOpenSettings,
  onToggleSidebar,
  onExport,
  onRunDoctor,
  onOpenDocs,
  onViewSessions,
  onForkSession,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands: Command[] = useMemo(
    () => [
      { id: 'new-session', name: 'New Session', shortcut: 'Cmd+N', icon: Plus, action: () => { onNewSession?.(); onClose(); } },
      { id: 'open-settings', name: 'Open Settings', shortcut: 'Cmd+,', icon: Settings, action: () => { onOpenSettings?.(); onClose(); } },
      { id: 'toggle-sidebar', name: 'Toggle Sidebar', shortcut: 'Cmd+B', icon: PanelLeft, action: () => { onToggleSidebar?.(); onClose(); } },
      { id: 'export-session', name: 'Export Session', shortcut: 'Cmd+Shift+E', icon: Download, action: () => { onExport?.(); onClose(); } },
      { id: 'run-doctor', name: 'Run Doctor', icon: Stethoscope, action: () => { onRunDoctor?.(); onClose(); } },
      { id: 'open-docs', name: 'Open Docs', icon: Book, action: () => { onOpenDocs?.(); onClose(); } },
      { id: 'view-sessions', name: 'View Sessions', icon: MessageSquare, action: () => { onViewSessions?.(); onClose(); } },
      { id: 'fork-session', name: 'Fork Session', icon: GitFork, action: () => { onForkSession?.(); onClose(); } },
    ],
    [onNewSession, onOpenSettings, onToggleSidebar, onExport, onRunDoctor, onOpenDocs, onViewSessions, onForkSession, onClose],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    return commands.filter((cmd) => fuzzyMatch(cmd.name, query));
  }, [query, commands]);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      const timer = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }

      if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        filtered[selectedIndex].action();
        return;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, filtered, selectedIndex]);

  useEffect(() => {
    const selected = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!visible) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        display: 'flex',
        justifyContent: 'center',
        paddingTop: '12vh',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: open ? 'fadeIn 0.15s ease-out' : 'fadeIn 0.15s ease-out reverse',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 540,
          maxHeight: 360,
          background: 'var(--nexus-bg-secondary)',
          border: '1px solid var(--nexus-border-primary)',
          borderRadius: 'var(--nexus-radius-xl)',
          boxShadow: 'var(--nexus-shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: open ? 'slideUp 0.2s ease-out' : 'none',
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderBottom: '1px solid var(--nexus-border-primary)',
          }}
        >
          <Search size={16} style={{ color: 'var(--nexus-text-tertiary)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command..."
            style={{
              flex: 1,
              fontSize: 14,
              color: 'var(--nexus-text-primary)',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: 'var(--nexus-font-sans)',
            }}
          />
        </div>

        {/* Results */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 6px',
          }}
        >
          {filtered.length === 0 && (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                fontSize: 13,
                color: 'var(--nexus-text-tertiary)',
              }}
            >
              No matching commands
            </div>
          )}
          {filtered.map((cmd, i) => {
            const Icon = cmd.icon;
            const isSelected = i === selectedIndex;
            return (
              <button
                key={cmd.id}
                onClick={cmd.action}
                onMouseEnter={() => setSelectedIndex(i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: 13,
                  color: isSelected ? 'var(--nexus-text-primary)' : 'var(--nexus-text-secondary)',
                  background: isSelected ? 'var(--nexus-bg-elevated)' : 'transparent',
                  border: 'none',
                  borderRadius: 'var(--nexus-radius-md)',
                  cursor: 'pointer',
                  transition: 'background 0.1s, color 0.1s',
                  textAlign: 'left',
                }}
              >
                <Icon
                  size={16}
                  style={{
                    flexShrink: 0,
                    color: isSelected ? 'var(--nexus-accent-blue)' : 'var(--nexus-text-tertiary)',
                  }}
                />
                <span style={{ flex: 1 }}>{cmd.name}</span>
                {cmd.shortcut && (
                  <kbd
                    style={{
                      fontFamily: 'var(--nexus-font-mono)',
                      fontSize: 10,
                      color: 'var(--nexus-text-tertiary)',
                      background: 'var(--nexus-bg-tertiary)',
                      border: '1px solid var(--nexus-border-secondary)',
                      borderRadius: 'var(--nexus-radius-sm)',
                      padding: '1px 6px',
                      lineHeight: '16px',
                    }}
                  >
                    {cmd.shortcut}
                  </kbd>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
