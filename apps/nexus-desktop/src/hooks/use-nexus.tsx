import { useState, useEffect, useCallback } from 'react';
import { invoke, isTauri, type Session, type Message } from '../lib/tauri';

interface UseNexusState {
  sessions: Session[];
  activeSessionId: string | null;
  messages: Message[];
  status: 'idle' | 'loading' | 'streaming' | 'error';
  error: string | null;
}

interface UseNexusReturn extends UseNexusState {
  createSession: (name: string) => void;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  sendMessage: (content: string) => Promise<void>;
}

export function useNexus(projectId: string | null): UseNexusReturn {
  const [state, setState] = useState<UseNexusState>({
    sessions: [],
    activeSessionId: null,
    messages: [],
    status: 'idle',
    error: null,
  });

  const syncSessions = useCallback(async () => {
    if (!isTauri() || !projectId) {
      setState(prev => ({ ...prev, sessions: [] }));
      return;
    }
    try {
      const sessions = await invoke<Session[]>('list_sessions', { projectId });
      setState(prev => ({ ...prev, sessions }));
    } catch {}
  }, [projectId]);

  useEffect(() => {
    syncSessions().then(() => {
      // If there was a previously active session, check if it still exists
      setState(prev => {
        if (prev.activeSessionId && !prev.sessions.find(s => s.id === prev.activeSessionId)) {
          return { ...prev, activeSessionId: null, messages: [], status: 'idle' };
        }
        return prev;
      });
    });
  }, [syncSessions]);

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
    if (!state.activeSessionId || !projectId) return;
    setState(prev => ({ ...prev, status: 'streaming', error: null }));

    const userMsg: Message = {
      id: crypto.randomUUID(),
      session_id: state.activeSessionId,
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
      const result = await invoke<Message>('send_message', {
        projectId,
        sessionId: state.activeSessionId,
        content,
      });
      setState(prev => ({ ...prev, messages: [...prev.messages, result], status: 'idle' }));
    } catch (err) {
      setState(prev => ({ ...prev, status: 'error', error: String(err) }));
    }
  }, [state.activeSessionId, projectId]);

  return {
    ...state,
    createSession,
    selectSession,
    deleteSession,
    sendMessage,
  };
}
