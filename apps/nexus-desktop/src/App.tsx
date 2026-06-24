import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThemeProvider, useTheme } from './hooks/use-theme';
import { useProjects } from './hooks/use-projects';
import { useNexus } from './hooks/use-nexus';
import { useToast, ToastProvider } from './hooks/use-toast';
import { isTauri, getAppInfo, invoke, openUrl, pickFolder, type FileEntry } from './lib/tauri';
import type { Session, Message as NexusMessage } from './lib/tauri';

interface ProjectFile {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

function messageContent(msg: NexusMessage): string {
  return msg.content ?? '';
}

// ── Sidebar ──

function Sidebar({
  projects,
  activeProject,
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  onAddProject,
  onSelectProject,
  onRemoveProject,
  onFileSelect,
  selectedFile,
  fileContent,
}: {
  projects: { id: string; name: string; path: string }[];
  activeProject: { id: string; name: string; path: string } | null;
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onDeleteSession: (id: string) => void;
  onAddProject: () => void;
  onSelectProject: (id: string) => void;
  onRemoveProject: (id: string) => void;
  onFileSelect: (file: ProjectFile | null, content: string | null) => void;
  selectedFile: ProjectFile | null;
  fileContent: string | null;
}) {
  const [sessionsOpen, setSessionsOpen] = useState(true);
  const [filesOpen, setFilesOpen] = useState(true);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirContents, setDirContents] = useState<Record<string, ProjectFile[]>>({});
  const [dirLoading, setDirLoading] = useState<Set<string>>(new Set());

  const loadDir = useCallback(async (dir: string) => {
    if (!isTauri() || !activeProject) return;
    setDirLoading(prev => new Set(prev).add(dir));
    try {
      const entries = await invoke<FileEntry[]>('list_project_files', {
        projectId: activeProject.id,
        dir,
      });
      const mapped = entries.map((e: FileEntry) => ({
        name: e.name,
        path: e.path,
        is_dir: e.is_dir,
        size: e.size,
      }));
      setDirContents(prev => ({ ...prev, [dir]: mapped }));
    } catch {
      setDirContents(prev => ({ ...prev, [dir]: [] }));
    }
    setDirLoading(prev => { const next = new Set(prev); next.delete(dir); return next; });
  }, [activeProject]);

  useEffect(() => {
    setExpandedDirs(new Set());
    setDirContents({});
    loadDir('');
  }, [loadDir]);

