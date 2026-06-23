import { Box, useInput, useApp } from 'ink';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Message, Session } from 'nexus-core';
import type { TUIState, ThemeColors } from './types.js';
import { darkTheme, lightTheme } from './types.js';
import { Header } from './components/header.js';
import { MessageList } from './components/message-list.js';
import { InputBar } from './components/input-bar.js';
import { StatusBar } from './components/status-bar.js';
import { CostPanel } from './components/cost-panel.js';
import { ApprovalDialog } from './components/approval-dialog.js';

interface NexusAppProps {
  initialSession?: Session;
  initialMessages?: Message[];
  onSendMessage?: (input: string) => Promise<void>;
  onInterrupt?: () => void;
}

export function NexusApp({ initialSession, initialMessages, onSendMessage, onInterrupt }: NexusAppProps) {
  const { exit } = useApp();

  const [state, setState] = useState<TUIState>({
    input: '',
    messages: initialMessages ?? [],
    status: 'idle',
    session: initialSession,
    showCost: false,
    showCompression: true,
    showReasoning: true,
    theme: 'dark',
  });

  const [scrollOffset, setScrollOffset] = useState(0);
  const [viewHeight, setViewHeight] = useState(15);
  const [error, setError] = useState<string | undefined>();
  const [approvalRequest, setApprovalRequest] = useState<{
    toolName: string;
    args: Record<string, unknown>;
    estimatedCost: number;
  } | undefined>();

  const inputRef = useRef(state.input);
  inputRef.current = state.input;

  const messagesRef = useRef(state.messages);
  messagesRef.current = state.messages;

  useEffect(() => {
    if (state.messages.length > 0) {
      setScrollOffset(Math.max(0, state.messages.length - viewHeight));
    }
  }, [state.messages.length, viewHeight]);

  const sendMessage = useCallback(async () => {
    const text = inputRef.current.trim();
    if (!text || state.status === 'thinking' || state.status === 'streaming') return;

    setState((prev) => ({
      ...prev,
      input: '',
      status: 'thinking',
    }));
    setError(undefined);

    if (onSendMessage) {
      try {
        await onSendMessage(text);
      } catch (err) {
        setError((err as Error).message);
        setState((prev) => ({ ...prev, status: 'error' }));
      }
    }
  }, [state.status, onSendMessage]);

  const toggleCost = useCallback(() => {
    setState((prev) => ({ ...prev, showCost: !prev.showCost }));
  }, []);

  const toggleTheme = useCallback(() => {
    setState((prev) => ({ ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' }));
  }, []);

  const theme: ThemeColors = state.theme === 'dark' ? darkTheme : lightTheme;

  useInput((input, key) => {
    if (approvalRequest) {
      if (input === 'y' || input === 'Y') {
        setApprovalRequest(undefined);
        return;
      }
      if (input === 'n' || input === 'N') {
        setApprovalRequest(undefined);
        return;
      }
      if (input === 'a' || input === 'A') {
        setApprovalRequest(undefined);
        return;
      }
      return;
    }

    if (key.ctrl && input === 'c') {
      if (onInterrupt && (state.status === 'thinking' || state.status === 'streaming')) {
        onInterrupt();
      }
      exit();
      return;
    }

    if (key.ctrl && input === 'l') {
      toggleCost();
      return;
    }

    if (key.ctrl && input === 't') {
      toggleTheme();
      return;
    }

    if (key.upArrow) {
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setScrollOffset((prev) => Math.min(state.messages.length - 1, prev + 1));
      return;
    }

    if (key.pageUp) {
      setScrollOffset((prev) => Math.max(0, prev - viewHeight));
      return;
    }

    if (key.pageDown) {
      setScrollOffset((prev) => Math.min(state.messages.length - 1, prev + viewHeight));
      return;
    }

    if (key.return && !key.shift) {
      sendMessage();
      return;
    }

    if (key.return && key.shift) {
      setState((prev) => ({ ...prev, input: prev.input + '\n' }));
      return;
    }

    if (key.backspace || key.delete) {
      setState((prev) => ({ ...prev, input: prev.input.slice(0, -1) }));
      return;
    }

    if (!key.ctrl && !key.meta && input.length > 0) {
      setState((prev) => ({ ...prev, input: prev.input + input }));
    }
  });

  const handleResize = useCallback((cols: number, rows: number) => {
    const headerHeight = 4;
    const inputHeight = 3;
    const statusHeight = 1;
    const available = rows - headerHeight - inputHeight - statusHeight - 2;
    setViewHeight(Math.max(5, available));
  }, []);

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Header session={state.session} theme={theme} status={state.status} />

      {approvalRequest && (
        <ApprovalDialog
          request={approvalRequest}
          estimatedCost={approvalRequest.estimatedCost}
          theme={theme}
          onApprove={() => setApprovalRequest(undefined)}
          onReject={() => setApprovalRequest(undefined)}
          onAlwaysApprove={() => setApprovalRequest(undefined)}
        />
      )}

      {state.showCost && (
        <CostPanel session={state.session} theme={theme} visible={state.showCost} />
      )}

      <Box flexGrow={1} flexDirection="column" width="100%" overflowY="hidden">
        <MessageList
          messages={state.messages}
          theme={theme}
          showCost={state.showCost}
          showCompression={state.showCompression}
          showReasoning={state.showReasoning}
          scrollOffset={scrollOffset}
          viewHeight={viewHeight}
        />
      </Box>

      <InputBar input={state.input} status={state.status} theme={theme} />

      <StatusBar
        session={state.session}
        status={state.status}
        theme={theme}
        error={error}
        messagesCount={state.messages.length}
      />
    </Box>
  );
}
