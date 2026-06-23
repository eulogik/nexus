import { useEffect, useState } from 'react';
import { X, Command, ArrowUpFromLine, ArrowDownToLine, PanelLeft, Palette } from 'lucide-react';

interface ShortcutGroup {
  label: string;
  shortcuts: { keys: string; description: string }[];
}

const groups: ShortcutGroup[] = [
  {
    label: 'Navigation',
    shortcuts: [
      { keys: 'Cmd+N', description: 'New Session' },
      { keys: 'Cmd+W', description: 'Close Tab' },
      { keys: 'Cmd+,', description: 'Settings' },
    ],
  },
  {
    label: 'Chat',
    shortcuts: [
      { keys: 'Enter', description: 'Send' },
      { keys: 'Shift+Enter', description: 'New Line' },
      { keys: 'Escape', description: 'Cancel / Close' },
    ],
  },
  {
    label: 'Session',
    shortcuts: [
      { keys: 'Cmd+S', description: 'Save' },
      { keys: 'Cmd+Shift+E', description: 'Export' },
    ],
  },
  {
    label: 'View',
    shortcuts: [
      { keys: 'Cmd+B', description: 'Toggle Sidebar' },
      { keys: 'Cmd+K', description: 'Command Palette' },
    ],
  },
];

function Kbd({ keys }: { keys: string }) {
  return (
    <kbd
      style={{
        background: 'var(--nexus-bg-tertiary)',
        border: '1px solid var(--nexus-border-secondary)',
        borderRadius: 'var(--nexus-radius-sm)',
        color: 'var(--nexus-text-secondary)',
        fontFamily: 'var(--nexus-font-mono)',
        fontSize: 11,
        padding: '2px 7px',
        whiteSpace: 'nowrap',
        lineHeight: '18px',
        letterSpacing: '-0.01em',
      }}
    >
      {keys}
    </kbd>
  );
}

export interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
    } else {
      const timer = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!visible) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: open ? 'fadeIn 0.15s ease-out' : 'fadeIn 0.15s ease-out reverse',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--nexus-bg-secondary)',
          border: '1px solid var(--nexus-border-primary)',
          borderRadius: 'var(--nexus-radius-xl)',
          boxShadow: 'var(--nexus-shadow-lg)',
          width: 480,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          animation: open ? 'slideUp 0.2s ease-out' : 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--nexus-border-primary)',
          }}
        >
          <h2
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--nexus-text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            style={{
              padding: 4,
              borderRadius: 'var(--nexus-radius-md)',
              color: 'var(--nexus-text-tertiary)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--nexus-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--nexus-text-tertiary)')}
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            padding: '12px 20px 20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {groups.map((group) => (
            <div key={group.label}>
              <h3
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--nexus-text-tertiary)',
                  marginBottom: 8,
                }}
              >
                {group.label}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.keys + shortcut.description}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      borderRadius: 'var(--nexus-radius-md)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = 'var(--nexus-bg-tertiary)')
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = 'transparent')
                    }
                  >
                    <span
                      style={{
                        fontSize: 13,
                        color: 'var(--nexus-text-primary)',
                      }}
                    >
                      {shortcut.description}
                    </span>
                    <Kbd keys={shortcut.keys} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
