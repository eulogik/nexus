import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../lib/tauri';

export interface Session {
  id: string;
  name: string;
  created_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: string;
}

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
  updateConfig: (key: string, value: unknown) => void;
}

export function useNexus(): UseNexusReturn {
  const [state, setState] = useState<UseNexusState>({
    sessions: [],
    activeSessionId: null,
    messages: [],
    status: 'idle',
    error: null,
  });

  useEffect(() => {
    if (!isTauri()) return;
    invoke<Session[]>('get_sessions')
      .then(sessions => setState(prev => ({ ...prev, sessions })))
      .catch(() => {});
  }, []);

  const syncSessions = useCallback(() => {
    if (!isTauri()) return;
    invoke<Session[]>('get_sessions')
      .then(sessions => setState(prev => ({ ...prev, sessions })))
      .catch(() => {});
  }, []);

  const createSession = useCallback((name: string) => {
    if (!isTauri()) {
      const id = crypto.randomUUID();
      const session: Session = { id, name, created_at: new Date().toISOString() };
      setState(prev => ({
        ...prev,
        sessions: [...prev.sessions, session],
        activeSessionId: id,
        messages: [],
      }));
      return;
    }
    invoke<Session>('create_session', { config: { name } })
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
  }, []);

  const selectSession = useCallback((id: string) => {
    setState(prev => ({ ...prev, activeSessionId: id, status: 'idle', error: null }));
    if (!isTauri()) return;
    invoke<Message[]>('get_session_messages', { sessionId: id })
      .then(messages => setState(prev => ({ ...prev, messages })))
      .catch(() => {});
  }, []);

  const deleteSession = useCallback((id: string) => {
    if (isTauri()) {
      invoke('delete_session', { sessionId: id }).catch(() => {});
    }
    syncSessions();
    setState(prev =>
      prev.activeSessionId === id
        ? { ...prev, activeSessionId: null, messages: [], status: 'idle' }
        : prev
    );
  }, [syncSessions]);

  const sendMessage = useCallback(async (content: string) => {
    if (!state.activeSessionId) return;
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
        sessionId: state.activeSessionId,
        content,
      });
      setState(prev => ({ ...prev, messages: [...prev.messages, result], status: 'idle' }));
    } catch (err) {
      setState(prev => ({ ...prev, status: 'error', error: String(err) }));
    }
  }, [state.activeSessionId]);

  const updateConfig = useCallback((key: string, value: unknown) => {
    if (!isTauri()) return;
    invoke('update_config', { key, value: String(value) }).catch(() => {});
  }, []);

  return {
    ...state,
    createSession,
    selectSession,
    deleteSession,
    sendMessage,
    updateConfig,
  };
}
