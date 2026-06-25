import { useState, useCallback, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useProjects } from './hooks/use-projects';
import { useNexus } from './hooks/use-nexus';
import { useToast, ToastProvider } from './hooks/use-toast';
import { isTauri, invoke, pickFolder, type FileEntry } from './lib/tauri';
import type { Session, Message as NexusMessage } from './lib/tauri';

interface ProjectFile {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

// ── Helpers ──

function msgContent(msg: NexusMessage): string {
  return msg.content ?? '';
}

function timeStr(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// ── Status Bar ──

function StatusBar({ status, error, model, tokens }: { status: string; error: string | null; model: string; tokens?: { input: number; output: number } }) {
  const statusColor = status === 'streaming' ? 'var(--nexus-accent-blue)' : status === 'error' ? 'var(--nexus-status-error)' : 'var(--nexus-text-tertiary)';
  const cost = tokens ? ((tokens.input * 0.15 + tokens.output * 0.60) / 1_000_000).toFixed(4) : null;
  return (
    <div className="flex items-center justify-between px-4 py-1.5 text-[11px] border-t" style={{ borderColor: 'var(--nexus-border-primary)', color: 'var(--nexus-text-tertiary)' }}>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor, animation: status === 'streaming' ? 'pulse 1s infinite' : 'none' }} />
          {status === 'streaming' ? 'Generating...' : status === 'error' ? 'Error' : 'Ready'}
        </span>
        {error && <span style={{ color: 'var(--nexus-status-error)' }}>{error}</span>}
      </div>
      <div className="flex items-center gap-3">
        {cost && <span style={{ color: 'var(--nexus-accent-orange)' }}>${cost}</span>}
        <span>{model}</span>
      </div>
    </div>
  );
}

// ── Tool Call Badge ──

function ToolBadge({ tool, args }: { tool: string; args: Record<string, unknown> }) {
  const labels: Record<string, string> = { write: 'Write', read: 'Read', edit: 'Edit', bash: 'Bash', glob: 'Glob', grep: 'Grep' };
  const label = labels[tool] || tool;
  const detail = tool === 'bash' ? String(args.command || '').slice(0, 40) : tool === 'write' ? String(args.file_path || '') : tool === 'read' ? String(args.file_path || '') : '';
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono mb-1" style={{ backgroundColor: 'var(--nexus-bg-tertiary)', color: 'var(--nexus-accent-blue)', border: '1px solid var(--nexus-border-primary)' }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
      <span>{label}</span>
      {detail && <span style={{ color: 'var(--nexus-text-tertiary)' }}>{detail}</span>}
    </div>
  );
}

// ── Message Bubble ──

