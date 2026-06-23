import { useState, useEffect, useCallback, useRef } from 'react';
import { Nexus } from 'nexus-sdk';
import type { Session, Message, StreamChunk } from 'nexus-sdk';
import { isTauri } from '../lib/tauri';

interface UseNexusState {
  sessions: Session[];
  activeSessionId: string | null;
  messages: Message[];
  status: 'idle' | 'loading' | 'streaming' | 'error';
  error: string | null;
}

interface UseNexusReturn extends UseNexusState {
  createSession: (name: string) => Session;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  sendMessage: (content: string) => Promise<void>;
  updateConfig: (key: string, value: unknown) => void;
}

export function useNexus(): UseNexusReturn {
  const nexusRef = useRef<Nexus | null>(null);
  const [state, setState] = useState<UseNexusState>({
    sessions: [],
    activeSessionId: null,
    messages: [],
    status: 'idle',
    error: null,
  });

  useEffect(() => {
    const nexusConfig: Record<string, unknown> = {};
    if (isTauri()) {
      nexusConfig.projectPath = '';
      nexusConfig.sessionsDir = '.nexus/sessions';
    }
    const nexus = new Nexus(nexusConfig);
    nexusRef.current = nexus;

    const sessions = nexus.listSessions();
    setState(prev => ({ ...prev, sessions }));

    return () => {
      nexus.destroy();
      nexusRef.current = null;
    };
  }, []);

  const currentSession = state.activeSessionId
    ? nexusRef.current?.getSession(state.activeSessionId) ?? null
    : null;

  useEffect(() => {
    if (currentSession) {
      setState(prev => ({ ...prev, messages: currentSession.messages }));
    }
  }, [currentSession]);

  const syncSessions = useCallback(() => {
    if (!nexusRef.current) return;
    const sessions = nexusRef.current.listSessions();
    setState(prev => ({ ...prev, sessions }));
  }, []);

  const createSession = useCallback((name: string): Session => {
    if (!nexusRef.current) throw new Error('Nexus not initialized');
    const session = nexusRef.current.createSession(name);
    syncSessions();
    setState(prev => ({ ...prev, activeSessionId: session.id, messages: [] }));
    return session;
  }, [syncSessions]);

  const selectSession = useCallback((id: string) => {
    if (!nexusRef.current) return;
    const session = nexusRef.current.getSession(id);
    if (session) {
      setState(prev => ({
        ...prev,
        activeSessionId: id,
        messages: session.messages,
        status: 'idle',
        error: null,
      }));
    }
  }, []);

  const deleteSession = useCallback((id: string) => {
    if (!nexusRef.current) return;
    nexusRef.current.deleteSession(id);
    syncSessions();
    setState(prev =>
      prev.activeSessionId === id
        ? { ...prev, activeSessionId: null, messages: [], status: 'idle' }
        : prev
    );
  }, [syncSessions]);

  const sendMessage = useCallback(async (content: string) => {
    if (!nexusRef.current || !state.activeSessionId) return;
    setState(prev => ({ ...prev, status: 'streaming', error: null }));

    try {
      const userMsg: Message = {
        role: 'user',
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        content,
      } as Message;

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, userMsg],
      }));

      const stream = await nexusRef.current.chat(state.activeSessionId, content);
      let assistantContent = '';

      for await (const chunk of stream as AsyncIterable<StreamChunk>) {
        if (chunk.type === 'text' && chunk.content) {
          assistantContent += chunk.content;
          setState(prev => {
            const msgs = prev.messages;
            const last = msgs[msgs.length - 1];
            if (last?.role === 'assistant') {
              return {
                ...prev,
                messages: [...msgs.slice(0, -1), { ...last, content: assistantContent } as Message],
              };
            }
            return {
              ...prev,
              messages: [...msgs, {
                role: 'assistant',
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                content: assistantContent,
                model: '',
                tokens: { input: 0, output: 0 },
                cost: 0,
              } as Message],
            };
          });
        }
        if (chunk.type === 'done') {
          setState(prev => ({ ...prev, status: 'idle' }));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState(prev => ({ ...prev, status: 'error', error: message }));
    }
  }, [state.activeSessionId]);

  const updateConfig = useCallback((key: string, value: unknown) => {
    if (!nexusRef.current) return;
    nexusRef.current.updateConfig(key, value);
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
