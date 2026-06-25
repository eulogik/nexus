import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke, listen, isTauri, type Session, type Message } from '../lib/tauri';

interface UseNexusState {
  sessions: Session[];
  activeSessionId: string | null;
  messages: Message[];
  status: 'idle' | 'loading' | 'streaming' | 'error';
  error: string | null;
  streamingContent: string;
}

interface UseNexusReturn extends UseNexusState {
  createSession: (name: string) => void;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  sendMessage: (content: string) => Promise<void>;
  clearError: () => void;
}

export function useNexus(projectId: string | null): UseNexusReturn {
  const [state, setState] = useState<UseNexusState>({
    sessions: [],
    activeSessionId: null,
    messages: [],
    status: 'idle',
    error: null,
    streamingContent: '',
  });
  const streamingRef = useRef('');
  const streamDoneRef = useRef(false);
  const activeSessionRef = useRef<string | null>(null);

  useEffect(() => {
    activeSessionRef.current = state.activeSessionId;
  }, [state.activeSessionId]);

  const syncSessions = useCallback(async () => {
    if (!isTauri() || !projectId) {
      setState(prev => ({ ...prev, sessions: [], activeSessionId: null }));
      return;
    }
    try {
      const sessions = await invoke<Session[]>('list_sessions', { projectId });
      setState(prev => {
        const newActive = prev.activeSessionId ?? sessions[0]?.id ?? null;
        return { ...prev, sessions, activeSessionId: newActive };
      });
      if (sessions.length === 0) {
        setState(prev => ({ ...prev, messages: [], activeSessionId: null }));
      }
    } catch {}
  }, [projectId]);

  // Set up streaming listeners
  useEffect(() => {
    if (!isTauri()) return;
    let cleanup: (() => void)[] = [];

    listen<string>('stream-token', (token) => {
      if (streamDoneRef.current) return;
      streamingRef.current += token;
      setState(prev => ({ ...prev, streamingContent: streamingRef.current }));
    }).then(unlisten => {
      cleanup.push(unlisten);
    });

    listen<{ inputTokens?: number; outputTokens?: number }>('stream-done', (data) => {
      streamDoneRef.current = true;
      const sId = activeSessionRef.current;
      if (projectId && sId) {
        invoke<Message[]>('get_session_messages', { projectId, sessionId: sId })
          .then(messages => {
            const filtered = messages.filter(m => m.role === 'user' || m.role === 'assistant');
            setState(prev => ({ ...prev, messages: filtered, status: 'idle', streamingContent: '' }));
          })
          .catch(() => {
            setState(prev => ({ ...prev, status: 'idle', streamingContent: '' }));
          });
      } else {
        setState(prev => ({ ...prev, status: 'idle', streamingContent: '' }));
      }
      streamingRef.current = '';
    }).then(unlisten => {
      cleanup.push(unlisten);
    });

    listen('stream-error', (error) => {
      streamDoneRef.current = true;
      streamingRef.current = '';
      setState(prev => ({ ...prev, status: 'error', error: String(error), streamingContent: '' }));
    }).then(unlisten => {
      cleanup.push(unlisten);
    });

    return () => {
      cleanup.forEach(fn => fn());
    };
  }, []);

  useEffect(() => {
    syncSessions().then(() => {
      setState(prev => {
        if (prev.activeSessionId && !prev.sessions.find(s => s.id === prev.activeSessionId)) {
          return { ...prev, activeSessionId: null, messages: [], status: 'idle' };
        }
        return prev;
      });
    });
  }, [syncSessions]);

  // Load messages when active session changes
  useEffect(() => {
    if (!isTauri() || !projectId || !state.activeSessionId) return;
    invoke<Message[]>('get_session_messages', { projectId, sessionId: state.activeSessionId })
      .then(messages => {
        const filtered = messages.filter(m => m.role === 'user' || m.role === 'assistant');
        setState(prev => ({ ...prev, messages: filtered }));
      })
      .catch(() => {});
  }, [projectId, state.activeSessionId]);

  const createSession = useCallback((name: string) => {
    if (!isTauri() || !projectId) return;
    invoke<Session>('create_session', { projectId, config: { name } })
      .then(session => {
        setState(prev => ({
          ...prev,
          sessions: [...prev.sessions, session],
          activeSessionId: session.id,
          messages: [],
        }));
      })
      .catch(err => {
        setState(prev => ({ ...prev, status: 'error', error: String(err) }));
      });
  }, [projectId]);

  const selectSession = useCallback((id: string) => {
    setState(prev => ({ ...prev, activeSessionId: id, status: 'idle', error: null }));
    if (!isTauri() || !projectId) return;
    invoke<Message[]>('get_session_messages', { projectId, sessionId: id })
      .then(messages => setState(prev => ({ ...prev, messages })))
      .catch(() => {});
  }, [projectId]);

  const deleteSession = useCallback((id: string) => {
    if (isTauri() && projectId) {
      invoke('delete_session', { projectId, sessionId: id }).catch(() => {});
    }
    syncSessions();
    setState(prev =>
      prev.activeSessionId === id
        ? { ...prev, activeSessionId: null, messages: [], status: 'idle' }
        : prev
    );
  }, [syncSessions, projectId]);

  const sendMessage = useCallback(async (content: string) => {
    const sId = activeSessionRef.current;
    if (!sId || !projectId) return;
    if (state.status === 'streaming') return;
    streamDoneRef.current = false;
    streamingRef.current = '';
    setState(prev => ({ ...prev, status: 'streaming', error: null, streamingContent: '' }));

    const userMsg: Message = {
      id: crypto.randomUUID(),
      session_id: sId,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setState(prev => ({ ...prev, messages: [...prev.messages, userMsg] }));

    if (!isTauri()) {
      setTimeout(() => {
        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          session_id: state.activeSessionId!,
          role: 'assistant',
          content: `Nexus received: "${content}"`,
          timestamp: new Date().toISOString(),
        };
        setState(prev => ({ ...prev, messages: [...prev.messages, assistantMsg], status: 'idle' }));
      }, 500);
      return;
    }

    try {
      await invoke('send_message', {
        projectId,
        sessionId: sId,
        content,
      });
      // messages reloaded from disk on stream-done
    } catch (err) {
      setState(prev => ({ ...prev, status: 'error', error: String(err) }));
    }
  }, [state.activeSessionId, projectId]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    createSession,
    selectSession,
    deleteSession,
    sendMessage,
    clearError,
  };
}