function MessageBubble({ msg, isLast }: { msg: NexusMessage; isLast: boolean }) {
  const isUser = msg.role === 'user';
  const content = msgContent(msg);
  const hasToolCalls = !isUser && (msg as any).toolCalls?.length > 0;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${isLast ? '' : 'mb-3'}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center mr-2 flex-shrink-0 mt-0.5" style={{ background: 'var(--nexus-gradient-primary)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        </div>
      )}
      <div className={`max-w-[85%] ${isUser ? '' : 'w-full'}`}>
        {hasToolCalls && (msg as any).toolCalls.map((tc: any) => (
          <ToolBadge key={tc.id} tool={tc.tool} args={tc.arguments || {}} />
        ))}
        {content && (
          <div
            className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${isUser ? 'rounded-br-md' : 'rounded-bl-md'}`}
            style={{
              backgroundColor: isUser ? 'var(--nexus-accent-blue)' : 'var(--nexus-bg-secondary)',
              color: isUser ? 'white' : 'var(--nexus-text-primary)',
              border: isUser ? 'none' : '1px solid var(--nexus-border-primary)',
            }}
          >
            {isUser ? (
              <div className="whitespace-pre-wrap">{content}</div>
            ) : (
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            )}
          </div>
        )}
        <div className={`text-[10px] mt-1 px-1 ${isUser ? 'text-right' : 'text-left'}`} style={{ color: 'var(--nexus-text-tertiary)' }}>
          {timeStr(msg.timestamp)}
        </div>
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center ml-2 flex-shrink-0 mt-0.5" style={{ backgroundColor: 'var(--nexus-bg-elevated)', border: '1px solid var(--nexus-border-primary)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nexus-text-secondary)" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
      )}
    </div>
  );
}

// ── Streaming Indicator ──

function StreamingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center mr-2 flex-shrink-0 mt-0.5" style={{ background: 'var(--nexus-gradient-primary)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
      </div>
      <div className="rounded-2xl rounded-bl-md px-4 py-3" style={{ backgroundColor: 'var(--nexus-bg-secondary)', border: '1px solid var(--nexus-border-primary)' }}>
        <div className="flex gap-1.5">
          <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--nexus-accent-blue)', animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--nexus-accent-blue)', animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--nexus-accent-blue)', animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

// ── Chat View ──

function ChatView({ messages, status, onSend, streamingContent }: {
  messages: NexusMessage[];
  status: string;
  onSend: (content: string) => void;
  streamingContent?: string;
}) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamingContent]);

  useEffect(() => {
    if (status !== 'streaming') inputRef.current?.focus();
  }, [status, messages.length]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + 'px';
    }
  }, [input]);

  const handleSubmit = () => {
    if (!input.trim() || status === 'streaming') return;
    onSend(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
        {messages.length === 0 && status !== 'streaming' && (
          <div className="flex flex-col items-center justify-center h-full text-center" style={{ color: 'var(--nexus-text-tertiary)' }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--nexus-gradient-primary)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--nexus-text-secondary)' }}>Nexus AI</p>
            <p className="text-xs max-w-xs">Ask me to build, debug, or refactor your code. I have full access to your project files.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={msg.id || i} msg={msg} isLast={i === messages.length - 1 && status !== 'streaming'} />
        ))}
        {status === 'streaming' && streamingContent && (
          <div className="flex justify-start mb-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center mr-2 flex-shrink-0 mt-0.5" style={{ background: 'var(--nexus-gradient-primary)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 text-[13px] leading-relaxed" style={{ backgroundColor: 'var(--nexus-bg-secondary)', border: '1px solid var(--nexus-border-primary)' }}>
              <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown></div>
            </div>
          </div>
        )}
        {status === 'streaming' && !streamingContent && <StreamingIndicator />}
      </div>

      <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--nexus-border-primary)' }}>
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Nexus to help with your code... (Shift+Enter for newline)"
              disabled={status === 'streaming'}
              rows={1}
              className="w-full rounded-xl px-4 py-3 text-[13px] resize-none outline-none transition-all"
              style={{
                backgroundColor: 'var(--nexus-bg-secondary)',
                border: '1px solid var(--nexus-border-primary)',
                color: 'var(--nexus-text-primary)',
                maxHeight: '150px',
              }}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || status === 'streaming'}
            className="rounded-xl p-3 transition-all disabled:opacity-30"
            style={{ background: 'var(--nexus-accent-blue)', color: 'white' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── File Tree ──

function FileTree({ files, expanded, loading, onToggle, onSelect, selectedPath, depth = 0, projectId }: {
  files: ProjectFile[]; expanded: Set<string>; loading: Set<string>;
  onToggle: (dir: string) => void; onSelect: (file: ProjectFile) => void; selectedPath?: string; depth?: number; projectId?: string;
}) {
  return (
    <div>
      {files.map(file => (
        <div key={file.path}>
          <div
            className="flex items-center gap-1.5 cursor-pointer text-[11px] rounded-md mx-2 transition-all"
            style={{
              paddingLeft: 8 + depth * 14,
              paddingTop: 3, paddingBottom: 3,
              backgroundColor: selectedPath === file.path ? 'var(--nexus-bg-elevated)' : 'transparent',
              color: selectedPath === file.path ? 'var(--nexus-text-primary)' : 'var(--nexus-text-secondary)',
            }}
            onClick={() => file.is_dir ? onToggle(file.path) : onSelect(file)}
          >
            {file.is_dir ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: expanded.has(file.path) ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', color: 'var(--nexus-text-tertiary)', flexShrink: 0 }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--nexus-accent-purple)', flexShrink: 0 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
            )}
            <span className="truncate flex-1">{file.name}</span>
            {loading.has(file.path) && <span className="w-2.5 h-2.5 rounded-full animate-spin" style={{ border: '1.5px solid var(--nexus-border-primary)', borderTopColor: 'var(--nexus-accent-blue)' }} />}
          </div>
          {file.is_dir && expanded.has(file.path) && (
            <FileTreeWrapper dir={file.path} projectId={projectId || ''} expanded={expanded} loading={loading} onToggle={onToggle} onSelect={onSelect} selectedPath={selectedPath} depth={depth + 1} />
          )}
        </div>
      ))}
    </div>
  );
}

function FileTreeWrapper({ dir, projectId, ...props }: { dir: string; projectId: string } & Omit<React.ComponentProps<typeof FileTree>, 'files'>) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isTauri() || !projectId) { setLoaded(true); return; }
    invoke<FileEntry[]>('list_project_files', { projectId, dir }).then(entries => {
      setFiles(entries.map(e => ({ name: e.name, path: e.path, is_dir: e.is_dir, size: e.size })));
      setLoaded(true);
    }).catch(() => { setFiles([]); setLoaded(true); });
  }, [dir, projectId]);

  if (!loaded && props.expanded.has(dir)) return <div className="px-4 py-1 text-[10px]" style={{ color: 'var(--nexus-text-tertiary)' }}>Loading...</div>;
  return <FileTree files={files} {...props} />;
}

// ── Sidebar ──

function Sidebar({ projects, activeProject, sessions, activeSessionId, onSelectSession, onCreateSession, onDeleteSession, onAddProject, onSelectProject, onRemoveProject, onFileSelect, selectedFile }: {
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
      const entries = await invoke<FileEntry[]>('list_project_files', { projectId: activeProject.id, dir });
      setDirContents(prev => ({ ...prev, [dir]: entries.map(e => ({ name: e.name, path: e.path, is_dir: e.is_dir, size: e.size })) }));
    } catch { setDirContents(prev => ({ ...prev, [dir]: [] })); }
    setDirLoading(prev => { const n = new Set(prev); n.delete(dir); return n; });
  }, [activeProject]);

  useEffect(() => {
    setExpandedDirs(new Set());
    setDirContents({});
    if (activeProject) loadDir('');
  }, [activeProject?.id, loadDir]);

  const toggleDir = useCallback((dir: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else { next.add(dir); if (!dirContents[dir]) loadDir(dir); }
      return next;
    });
  }, [loadDir, dirContents]);

  const selectFile = useCallback(async (file: ProjectFile) => {
    onFileSelect(file, null);
    if (!file.is_dir && isTauri() && activeProject) {
      try {
        const content = await invoke<string>('read_project_file', { projectId: activeProject.id, filePath: file.path });
        onFileSelect(file, content);
      } catch { onFileSelect(file, '// Error reading file'); }
    }
  }, [activeProject, onFileSelect]);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--nexus-bg-primary)' }}>
      {/* Project Switcher - always visible if multiple projects */}
      {projects.length > 1 && (
        <div className="flex gap-1 px-3 py-2 border-b flex-wrap items-center" style={{ borderColor: 'var(--nexus-border-primary)' }}>
          {projects.map(p => (
            <span key={p.id} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md transition-all cursor-pointer group" style={{
              backgroundColor: activeProject?.id === p.id ? 'var(--nexus-accent-blue)' : 'var(--nexus-bg-secondary)',
              color: activeProject?.id === p.id ? 'white' : 'var(--nexus-text-tertiary)',
              border: '1px solid ' + (activeProject?.id === p.id ? 'var(--nexus-accent-blue)' : 'var(--nexus-border-primary)'),
            }} onClick={() => onSelectProject(p.id)}>
              {p.name}
              <button onClick={e => { e.stopPropagation(); onRemoveProject(p.id); }} className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 hover:text-red-400">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto">
        {activeProject && (
          <>
            <button onClick={() => setSessionsOpen(!sessionsOpen)} className="flex items-center gap-2 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-all w-full" style={{ color: 'var(--nexus-text-secondary)' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: sessionsOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              Sessions
              <span className="ml-auto text-[10px] font-normal px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--nexus-bg-secondary)', color: 'var(--nexus-text-tertiary)' }}>{sessions.length}</span>
            </button>
            {sessionsOpen && (
              <div className="pb-2">
                {sessions.map(s => (
                  <div key={s.id} className="flex items-center gap-1 px-2 mx-2 rounded-md cursor-pointer transition-all group" style={{
                    backgroundColor: activeSessionId === s.id ? 'var(--nexus-bg-elevated)' : 'transparent',
                    color: activeSessionId === s.id ? 'var(--nexus-text-primary)' : 'var(--nexus-text-secondary)',
                    padding: '6px 8px',
                  }} onClick={() => onSelectSession(s.id)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: activeSessionId === s.id ? 'var(--nexus-accent-blue)' : 'var(--nexus-text-tertiary)' }}>
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span className="truncate flex-1 text-[11px]">{s.name}</span>
                    <button onClick={e => { e.stopPropagation(); onDeleteSession(s.id); }} className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ))}
                <button onClick={onCreateSession} className="flex items-center gap-1.5 px-4 mx-2 mt-1 text-[11px] rounded-md transition-all" style={{ color: 'var(--nexus-accent-blue)', border: '1px dashed var(--nexus-border-primary)', padding: '5px 8px' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  New Session
                </button>
              </div>
            )}

            <button onClick={() => setFilesOpen(!filesOpen)} className="flex items-center gap-2 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-all w-full" style={{ color: 'var(--nexus-text-secondary)', borderTop: '1px solid var(--nexus-border-primary)' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: filesOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              Files
            </button>
            {filesOpen && activeProject && (
              <div className="py-1">
                <FileTree
                  files={dirContents[''] || []}
                  expanded={expandedDirs}
                  loading={dirLoading}
                  onToggle={toggleDir}
                  onSelect={selectFile}
                  selectedPath={selectedFile?.path}
                  projectId={activeProject.id}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer - always visible */}
      <div className="flex items-center justify-between px-3 py-2 border-t" style={{ borderColor: 'var(--nexus-border-primary)', backgroundColor: 'var(--nexus-bg-primary)' }}>
        <button onClick={() => onAddProject()} className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md transition-all" style={{ color: 'var(--nexus-accent-blue)', backgroundColor: 'var(--nexus-bg-secondary)', border: '1px solid var(--nexus-border-primary)' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Project
        </button>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--nexus-accent-green)' }} />
          <span className="text-[10px]" style={{ color: 'var(--nexus-text-tertiary)' }}>Ready</span>
        </div>
      </div>
    </div>
  );
}

// ── Add Project Modal ──

function AddProjectModal({ onAdd, onClose }: { onAdd: (path: string) => void; onClose: () => void }) {
  const [path, setPath] = useState('');
  const [error, setError] = useState('');

  const handleBrowse = async () => {
    const result = await pickFolder();
    if (result) { setPath(result); setError(''); }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim()) { setError('Please select a folder'); return; }
    onAdd(path.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl border animate-scale-in" style={{ backgroundColor: 'var(--nexus-bg-secondary)', borderColor: 'var(--nexus-border-primary)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--nexus-border-primary)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--nexus-text-primary)' }}>Add Project</h2>
          <button onClick={onClose} className="p-1 rounded-lg transition-all hover:bg-[var(--nexus-bg-tertiary)]" style={{ color: 'var(--nexus-text-tertiary)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--nexus-text-secondary)' }}>Project directory</label>
            <div className="flex gap-2">
              <input type="text" value={path} onChange={e => { setPath(e.target.value); setError(''); }} placeholder="/Users/name/projects/my-app" className="flex-1 rounded-lg px-3 py-2 text-xs outline-none" style={{ backgroundColor: 'var(--nexus-bg-primary)', border: '1px solid var(--nexus-border-primary)', color: 'var(--nexus-text-primary)' }} autoFocus />
              <button type="button" onClick={handleBrowse} className="rounded-lg px-3 py-2 text-xs font-medium transition-all" style={{ backgroundColor: 'var(--nexus-bg-tertiary)', border: '1px solid var(--nexus-border-primary)', color: 'var(--nexus-text-secondary)' }}>
                Browse
              </button>
            </div>
            {error && <p className="text-[11px] mt-1.5" style={{ color: 'var(--nexus-status-error)' }}>{error}</p>}
          </div>
          <button type="submit" className="w-full rounded-lg py-2.5 text-xs font-semibold transition-all" style={{ background: 'var(--nexus-accent-blue)', color: 'white' }}>
            Add Project
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Settings Modal ──

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('openai/gpt-4o-mini');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    if (!isTauri()) return;
    invoke('get_config').then((c: any) => {
      if (c?.apiKey) setApiKey(c.apiKey);
      if (c?.model) setModel(c.model);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!isTauri()) return;
    setStatus('saving');
    try {
      await invoke('save_settings', { api_key: apiKey, model });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch { setStatus('idle'); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl border animate-scale-in" style={{ backgroundColor: 'var(--nexus-bg-secondary)', borderColor: 'var(--nexus-border-primary)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--nexus-border-primary)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--nexus-text-primary)' }}>Settings</h2>
          <button onClick={onClose} className="p-1 rounded-lg transition-all hover:bg-[var(--nexus-bg-tertiary)]" style={{ color: 'var(--nexus-text-tertiary)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--nexus-text-secondary)' }}>OpenRouter API Key</label>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-or-v1-..." className="w-full rounded-lg px-3 py-2 text-xs outline-none" style={{ backgroundColor: 'var(--nexus-bg-primary)', border: '1px solid var(--nexus-border-primary)', color: 'var(--nexus-text-primary)' }} />
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--nexus-text-secondary)' }}>Model</label>
            <select value={model} onChange={e => setModel(e.target.value)} className="w-full rounded-lg px-3 py-2 text-xs outline-none" style={{ backgroundColor: 'var(--nexus-bg-primary)', border: '1px solid var(--nexus-border-primary)', color: 'var(--nexus-text-primary)' }}>
              <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
              <option value="google/gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
              <option value="openrouter/auto">Auto (OpenRouter)</option>
            </select>
          </div>
          <button onClick={handleSave} disabled={status === 'saving'} className="w-full rounded-lg py-2.5 text-xs font-semibold transition-all disabled:opacity-50" style={{ background: 'var(--nexus-accent-blue)', color: 'white' }}>
            {status === 'saved' ? '✓ Saved' : status === 'saving' ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Command Palette ──

function CommandPalette({ commands, onSelect, onClose }: { commands: { id: string; label: string; icon?: string }[]; onSelect: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && filtered[selected]) { onSelect(filtered[selected].id); }
    else if (e.key === 'Escape') { onClose(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl border overflow-hidden animate-scale-in" style={{ backgroundColor: 'var(--nexus-bg-secondary)', borderColor: 'var(--nexus-border-primary)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--nexus-border-primary)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nexus-text-tertiary)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input ref={inputRef} type="text" value={query} onChange={e => { setQuery(e.target.value); setSelected(0); }} onKeyDown={handleKeyDown} placeholder="Type a command..." className="flex-1 bg-transparent text-sm outline-none" style={{ color: 'var(--nexus-text-primary)' }} />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.map((cmd, i) => (
            <button key={cmd.id} className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all" style={{ backgroundColor: i === selected ? 'var(--nexus-bg-elevated)' : 'transparent', color: 'var(--nexus-text-primary)' }} onClick={() => onSelect(cmd.id)} onMouseEnter={() => setSelected(i)}>
              {cmd.icon === 'folder' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nexus-accent-blue)" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>}
              {cmd.icon === 'settings' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nexus-accent-orange)" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>}
              {cmd.icon === 'plus' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nexus-accent-green)" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}
              {cmd.icon === 'close' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nexus-accent-red)" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
              <span className="text-[13px]">{cmd.label}</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--nexus-text-tertiary)' }}>No commands found</div>}
        </div>
      </div>
    </div>
  );
}

// ── Toast Container ──

function ToastContainer({ toasts, onDismiss }: { toasts: { id: string; type: string; message: string }[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id} className="flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-[12px] toast-enter" style={{
          backgroundColor: t.type === 'error' ? 'var(--nexus-status-error)' : t.type === 'success' ? 'var(--nexus-accent-green)' : 'var(--nexus-accent-blue)',
          color: 'white',
        }}>
          <span>{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="ml-2 opacity-60 hover:opacity-100">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Diff Viewer ──

function DiffViewer({ projectPath, onClose }: { projectPath: string; onClose: () => void }) {
  const [diff, setDiff] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isTauri()) return;
    invoke<string>('get_full_project_diff', { projectId: projectPath }).then(d => {
      setDiff(d);
      setLoading(false);
    }).catch(() => { setDiff('No diff available (not a git repo or no changes)'); setLoading(false); });
  }, [projectPath]);

  const lines = diff.split('\n');

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'var(--nexus-border-primary)' }}>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="text-[11px] flex items-center gap-1" style={{ color: 'var(--nexus-text-tertiary)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Back
          </button>
          <span className="text-[11px] font-medium" style={{ color: 'var(--nexus-text-secondary)' }}>Project Diff</span>
        </div>
        <span className="text-[10px]" style={{ color: 'var(--nexus-text-tertiary)' }}>{lines.length} lines</span>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="w-4 h-4 rounded-full animate-spin" style={{ border: '2px solid var(--nexus-border-primary)', borderTopColor: 'var(--nexus-accent-blue)' }} />
          </div>
        ) : (
          <pre className="text-[11px] font-mono leading-relaxed">
            {lines.map((line, i) => (
              <div key={i} className="px-2 -mx-2" style={{
                backgroundColor: line.startsWith('+') ? 'rgba(63, 185, 80, 0.1)' : line.startsWith('-') ? 'rgba(248, 81, 73, 0.1)' : 'transparent',
                color: line.startsWith('+') ? 'var(--nexus-accent-green)' : line.startsWith('-') ? 'var(--nexus-accent-red)' : 'var(--nexus-text-secondary)',
              }}>
                {line || ' '}
              </div>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Onboarding Page ──

function OnboardingPage({ onAddProject }: { onAddProject: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-lg w-full text-center">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6" style={{ background: 'var(--nexus-gradient-primary)', boxShadow: '0 0 40px rgba(92, 124, 250, 0.3)' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        </div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--nexus-text-primary)' }}>Welcome to Nexus</h1>
        <p className="text-sm mb-8" style={{ color: 'var(--nexus-text-secondary)' }}>Your AI-powered coding assistant. Add a project to get started.</p>
        <div className="space-y-3">
          <button onClick={onAddProject} className="w-full rounded-xl px-5 py-4 text-sm font-medium transition-all text-left flex items-center gap-4" style={{ backgroundColor: 'var(--nexus-bg-secondary)', border: '1px solid var(--nexus-border-primary)', color: 'var(--nexus-text-primary)' }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--nexus-accent-blue)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
            </div>
            <div>
              <div className="font-medium">Add Local Directory</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--nexus-text-tertiary)' }}>Select a folder on your machine</div>
            </div>
          </button>
          <div className="rounded-xl px-5 py-4 text-sm flex items-center gap-4" style={{ backgroundColor: 'var(--nexus-bg-secondary)', border: '1px solid var(--nexus-border-primary)', color: 'var(--nexus-text-tertiary)' }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--nexus-bg-tertiary)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            </div>
            <div>
              <div className="font-medium" style={{ color: 'var(--nexus-text-secondary)' }}>Clone Repository</div>
              <div className="text-[11px] mt-0.5">Coming soon</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──

function App() {
  const { projects, activeProject, addProject, removeProject, selectProject } = useProjects();
  const nexus = useNexus(activeProject?.id ?? null);
  const { addToast, toasts, removeToast } = useToast();

  const [mainView, setMainView] = useState<'chat' | 'file' | 'diff'>('chat');
  const [sidebarFile, setSidebarFile] = useState<ProjectFile | null>(null);
  const [sidebarFileContent, setSidebarFileContent] = useState<string | null>(null);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  const handleSidebarFileSelect = useCallback((file: ProjectFile | null, content: string | null) => {
    setSidebarFile(file);
    setSidebarFileContent(content);
    if (file) setMainView('file');
  }, []);

  const handleCreateSession = useCallback(() => {
    if (!nexus.activeSessionId && nexus.sessions.length > 0) {
      nexus.selectSession(nexus.sessions[0].id);
      return;
    }
    const name = `Session ${nexus.sessions.length + 1}`;
    nexus.createSession(name);
    addToast('success', `Created "${name}"`);
  }, [nexus, addToast]);

  const handleAddProject = useCallback(async (path: string) => {
    try {
      await addProject(path);
      setShowAddProject(false);
      addToast('success', 'Project added');
    } catch (e) { addToast('error', String(e)); }
  }, [addProject, addToast]);

  const handleRemoveProject = useCallback(async (id: string) => {
    try { await removeProject(id); addToast('success', 'Project removed'); }
    catch (e) { addToast('error', String(e)); }
  }, [removeProject, addToast]);

  useEffect(() => {
    if (!isTauri()) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowCommandPalette(s => !s); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); setSidebarFile(f => f ? null : sidebarFile); }
      if (e.key === 'Escape') { setShowCommandPalette(false); setShowSettings(false); setShowAddProject(false); if (sidebarFile) { setSidebarFile(null); setMainView('chat'); } }
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') { e.preventDefault(); if (sidebarFile) { setSidebarFile(null); setMainView('chat'); } else if (nexus.activeSessionId) { nexus.selectSession(nexus.activeSessionId); } }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sidebarFile, nexus]);

  useEffect(() => {
    if (!nexus.activeSessionId && !sidebarFile) setMainView('chat');
  }, [nexus.activeSessionId, sidebarFile]);

  useEffect(() => {
    if (!isTauri()) { setApiKeyStatus('missing'); return; }
    invoke('get_config').then((c: any) => setApiKeyStatus(c?.apiKey ? 'configured' : 'missing')).catch(() => setApiKeyStatus('missing'));
  }, [showSettings]);

  const [apiKeyStatus, setApiKeyStatus] = useState<'configured' | 'missing'>('missing');
  const [tokens, setTokens] = useState<{ input: number; output: number }>({ input: 0, output: 0 });

  useEffect(() => {
    if (nexus.error) { addToast('error', nexus.error); nexus.clearError(); }
  }, [nexus.error, addToast]);

  const commands = [
    { id: 'add-project', label: 'Add Project', icon: 'folder' },
    { id: 'new-session', label: 'New Session', icon: 'plus' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
    { id: 'close-file', label: 'Close File', icon: 'close' },
  ];

  const handleCommandSelect = (id: string) => {
    setShowCommandPalette(false);
    if (id === 'add-project') setShowAddProject(true);
    else if (id === 'new-session') handleCreateSession();
    else if (id === 'settings') setShowSettings(true);
    else if (id === 'close-file') { setSidebarFile(null); setMainView('chat'); }
  };

  // Show onboarding if no projects exist
  if (projects.length === 0) {
    return (
      <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--nexus-bg-primary)', color: 'var(--nexus-text-primary)' }}>
        <div className="flex-1 flex">
          <div className="w-64 flex-shrink-0 border-r flex flex-col" style={{ borderColor: 'var(--nexus-border-primary)', backgroundColor: 'var(--nexus-bg-primary)' }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--nexus-border-primary)' }}>
              <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'var(--nexus-gradient-primary)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>
              </div>
              <span className="text-xs font-semibold" style={{ color: 'var(--nexus-text-primary)' }}>Nexus</span>
            </div>
            <div className="flex-1" />
            <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--nexus-border-primary)' }}>
              <button onClick={() => setShowAddProject(true)} className="w-full flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded-md transition-all" style={{ color: 'var(--nexus-accent-blue)', backgroundColor: 'var(--nexus-bg-secondary)', border: '1px solid var(--nexus-border-primary)' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Project
              </button>
            </div>
          </div>
          <OnboardingPage onAddProject={() => setShowAddProject(true)} />
        </div>
        <StatusBar status={nexus.status} error={nexus.error} model="gpt-4o-mini" />
        {showAddProject && <AddProjectModal onAdd={handleAddProject} onClose={() => setShowAddProject(false)} />}
        {showCommandPalette && <CommandPalette commands={commands} onSelect={handleCommandSelect} onClose={() => setShowCommandPalette(false)} />}
        <ToastContainer toasts={toasts} onDismiss={removeToast} />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--nexus-bg-primary)', color: 'var(--nexus-text-primary)' }}>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 flex-shrink-0 border-r flex flex-col" style={{ borderColor: 'var(--nexus-border-primary)' }}>
          <Sidebar
            projects={projects} activeProject={activeProject} sessions={nexus.sessions} activeSessionId={nexus.activeSessionId}
            onSelectSession={nexus.selectSession} onCreateSession={handleCreateSession} onDeleteSession={nexus.deleteSession}
            onAddProject={() => setShowAddProject(true)} onSelectProject={selectProject} onRemoveProject={handleRemoveProject}
            onFileSelect={handleSidebarFileSelect} selectedFile={sidebarFile}
          />
        </div>

        <main className="flex-1 flex flex-col overflow-hidden">
          {activeProject && (
            <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'var(--nexus-border-primary)' }}>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium" style={{ color: 'var(--nexus-text-secondary)' }}>{activeProject.name}</span>
                <span className="text-[10px]" style={{ color: 'var(--nexus-text-tertiary)' }}>{activeProject.path}</span>
              </div>
              <div className="flex items-center gap-1">
                {apiKeyStatus === 'missing' && (
                  <button onClick={() => setShowSettings(true)} className="text-[10px] px-2 py-1 rounded-md" style={{ backgroundColor: 'var(--nexus-accent-orange)', color: 'white' }}>
                    Set API Key
                  </button>
                )}
                <button onClick={() => setMainView('diff')} className="text-[10px] px-2 py-1 rounded-md flex items-center gap-1" style={{ backgroundColor: mainView === 'diff' ? 'var(--nexus-accent-blue)' : 'var(--nexus-bg-secondary)', color: mainView === 'diff' ? 'white' : 'var(--nexus-text-tertiary)', border: '1px solid ' + (mainView === 'diff' ? 'var(--nexus-accent-blue)' : 'var(--nexus-border-primary)') }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18"/><rect x="3" y="8" width="7" height="8"/><rect x="14" y="8" width="7" height="8"/></svg>
                  Diff
                </button>
                <button onClick={() => setShowCommandPalette(true)} className="text-[10px] px-2 py-1 rounded-md flex items-center gap-1" style={{ backgroundColor: 'var(--nexus-bg-secondary)', border: '1px solid var(--nexus-border-primary)', color: 'var(--nexus-text-tertiary)' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  ⌘K
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            {mainView === 'diff' && activeProject ? (
              <DiffViewer projectPath={activeProject.id} onClose={() => setMainView('chat')} />
            ) : mainView === 'chat' || !sidebarFile ? (
              <ChatView messages={nexus.messages} status={nexus.status} onSend={nexus.sendMessage} streamingContent={nexus.streamingContent} />
            ) : (
              <div className="h-full flex flex-col">
                <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: 'var(--nexus-border-primary)' }}>
                  <button onClick={() => { setSidebarFile(null); setMainView('chat'); }} className="text-[11px] flex items-center gap-1" style={{ color: 'var(--nexus-text-tertiary)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                    Back
                  </button>
                  <span className="text-[11px] font-mono" style={{ color: 'var(--nexus-text-secondary)' }}>{sidebarFile.path}</span>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  <pre className="text-[12px] font-mono whitespace-pre-wrap" style={{ color: 'var(--nexus-text-primary)' }}>{sidebarFileContent || ''}</pre>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <StatusBar status={nexus.status} error={nexus.error} model={showSettings ? 'settings' : 'gpt-4o-mini'} />

      {showAddProject && <AddProjectModal onAdd={handleAddProject} onClose={() => setShowAddProject(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showCommandPalette && <CommandPalette commands={commands} onSelect={handleCommandSelect} onClose={() => setShowCommandPalette(false)} />}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}

// ── Root ──

export default function Root() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}