  const toggleDir = useCallback((dir: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
        if (!dirContents[dir]) loadDir(dir);
      }
      return next;
    });
  }, [loadDir, dirContents]);

  const selectFile = useCallback(async (file: ProjectFile) => {
    onFileSelect(file, null);
    if (!file.is_dir && isTauri() && activeProject) {
      try {
        const content = await invoke<string>('read_project_file', { projectId: activeProject.id, filePath: file.path });
        onFileSelect(file, content);
      } catch {
        onFileSelect(file, '// Error reading file');
      }
    }
  }, [activeProject, onFileSelect]);

  useEffect(() => { onFileSelect(null, null); }, [activeProject?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderFileTree = (dir: string, depth: number = 0): React.ReactNode => {
    const items = dirContents[dir] || [];
    const loading = dirLoading.has(dir);
    const expanded = expandedDirs.has(dir);

    const dirName = dir ? dir.split('/').pop() || dir : activeProject?.name || 'root';

    if (depth > 0) {
      return (
        <div key={dir}>
          <div
            className="group flex items-center gap-1.5 cursor-pointer text-xs transition-all rounded-sm"
            style={{
              paddingLeft: 12 + (depth - 1) * 12,
              paddingTop: 4,
              paddingBottom: 4,
              paddingRight: 8,
              color: 'var(--nexus-text-secondary)',
            }}
            onClick={() => toggleDir(dir)}
          >
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0, color: 'var(--nexus-text-tertiary)' }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--nexus-accent-blue)', flexShrink: 0 }}>
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span className="truncate flex-1">{dirName}</span>
            {loading && <span className="w-3 h-3 rounded-full animate-spin" style={{ border: '2px solid var(--nexus-border-primary)', borderTopColor: 'var(--nexus-accent-blue)' }} />}
          </div>
          {expanded && (
            <div>
              {loading && depth === 0 ? (
                <div className="px-4 py-2 text-xs" style={{ color: 'var(--nexus-text-tertiary)' }}>Loading...</div>
              ) : items.length === 0 && !loading ? (
                <div className="text-[10px] pl-[60px] py-1" style={{ color: 'var(--nexus-text-tertiary)' }}>Empty</div>
              ) : (
                items.map(item => item.is_dir ? renderFileTree(item.path, depth + 1) : (
                  <div
                    key={item.path}
                    className="group flex items-center gap-2 cursor-pointer text-xs transition-all rounded-sm"
                    style={{
                      paddingLeft: 12 + depth * 12,
                      paddingTop: 3,
                      paddingBottom: 3,
                      paddingRight: 8,
                      backgroundColor: selectedFile?.path === item.path ? 'var(--nexus-bg-elevated)' : 'transparent',
                      color: selectedFile?.path === item.path ? 'var(--nexus-text-primary)' : 'var(--nexus-text-secondary)',
                    }}
                    onClick={() => selectFile(item)}
                    onMouseEnter={e => { if (selectedFile?.path !== item.path) e.currentTarget.style.backgroundColor = 'var(--nexus-bg-tertiary)'; }}
                    onMouseLeave={e => { if (selectedFile?.path !== item.path) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--nexus-accent-purple)', flexShrink: 0 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="truncate">{item.name}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      );
    }

    // Root level (depth === 0)
    return (
      <div>
        {loading ? (
          <div className="px-4 py-3 text-xs" style={{ color: 'var(--nexus-text-tertiary)' }}>Loading...</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-3 text-xs" style={{ color: 'var(--nexus-text-tertiary)' }}>No files</div>
        ) : (
          items.map(item => item.is_dir ? renderFileTree(item.path, 1) : (
            <div
              key={item.path}
              className="group flex items-center gap-2 cursor-pointer text-xs transition-all rounded-sm"
              style={{
                paddingLeft: 24,
                paddingTop: 3,
                paddingBottom: 3,
                paddingRight: 8,
                backgroundColor: selectedFile?.path === item.path ? 'var(--nexus-bg-elevated)' : 'transparent',
                color: selectedFile?.path === item.path ? 'var(--nexus-text-primary)' : 'var(--nexus-text-secondary)',
              }}
              onClick={() => selectFile(item)}
              onMouseEnter={e => { if (selectedFile?.path !== item.path) e.currentTarget.style.backgroundColor = 'var(--nexus-bg-tertiary)'; }}
              onMouseLeave={e => { if (selectedFile?.path !== item.path) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--nexus-accent-purple)', flexShrink: 0 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="truncate">{item.name}</span>
            </div>
          ))
        )}
      </div>
    );
  };

  return (
    <aside
      className="flex flex-col h-full border-r select-none"
      style={{ width: 260, borderColor: 'var(--nexus-border-primary)', backgroundColor: 'var(--nexus-bg-secondary)' }}
    >
      {/* Project header */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderColor: 'var(--nexus-border-primary)' }}
      >
        <div className="flex-1 min-w-0">
          {activeProject ? (
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nexus-accent-blue)" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--nexus-text-primary)' }}>
                {activeProject.name}
              </span>
            </div>
          ) : (
            <span className="text-sm font-semibold" style={{ color: 'var(--nexus-text-tertiary)' }}>
              No project selected
            </span>
          )}
        </div>
        <button
          onClick={onAddProject}
          className="btn-ghost p-1 rounded flex-shrink-0"
          title="Add project"
          style={{ color: 'var(--nexus-text-tertiary)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Project switcher */}
      {projects.length > 1 && (
        <div className="flex gap-1 px-3 py-2 border-b flex-wrap items-center" style={{ borderColor: 'var(--nexus-border-primary)' }}>
          {projects.map(p => (
            <span
              key={p.id}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-all cursor-pointer group"
              style={{
                backgroundColor: activeProject?.id === p.id ? 'var(--nexus-bg-elevated)' : 'transparent',
                color: activeProject?.id === p.id ? 'var(--nexus-text-primary)' : 'var(--nexus-text-tertiary)',
              }}
              onClick={() => onSelectProject(p.id)}
            >
              {p.name}
              <button
                onClick={e => { e.stopPropagation(); onRemoveProject(p.id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 hover:text-[var(--nexus-status-error)]"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Sessions section */}
      {activeProject && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <button
            onClick={() => setSessionsOpen(!sessionsOpen)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--nexus-text-secondary)' }}
          >
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: sessionsOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Sessions
            <span style={{ color: 'var(--nexus-text-tertiary)', marginLeft: 4 }}>{sessions.length}</span>
            <div className="ml-auto flex gap-1">
              <button
                onClick={e => { e.stopPropagation(); onCreateSession(); }}
                className="btn-ghost p-0.5 rounded opacity-60 hover:opacity-100"
                title="New Session (Cmd+N)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </button>

          {sessionsOpen && (
            <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
              {sessions.length === 0 && (
                <div className="px-4 py-3 text-xs" style={{ color: 'var(--nexus-text-tertiary)' }}>
                  No sessions yet
                </div>
              )}
              {sessions.map(session => (
                <div
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className="group flex items-center gap-2 mx-2 rounded-md cursor-pointer transition-all"
                  style={{
                    padding: '5px 8px',
                    backgroundColor: activeSessionId === session.id ? 'var(--nexus-bg-elevated)' : 'transparent',
                    color: activeSessionId === session.id ? 'var(--nexus-text-primary)' : 'var(--nexus-text-secondary)',
                  }}
                  onMouseEnter={e => { if (activeSessionId !== session.id) e.currentTarget.style.backgroundColor = 'var(--nexus-bg-tertiary)'; }}
                  onMouseLeave={e => { if (activeSessionId !== session.id) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}>
                    <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                  </svg>
                  <span className="flex-1 truncate text-[13px]">{session.name}</span>
                  <button
                    onClick={e => { e.stopPropagation(); onDeleteSession(session.id); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                    style={{ color: 'var(--nexus-accent-red)' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--nexus-border-primary)' }} />

          {/* Files section */}
          <button
            onClick={() => setFilesOpen(!filesOpen)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--nexus-text-secondary)' }}
          >
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: filesOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Files
          </button>

          {filesOpen && (
            <div className="overflow-y-auto pb-2" style={{ flex: '1 1 0%', minHeight: 0 }}>
              {renderFileTree('', 0)}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

// ── FileView ──

function FileView({ file, content }: { file: { name: string; path: string }; content: string | null }) {
  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center gap-2 px-6 py-3 border-b"
        style={{ borderColor: 'var(--nexus-border-primary)', backgroundColor: 'var(--nexus-bg-secondary)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--nexus-accent-blue)' }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="text-sm font-medium" style={{ color: 'var(--nexus-text-primary)' }}>{file.name}</span>
        <span className="text-xs truncate" style={{ color: 'var(--nexus-text-tertiary)' }}>{file.path}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {content === null ? (
          <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--nexus-text-tertiary)' }}>Loading...</div>
        ) : (
          <pre className="text-sm leading-relaxed font-mono" style={{ color: 'var(--nexus-text-primary)', background: 'none', border: 'none', padding: 0, whiteSpace: 'pre-wrap' }}><code>{content}</code></pre>
        )}
      </div>
    </div>
  );
}

// ── StatusBar ──

function StatusBar({
  status,
  sessionCount,
  appVersion,
  apiKeyStatus,
  onSettings,
  projectName,
}: {
  status: string;
  sessionCount: number;
  appVersion: string;
  apiKeyStatus: 'configured' | 'missing' | 'loading';
  onSettings: () => void;
  projectName: string | null;
}) {
  const statusColor =
    status === 'streaming' ? 'var(--nexus-accent-green)' :
    status === 'error' ? 'var(--nexus-accent-red)' :
    'var(--nexus-text-tertiary)';

  const keyColor = apiKeyStatus === 'configured' ? 'var(--nexus-accent-green)' : 'var(--nexus-accent-orange)';

  return (
    <footer
      className="flex items-center justify-between px-4 h-6 text-xs border-t"
      style={{ backgroundColor: 'var(--nexus-bg-secondary)', borderColor: 'var(--nexus-border-primary)', color: 'var(--nexus-text-tertiary)' }}
    >
      <div className="flex items-center gap-3">
        <span style={{ color: statusColor }}>
          {status === 'idle' ? 'Ready' : status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
        <span style={{ color: keyColor }}>
          {apiKeyStatus === 'configured' ? 'API: Connected' : apiKeyStatus === 'loading' ? 'API: ...' : 'API: No key'}
        </span>
        {projectName && (
          <span className="hidden sm:inline">{projectName}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span>{sessionCount} session{sessionCount !== 1 ? 's' : ''}</span>
        <span>Nexus {appVersion}</span>
        <button
          onClick={onSettings}
          className="btn-ghost p-0.5 rounded opacity-60 hover:opacity-100 transition-opacity"
          title="Settings (Cmd+,)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </footer>
  );
}

// ── EmptyState ──

function EmptyState({ onCreate, projectName }: { onCreate: () => void; projectName: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 animate-fade-in px-8">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{
          background: 'var(--nexus-gradient-glass)',
          border: '1px solid var(--nexus-border-secondary)',
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--nexus-accent-blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
        </svg>
      </div>
      {projectName ? (
        <>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--nexus-text-primary)' }}>{projectName}</h2>
          <p className="text-sm text-center" style={{ color: 'var(--nexus-text-secondary)' }}>Start a session to chat with Nexus about this project</p>
          <button onClick={onCreate} className="btn-primary mt-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Session
          </button>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--nexus-text-primary)' }}>Welcome to Nexus</h2>
          <p className="text-sm text-center" style={{ color: 'var(--nexus-text-secondary)' }}>
            Add a project to get started
          </p>
          <div className="mt-4 flex gap-6 text-xs" style={{ color: 'var(--nexus-text-tertiary)' }}>
            <span>Cmd+N &mdash; New session</span>
            <span>Cmd+W &mdash; Close</span>
          </div>
        </>
      )}
    </div>
  );
}

// ── ChatView ──

function ChatView({
  messages,
  status,
  onSend,
  streamingContent,
}: {
  messages: NexusMessage[];
  status: string;
  onSend: (content: string) => void;
  streamingContent?: string;
}) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  useEffect(() => {
    if (status !== 'streaming') {
      inputRef.current?.focus();
    }
  }, [status, messages.length]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + 'px';
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!input.trim() || status === 'streaming') return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--nexus-text-tertiary)' }}>
            Send a message to start the conversation
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={msg.id || i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
              style={{
                backgroundColor: msg.role === 'user' ? 'var(--nexus-bg-elevated)' : 'var(--nexus-bg-secondary)',
                border: msg.role === 'user' ? '1px solid var(--nexus-border-focus)' : '1px solid var(--nexus-border-primary)',
                color: 'var(--nexus-text-primary)',
              }}
            >
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{messageContent(msg)}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {status === 'streaming' && streamingContent && (
          <div className="flex justify-start animate-fade-in">
            <div
              className="max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed rounded-bl-sm"
              style={{
                backgroundColor: 'var(--nexus-bg-secondary)',
                border: '1px solid var(--nexus-border-primary)',
                color: 'var(--nexus-text-primary)',
              }}
            >
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
              </div>
              <span className="inline-block w-1.5 h-4 ml-0.5 animate-pulse" style={{ backgroundColor: 'var(--nexus-accent-blue)' }} />
            </div>
          </div>
        )}
        {status === 'streaming' && !streamingContent && (
          <div className="flex justify-start animate-fade-in">
            <div className="card px-4 py-3">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--nexus-accent-blue)', animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--nexus-accent-blue)', animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--nexus-accent-blue)', animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-6 py-3 border-t" style={{ borderColor: 'var(--nexus-border-primary)' }}>
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Nexus to help with your code... (Shift+Enter for new line)"
            disabled={status === 'streaming'}
            rows={1}
            className="input resize-none overflow-y-auto"
            style={{ maxHeight: '150px' }}
          />
          <button type="button" onClick={() => handleSubmit()} disabled={!input.trim() || status === 'streaming'} className="btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SettingsModal ──

function SettingsModal({ onClose, onApiKeyChange }: { onClose: () => void; onApiKeyChange?: () => void }) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [approvalLevel, setApprovalLevel] = useState('ask');
  const [maxIterations, setMaxIterations] = useState(50);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const onCloseRef = useRef(onClose);
  const onApiKeyChangeRef = useRef(onApiKeyChange);
  onCloseRef.current = onClose;
  onApiKeyChangeRef.current = onApiKeyChange;

  useEffect(() => {
    invoke('get_config').then((config: any) => {
      if (config) {
        setApiKey(config.apiKey ?? '');
        setModel(config.model ?? 'auto');
        setApprovalLevel(config.approvalLevel ?? 'ask');
        setMaxIterations(config.maxIterations ?? 50);
      }
    }).catch(() => {});
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleSave = async () => {
    try {
      await invoke('save_settings', {
        apiKey,
        model,
        approvalLevel,
        maxIterations: Number(maxIterations),
      });
      setSaved(true);
      onApiKeyChangeRef.current?.();
      setTimeout(() => onCloseRef.current(), 1200);
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl border animate-scale-in"
        style={{
          backgroundColor: 'var(--nexus-bg-secondary)',
          borderColor: 'var(--nexus-border-primary)',
        }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--nexus-border-primary)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--nexus-text-primary)' }}>Settings</h2>
          <button onClick={onClose} className="btn-ghost p-1 rounded">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* API Keys */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--nexus-text-secondary)' }}>API Keys</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--nexus-text-secondary)' }}>
                  OpenRouter API Key
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="sk-or-v1-..."
                    className="input w-full pr-8 text-xs"
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded opacity-50 hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--nexus-text-tertiary)' }}
                  >
                    {showKey ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="text-[10px] mt-1" style={{ color: 'var(--nexus-text-tertiary)' }}>
                  Get one at <button onClick={() => openUrl('https://openrouter.ai/keys')} className="underline" style={{ color: 'var(--nexus-accent-blue)' }}>openrouter.ai/keys</button>
                </p>
              </div>
            </div>
          </div>

          {/* Model */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--nexus-text-secondary)' }}>Model</h3>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="input w-full text-xs"
            >
              <option value="auto">Auto (best available)</option>
              <option value="anthropic/claude-sonnet-4-20250514">Claude Sonnet 4</option>
              <option value="anthropic/claude-3.5-haiku">Claude 3.5 Haiku</option>
              <option value="openai/gpt-4o">GPT-4o</option>
              <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
              <option value="google/gemini-2.5-pro-exp-03-25">Gemini 2.5 Pro</option>
              <option value="deepseek/deepseek-chat">DeepSeek Chat</option>
              <option value="qwen/qwq-32b">QwQ 32B</option>
            </select>
          </div>

          {/* Permissions */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--nexus-text-secondary)' }}>Permissions</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--nexus-text-secondary)' }}>
                  Approval Level
                </label>
                <select
                  value={approvalLevel}
                  onChange={e => setApprovalLevel(e.target.value)}
                  className="input w-full text-xs"
                >
                  <option value="ask">Ask for approval</option>
                  <option value="auto">Auto-approve</option>
                  <option value="strict">Strict (ask for everything)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--nexus-text-secondary)' }}>
                  Max Iterations
                </label>
                <input
                  type="number"
                  value={maxIterations}
                  onChange={e => setMaxIterations(parseInt(e.target.value) || 50)}
                  min={1}
                  max={200}
                  className="input w-full text-xs"
                />
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--nexus-text-secondary)' }}>Appearance</h3>
            <p className="text-xs" style={{ color: 'var(--nexus-text-tertiary)' }}>
              Theme is managed via the system theme preference.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: 'var(--nexus-border-primary)' }}>
          {saved && (
            <span className="text-xs animate-fade-in" style={{ color: 'var(--nexus-accent-green)' }}>
              Saved
            </span>
          )}
          <button onClick={onClose} className="btn-ghost text-xs px-3 py-1.5">
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary text-xs px-3 py-1.5">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AddProjectModal ──

function AddProjectModal({ onClose, onAdd }: { onClose: () => void; onAdd: (path: string) => void }) {
  const [path, setPath] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleBrowse = async () => {
    const result = await pickFolder();
    if (result) {
      setPath(result);
      setError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim()) {
      setError('Please enter or browse for a path');
      return;
    }
    setError('');
    onAdd(path.trim());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-xl shadow-2xl border animate-scale-in"
        style={{
          backgroundColor: 'var(--nexus-bg-secondary)',
          borderColor: 'var(--nexus-border-primary)',
        }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--nexus-border-primary)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--nexus-text-primary)' }}>Add Project</h2>
          <button onClick={onClose} className="btn-ghost p-1 rounded">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--nexus-text-secondary)' }}>
              Project directory
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={path}
                onChange={e => { setPath(e.target.value); setError(''); }}
                placeholder="/Users/name/projects/my-app"
                className="input flex-1 text-xs"
                autoFocus
              />
              <button
                type="button"
                onClick={handleBrowse}
                className="btn-ghost text-xs px-3 py-1.5 flex-shrink-0"
                style={{ border: '1px solid var(--nexus-border-primary)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                Browse
              </button>
            </div>
            {error && <p className="text-xs mt-1" style={{ color: 'var(--nexus-accent-red)' }}>{error}</p>}
            <p className="text-[10px] mt-1" style={{ color: 'var(--nexus-text-tertiary)' }}>
              Select a project folder or type the path manually
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-ghost text-xs px-3 py-1.5">
              Cancel
            </button>
            <button type="submit" className="btn-primary text-xs px-3 py-1.5">
              Add Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── DiffViewer ──

function DiffViewer({ diff, filename, onClose }: { diff: string | null; filename?: string; onClose: () => void }) {
  if (!diff) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 animate-fade-in">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--nexus-text-tertiary)" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
        </svg>
        <p className="text-sm" style={{ color: 'var(--nexus-text-tertiary)' }}>No changes to show</p>
        <button onClick={onClose} className="btn-ghost text-xs px-3 py-1.5">Back</button>
      </div>
    );
  }

  const lines = diff.split('\n');

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between px-6 py-3 border-b"
        style={{ borderColor: 'var(--nexus-border-primary)', backgroundColor: 'var(--nexus-bg-secondary)' }}
      >
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nexus-accent-green)" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="text-sm font-medium" style={{ color: 'var(--nexus-text-primary)' }}>
            {filename || 'Changes'}
          </span>
          <span className="text-xs" style={{ color: 'var(--nexus-text-tertiary)' }}>
            {lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length} added / {lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length} removed
          </span>
        </div>
        <button onClick={onClose} className="btn-ghost p-1 rounded">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <pre className="text-xs leading-relaxed font-mono" style={{ tabSize: 2 }}>
          {lines.map((line, i) => {
            let bg = 'transparent';
            let color = 'var(--nexus-text-secondary)';
            if (line.startsWith('+')) { bg = 'rgba(34,197,94,0.1)'; color = 'var(--nexus-accent-green)'; }
            if (line.startsWith('-')) { bg = 'rgba(239,68,68,0.1)'; color = 'var(--nexus-accent-red)'; }
            if (line.startsWith('@@')) { bg = 'rgba(59,130,246,0.1)'; color = 'var(--nexus-accent-blue)'; }
            return (
              <div key={i} style={{ backgroundColor: bg, color, padding: '0 32px', whiteSpace: 'pre-wrap' }}>
                {line}
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}

// ── CommandPalette ──

const COMMANDS = [
  { id: 'new-session', label: 'New Session', shortcut: 'Cmd+N', icon: 'message' },
  { id: 'settings', label: 'Settings', shortcut: 'Cmd+,', icon: 'settings' },
  { id: 'add-project', label: 'Add Project', shortcut: '', icon: 'folder' },
  { id: 'close-session', label: 'Close Session', shortcut: 'Cmd+W', icon: 'x' },
  { id: 'view-diff', label: 'View Changes', shortcut: '', icon: 'diff' },
] as const;

function CommandPalette({ onClose, onRun }: { onClose: () => void; onRun: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = COMMANDS.filter(c =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    inputRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
      if (e.key === 'Enter') { e.preventDefault(); if (results[selectedIdx]) onRun(results[selectedIdx].id); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, results, selectedIdx, onRun]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl border overflow-hidden animate-scale-in"
        style={{
          backgroundColor: 'var(--nexus-bg-secondary)',
          borderColor: 'var(--nexus-border-primary)',
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--nexus-border-primary)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nexus-text-tertiary)" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIdx(0); }}
            placeholder="Search commands..."
            className="flex-1 bg-transparent border-none outline-none text-sm"
            style={{ color: 'var(--nexus-text-primary)' }}
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {results.length === 0 && (
            <div className="px-4 py-6 text-xs text-center" style={{ color: 'var(--nexus-text-tertiary)' }}>
              No commands found
            </div>
          )}
          {results.map((cmd, i) => (
            <button
              key={cmd.id}
              onClick={() => onRun(cmd.id)}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left transition-colors"
              style={{
                backgroundColor: i === selectedIdx ? 'var(--nexus-bg-tertiary)' : 'transparent',
                color: 'var(--nexus-text-primary)',
              }}
            >
              <span className="w-4 h-4 flex items-center justify-center" style={{ color: 'var(--nexus-text-tertiary)' }}>
                {cmd.icon === 'message' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
                {cmd.icon === 'settings' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>}
                {cmd.icon === 'folder' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>}
                {cmd.icon === 'x' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>}
                {cmd.icon === 'diff' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>}
              </span>
              <span className="flex-1">{cmd.label}</span>
              {cmd.shortcut && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: 'var(--nexus-bg-tertiary)', color: 'var(--nexus-text-tertiary)' }}>
                  {cmd.shortcut}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── ToastContainer ──

function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-8 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg border text-xs animate-slide-up pointer-events-auto max-w-sm"
          style={{
            backgroundColor: t.type === 'error' ? '#3b1515' : t.type === 'success' ? '#153b1a' : '#1a1a2e',
            borderColor: t.type === 'error' ? 'rgba(239,68,68,0.3)' : t.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(59,130,246,0.3)',
            color: t.type === 'error' ? '#fca5a5' : t.type === 'success' ? '#86efac' : '#93c5fd',
          }}
        >
          {t.type === 'success' && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {t.type === 'error' && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          )}
          {t.type === 'info' && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          )}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => removeToast(t.id)} className="opacity-50 hover:opacity-100">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

// ── AppShell ──

function AppShell() {
  const projectsManager = useProjects();
  const activeProject = projectsManager.activeProject;
  const projectId = activeProject?.id || null;

  const nexus = useNexus(projectId);
  const { theme } = useTheme();
  const { addToast } = useToast();

  const [mainView, setMainView] = useState<'chat' | 'file'>('chat');
  const [appVersion, setAppVersion] = useState('1.1.0');
  const [apiKeyStatus, setApiKeyStatus] = useState<'configured' | 'missing' | 'loading'>('loading');
  const [showSettings, setShowSettings] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [fullDiff, setFullDiff] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [sidebarFile, setSidebarFile] = useState<ProjectFile | null>(null);
  const [sidebarFileContent, setSidebarFileContent] = useState<string | null>(null);

  const handleSidebarFileSelect = useCallback((file: ProjectFile | null, content: string | null) => {
    setSidebarFile(file);
    setSidebarFileContent(content);
    if (file && !file.is_dir) setMainView('file');
    else setMainView('chat');
  }, []);

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

  // Check API key status
  useEffect(() => {
    if (!isTauri()) { setApiKeyStatus('missing'); return; }
    invoke('get_config')
      .then((config: any) => {
        setApiKeyStatus(config?.apiKey ? 'configured' : 'missing');
      })
      .catch(() => setApiKeyStatus('missing'));
  }, [showSettings]);

  // Update view when session changes
  useEffect(() => {
    if (!nexus.activeSessionId && !sidebarFile) {
      setMainView('chat');
    }
  }, [nexus.activeSessionId, sidebarFile]);

  const handleCreateSession = useCallback(() => {
    const name = `Session ${nexus.sessions.length + 1}`;
    nexus.createSession(name);
    addToast('success', `Created "${name}"`);
  }, [nexus, addToast]);

  const handleAddProject = useCallback(async (path: string) => {
    try {
      await projectsManager.addProject(path);
      setShowAddProject(false);
      addToast('success', 'Project added');
    } catch (e) {
      addToast('error', String(e));
    }
  }, [projectsManager, addToast]);

  const handleRemoveProject = useCallback(async (id: string) => {
    try {
      await projectsManager.removeProject(id);
      addToast('success', 'Project removed');
    } catch (e) {
      addToast('error', String(e));
    }
  }, [projectsManager, addToast]);

  // Show toasts for errors
  useEffect(() => {
    if (nexus.error) {
      addToast('error', nexus.error);
      nexus.clearError();
    }
  }, [nexus.error, addToast]);

  const loadDiff = useCallback(async () => {
    if (!projectId || !isTauri()) return;
    setDiffLoading(true);
    try {
      const d = await invoke<string>('get_full_project_diff', { projectId });
      setFullDiff(d || '');
    } catch {
      setFullDiff('');
    }
    setDiffLoading(false);
  }, [projectId]);

  const handleCommand = useCallback((cmdId: string) => {
    setShowCommandPalette(false);
    switch (cmdId) {
      case 'new-session': handleCreateSession(); break;
      case 'settings': setShowSettings(true); break;
      case 'add-project': setShowAddProject(true); break;
      case 'close-session':
        if (sidebarFile) { handleSidebarFileSelect(null, null); setMainView('chat'); }
        else if (nexus.activeSessionId) { nexus.deleteSession(nexus.activeSessionId); addToast('info', 'Session closed'); }
        break;
      case 'view-diff': setShowDiff(true); loadDiff(); break;
    }
  }, [handleCreateSession, nexus, loadDiff, addToast, sidebarFile, handleSidebarFileSelect]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'k') { e.preventDefault(); setShowCommandPalette(true); }
      else if (meta && e.key === ',') { e.preventDefault(); setShowSettings(true); }
      else if (meta && e.key === 'n') { e.preventDefault(); handleCreateSession(); }
      else if (meta && e.key === 'w') {
        e.preventDefault();
        if (nexus.activeSessionId) nexus.deleteSession(nexus.activeSessionId);
      }
      else if (e.key === 'Escape' && sidebarFile) {
        e.preventDefault();
        handleSidebarFileSelect(null, null);
        setMainView('chat');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCreateSession, nexus, sidebarFile, handleSidebarFileSelect]);

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--nexus-bg-primary)' }}>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          projects={projectsManager.projects}
          activeProject={activeProject}
          sessions={nexus.sessions}
          activeSessionId={nexus.activeSessionId}
          onSelectSession={nexus.selectSession}
          onCreateSession={handleCreateSession}
          onDeleteSession={nexus.deleteSession}
          onAddProject={() => setShowAddProject(true)}
          onSelectProject={(id) => { projectsManager.selectProject(id); }}
          onRemoveProject={handleRemoveProject}
          onFileSelect={handleSidebarFileSelect}
          selectedFile={sidebarFile}
          fileContent={sidebarFileContent}
        />

        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar with changes button */}
          {activeProject && (
            <div
              className="flex items-center justify-end gap-2 px-4 py-1.5 border-b"
              style={{ borderColor: 'var(--nexus-border-primary)', backgroundColor: 'var(--nexus-bg-secondary)' }}
            >
              <button
                onClick={() => { setShowDiff(!showDiff); if (!showDiff) loadDiff(); }}
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors"
                style={{
                  color: 'var(--nexus-text-secondary)',
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--nexus-bg-tertiary)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Changes
              </button>
            </div>
          )}

          {showDiff ? (
            diffLoading ? (
              <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--nexus-text-tertiary)' }}>Loading changes...</div>
            ) : (
              <DiffViewer diff={fullDiff} onClose={() => setShowDiff(false)} filename={`${activeProject?.name || 'Project'} changes`} />
            )
          ) : mainView === 'file' && sidebarFile ? (
            <FileView file={sidebarFile} content={sidebarFileContent} />
          ) : !nexus.activeSessionId ? (
            <EmptyState onCreate={handleCreateSession} projectName={activeProject?.name || null} />
          ) : (
            <ChatView messages={nexus.messages} status={nexus.status} onSend={nexus.sendMessage} streamingContent={nexus.streamingContent} />
          )}
        </main>
      </div>

      <StatusBar
        status={nexus.status}
        sessionCount={nexus.sessions.length}
        appVersion={appVersion}
        apiKeyStatus={apiKeyStatus}
        onSettings={() => setShowSettings(true)}
        projectName={activeProject?.name || null}
      />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onApiKeyChange={() => setApiKeyStatus('loading')} />}
      {showAddProject && <AddProjectModal onClose={() => setShowAddProject(false)} onAdd={handleAddProject} />}
      {showCommandPalette && <CommandPalette onClose={() => setShowCommandPalette(false)} onRun={handleCommand} />}
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </ThemeProvider>
  );
}
