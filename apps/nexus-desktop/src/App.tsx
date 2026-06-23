import { useState, useCallback, useEffect } from 'react';
import { ThemeProvider, useTheme } from './hooks/use-theme';
import { useNexus } from './hooks/use-nexus';
import { isTauri, getAppInfo } from './lib/tauri';
import type { Session, Message as NexusMessage } from './hooks/use-nexus';

function messageContent(msg: NexusMessage): string {
  return msg.content ?? '';
}

type View = 'chat' | 'session' | 'diff';

function Sidebar({
  sessions,
  activeSessionId,
  onSelect,
  onCreate,
  onDelete,
}: {
  sessions: Session[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="flex flex-col h-full w-60 border-r" style={{ borderColor: 'var(--nexus-border-primary)', backgroundColor: 'var(--nexus-bg-secondary)' }}>
      <div className="flex items-center justify-between px-4 h-11 border-b" style={{ borderColor: 'var(--nexus-border-primary)' }}>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--nexus-text-secondary)' }}>
          Sessions
        </span>
        <button
          onClick={onCreate}
          className="btn-ghost p-1"
          title="New Session (Cmd+N)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {sessions.length === 0 && (
          <div className="px-4 py-6 text-xs text-center" style={{ color: 'var(--nexus-text-tertiary)' }}>
            No sessions yet
          </div>
        )}
        {sessions.map(session => (
          <div
            key={session.id}
            onClick={() => onSelect(session.id)}
            className="group flex items-center gap-2 px-4 py-2 mx-2 rounded-md cursor-pointer text-sm transition-all"
            style={{
              backgroundColor: activeSessionId === session.id ? 'var(--nexus-bg-elevated)' : 'transparent',
              color: activeSessionId === session.id ? 'var(--nexus-text-primary)' : 'var(--nexus-text-secondary)',
            }}
            onMouseEnter={e => {
              if (activeSessionId !== session.id) {
                e.currentTarget.style.backgroundColor = 'var(--nexus-bg-tertiary)';
              }
            }}
            onMouseLeave={e => {
              if (activeSessionId !== session.id) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <span className="flex-1 truncate text-[13px]">{session.name}</span>
            <button
              onClick={e => { e.stopPropagation(); onDelete(session.id); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-500/20"
              style={{ color: 'var(--nexus-accent-red)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

function StatusBar({
  status,
  sessionCount,
  appVersion,
}: {
  status: string;
  sessionCount: number;
  appVersion: string;
}) {
  const statusColor =
    status === 'streaming' ? 'var(--nexus-accent-green)' :
    status === 'error' ? 'var(--nexus-accent-red)' :
    'var(--nexus-text-tertiary)';

  const statusDotClass =
    status === 'streaming' ? 'status-dot status-dot--online' :
    status === 'error' ? 'status-dot status-dot--busy' :
    'status-dot status-dot--offline';

  return (
    <footer
      className="flex items-center justify-between px-4 h-6 text-xs border-t"
      style={{ backgroundColor: 'var(--nexus-bg-secondary)', borderColor: 'var(--nexus-border-primary)', color: 'var(--nexus-text-tertiary)' }}
    >
      <div className="flex items-center gap-2">
        <span className={statusDotClass} />
        <span style={{ color: statusColor }}>
          {status === 'idle' ? 'Ready' : status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span>{sessionCount} session{sessionCount !== 1 ? 's' : ''}</span>
        <span>Nexus {appVersion}</span>
      </div>
    </footer>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 animate-fade-in">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{
          background: 'var(--nexus-gradient-glass)',
          border: '1px solid var(--nexus-border-secondary)',
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--nexus-accent-blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold" style={{ color: 'var(--nexus-text-primary)' }}>Welcome to Nexus</h2>
      <p className="text-sm" style={{ color: 'var(--nexus-text-secondary)' }}>Start a new session to begin working</p>
      <button onClick={onCreate} className="btn-primary mt-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New Session
      </button>
      <div className="mt-8 flex gap-6 text-xs" style={{ color: 'var(--nexus-text-tertiary)' }}>
        <span>Cmd+N &mdash; New session</span>
        <span>Cmd+W &mdash; Close</span>
      </div>
    </div>
  );
}

function ChatView({
  messages,
  status,
  onSend,
}: {
  messages: NexusMessage[];
  status: string;
  onSend: (content: string) => void;
}) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status === 'streaming') return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--nexus-text-tertiary)' }}>
            Send a message to start the conversation
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={'timestamp' in msg ? String(msg.timestamp) + messageContent(msg).slice(0, 20) : messageContent(msg).slice(0, 20)}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
          >
            <div
              className={`max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'rounded-br-sm'
                  : 'rounded-bl-sm'
              }`}
              style={{
                backgroundColor: msg.role === 'user' ? 'var(--nexus-bg-elevated)' : 'var(--nexus-bg-secondary)',
                border: msg.role === 'user'
                  ? '1px solid var(--nexus-border-focus)'
                  : '1px solid var(--nexus-border-primary)',
                color: msg.role === 'user' ? 'var(--nexus-text-primary)' : 'var(--nexus-text-primary)',
              }}
            >
              {messageContent(msg)}
            </div>
          </div>
        ))}
        {status === 'streaming' && (
          <div className="flex justify-start animate-fade-in">
            <div className="card px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--nexus-accent-blue)', animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--nexus-accent-blue)', animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--nexus-accent-blue)', animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-6 py-3 border-t" style={{ borderColor: 'var(--nexus-border-primary)' }}>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={status === 'streaming'}
            className="input"
            autoFocus
          />
          <button
            type="submit"
            disabled={!input.trim() || status === 'streaming'}
            className="btn-primary"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

function MainContent({
  view,
  activeSessionId,
  messages,
  status,
  onSend,
  onCreate,
}: {
  view: View;
  activeSessionId: string | null;
  messages: NexusMessage[];
  status: string;
  onSend: (content: string) => void;
  onCreate: () => void;
}) {
  if (!activeSessionId) {
    return <EmptyState onCreate={onCreate} />;
  }

  if (view === 'session') {
    return (
      <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--nexus-text-secondary)' }}>
        Session detail view
      </div>
    );
  }

  if (view === 'diff') {
    return (
      <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--nexus-text-secondary)' }}>
        Diff view
      </div>
    );
  }

  return <ChatView messages={messages} status={status} onSend={onSend} />;
}

function AppShell() {
  const nexus = useNexus();
  const { theme } = useTheme();
  const [view, setView] = useState<View>('chat');
  const [appVersion, setAppVersion] = useState('1.1.0');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    if (isTauri()) {
      getAppInfo()
        .then(info => setAppVersion(info.version))
        .catch(() => {});
    }
  }, []);

  const handleCreateSession = useCallback(() => {
    const name = `Session ${nexus.sessions.length + 1}`;
    nexus.createSession(name);
  }, [nexus]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key === 'n') {
        e.preventDefault();
        handleCreateSession();
      }

      if (meta && e.key === 'w') {
        e.preventDefault();
        if (nexus.activeSessionId) {
          nexus.deleteSession(nexus.activeSessionId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCreateSession, nexus]);

  return (
    <div
      className="flex flex-col h-screen"
      style={{ backgroundColor: 'var(--nexus-bg-primary)' }}
    >
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          sessions={nexus.sessions}
          activeSessionId={nexus.activeSessionId}
          onSelect={nexus.selectSession}
          onCreate={handleCreateSession}
          onDelete={nexus.deleteSession}
        />

        <main className="flex-1 flex flex-col overflow-hidden">
          <MainContent
            view={view}
            activeSessionId={nexus.activeSessionId}
            messages={nexus.messages}
            status={nexus.status}
            onSend={nexus.sendMessage}
            onCreate={handleCreateSession}
          />
        </main>
      </div>

      <StatusBar
        status={nexus.status}
        sessionCount={nexus.sessions.length}
        appVersion={appVersion}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
