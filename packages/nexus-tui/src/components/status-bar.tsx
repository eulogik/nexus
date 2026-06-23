import { Box, Text } from 'ink';
import React from 'react';
import type { Session } from 'nexus-core';
import type { ThemeColors } from '../types.js';
import { formatCost } from '../utils.js';

interface StatusBarProps {
  session?: Session;
  status: string;
  theme: ThemeColors;
  error?: string;
  messagesCount: number;
}

export function StatusBar({ session, status, theme, error, messagesCount }: StatusBarProps) {
  const shortcuts = [
    { key: 'Ctrl+C', desc: 'Quit' },
    { key: '↑↓', desc: 'Scroll' },
    { key: 'Ctrl+L', desc: 'Toggle cost' },
  ];

  return (
    <Box width="100%" borderStyle="single" borderColor={theme.border} paddingX={1} paddingY={0}>
      {error ? (
        <Box width="100%">
          <Text color={theme.error} bold>Error: </Text>
          <Text color={theme.error}>{error}</Text>
        </Box>
      ) : (
        <Box justifyContent="space-between" width="100%">
          <Box>
            <Text color={theme.muted}>
              status: </Text><Text color={theme.text} bold>{status}</Text>
            <Text color={theme.muted}> msgs: </Text><Text color={theme.text}>{messagesCount}</Text>
            {session && (
              <>
                <Text color={theme.muted}> cost: </Text>
                <Text color={theme.text}>{formatCost(session.cost.sessionTotal)}</Text>
                {session.cost.savingsFromCompression > 0 && (
                  <>
                    <Text color={theme.muted}> saved: </Text>
                    <Text color={theme.success}>{formatCost(session.cost.savingsFromCompression)}</Text>
                  </>
                )}
              </>
            )}
          </Box>
          <Box>
            {shortcuts.map((s, i) => (
              <React.Fragment key={s.key}>
                {i > 0 && <Text color={theme.muted}> {'·'} </Text>}
                <Text color={theme.muted}>{s.key}</Text>
              </React.Fragment>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
