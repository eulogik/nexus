import { Box, Text } from 'ink';
import React from 'react';
import type { Message, AssistantMessage, ToolMessage, SystemMessage } from 'nexus-core';
import type { ThemeColors } from '../types.js';
import { formatCost, formatTokens, formatTime, highlightCode } from '../utils.js';

interface MessageListProps {
  messages: Message[];
  theme: ThemeColors;
  showCost: boolean;
  showCompression: boolean;
  showReasoning: boolean;
  scrollOffset: number;
  viewHeight: number;
}

function roleLabel(role: string): { label: string; color: string } {
  switch (role) {
    case 'user': return { label: 'You', color: '#5555FF' };
    case 'assistant': return { label: 'Nexus', color: '#00FFAA' };
    case 'tool': return { label: 'Tool', color: '#FFAA00' };
    case 'system': return { label: 'System', color: '#888888' };
    default: return { label: role, color: '#888888' };
  }
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function renderAssistantMessage(msg: AssistantMessage, theme: ThemeColors, showCost: boolean, showCompression: boolean, showReasoning: boolean) {
  const items: React.ReactNode[] = [];

  if (msg.reasoning && showReasoning) {
      items.push(
        <Box key="reasoning" flexDirection="column" marginY={0} paddingLeft={2}>
          <Text color={theme.muted} dimColor>┊ reasoning:</Text>
          <Text color={theme.muted} dimColor>┊ {msg.reasoning}</Text>
        </Box>
      );
  }

  if (msg.content) {
    const hasCodeBlock = msg.content.includes('```');
    if (hasCodeBlock) {
      const parts = msg.content.split(/(```\w*\n[\s\S]*?```)/g);
      const rendered = parts.map((part, i) => {
        const codeMatch = part.match(/^```(\w*)\n([\s\S]*?)```$/);
        if (codeMatch && codeMatch[2]) {
          const lang = codeMatch[1] || '';
          const highlighted = highlightCode(codeMatch[2].trim(), lang);
          return (
            <Box key={i} flexDirection="column" marginY={0} paddingLeft={2} borderStyle="single" borderColor={theme.border}>
              {lang && <Text color={theme.muted} dimColor>{lang}</Text>}
              <Text>{highlighted}</Text>
            </Box>
          );
        }
        return <Text key={i}>{part}</Text>;
      });
      items.push(<Box key="content" paddingLeft={2} flexDirection="column">{rendered}</Box>);
    } else {
      items.push(<Box key="content" paddingLeft={2}><Text>{msg.content}</Text></Box>);
    }
  }

  if (msg.toolCalls && msg.toolCalls.length > 0) {
    items.push(
      <Box key="tool-calls" paddingLeft={2} flexDirection="column">
        {msg.toolCalls.map((tc) => (
          <Box key={tc.id} marginY={0}>
            <Text color={theme.secondary}>{'⚡'} {tc.tool}</Text>
            <Text color={theme.muted}> — {tc.status}</Text>
          </Box>
        ))}
      </Box>
    );
  }

  if (showCost || showCompression) {
    const info: string[] = [];
    info.push(`tokens: ${formatTokens(msg.tokens.input)}in/${formatTokens(msg.tokens.output)}out`);
    if (showCost) info.push(`cost: ${formatCost(msg.cost)}`);
    if (showCompression && msg.compressionSavings) info.push(`saved: ${formatCost(msg.compressionSavings)}`);
      items.push(
        <Box key="meta" paddingLeft={2}>
          <Text color={theme.muted} dimColor>{info.join(' · ')}</Text>
        </Box>
      );
  }

  return items;
}

function renderToolMessage(msg: ToolMessage, theme: ThemeColors) {
  const items: React.ReactNode[] = [];

  const resultStatus = msg.result.success ? theme.success : theme.error;
  const statusIcon = msg.result.success ? '✔' : '✘';

  items.push(
    <Box key="tool-line" paddingLeft={2}>
      <Text color={resultStatus}>{statusIcon}</Text>
      <Text> </Text>
      <Text color={theme.secondary}>{msg.toolName}</Text>
      {msg.result.exitCode !== undefined && (
        <Text color={theme.muted}> exit: {msg.result.exitCode}</Text>
      )}
      {msg.compressed && (
        <Text color={theme.warning}> [compressed{msg.originalTokens ? ` ${formatTokens(msg.originalTokens)}→${formatTokens(msg.tokens)}` : ''}]</Text>
      )}
    </Box>
  );

  if (msg.result.output) {
    const output = msg.result.output.length > 500 ? msg.result.output.slice(0, 500) + '\n…[truncated]' : msg.result.output;
    items.push(
      <Box key="output" paddingLeft={4} flexDirection="column">
        <Text color={theme.text}>{output}</Text>
      </Box>
    );
  }

  if (msg.result.error) {
    items.push(
      <Box key="error" paddingLeft={4}>
        <Text color={theme.error}>{msg.result.error}</Text>
      </Box>
    );
  }

  return items;
}

function renderSystemMessage(msg: SystemMessage, theme: ThemeColors) {
  const typeColor = (() => {
    switch (msg.type) {
      case 'error': return theme.error;
      case 'warning': return theme.warning;
      case 'info': return theme.primary;
      default: return theme.muted;
    }
  })();

  return [
    <Box key="system" paddingLeft={2}>
      <Text color={typeColor}>[{msg.type}] {msg.content}</Text>
    </Box>
  ];
}

function renderMessage(msg: Message, theme: ThemeColors, showCost: boolean, showCompression: boolean, showReasoning: boolean): React.ReactNode[] {
  switch (msg.role) {
    case 'assistant':
      return renderAssistantMessage(msg, theme, showCost, showCompression, showReasoning);
    case 'tool':
      return renderToolMessage(msg, theme);
    case 'system':
      return renderSystemMessage(msg, theme);
    case 'user':
    default:
      return [
        <Box key="user-content" paddingLeft={2}>
          <Text>{msg.content}</Text>
        </Box>
      ];
  }
}

export function MessageList({ messages, theme, showCost, showCompression, showReasoning, scrollOffset, viewHeight }: MessageListProps) {
  const visibleMessages = messages.slice(scrollOffset, scrollOffset + viewHeight);

  if (messages.length === 0) {
    return (
      <Box flexGrow={1} justifyContent="center" alignItems="center" flexDirection="column">
        <Text color={theme.muted}>No messages yet. Start a conversation.</Text>
      </Box>
    );
  }

  return (
      <Box flexGrow={1} flexDirection="column" width="100%" overflowY="hidden">
        {scrollOffset > 0 && (
          <Box justifyContent="center" width="100%">
            <Text color={theme.muted} dimColor>↑ {scrollOffset} earlier messages hidden ↑</Text>
          </Box>
        )}
      {visibleMessages.map((msg) => {
        const { label, color } = roleLabel(msg.role);
        return (
          <Box key={msg.id} flexDirection="column" marginY={0} width="100%">
            <Box justifyContent="space-between" width="100%">
              <Box>
                <Text bold color={color}>{label}</Text>
              </Box>
              <Text color={theme.muted} dimColor>{formatTimestamp(msg.timestamp)}</Text>
            </Box>
            {renderMessage(msg, theme, showCost, showCompression, showReasoning)}
          </Box>
        );
      })}
      {scrollOffset + viewHeight < messages.length && (
        <Box justifyContent="center" width="100%">
          <Text color={theme.muted} dimColor>↓ {messages.length - (scrollOffset + viewHeight)} more messages ↓</Text>
        </Box>
      )}
    </Box>
  );
}
