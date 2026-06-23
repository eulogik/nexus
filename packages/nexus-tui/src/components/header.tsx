import { Box, Text } from 'ink';
import React from 'react';
import type { Session } from 'nexus-core';
import type { ThemeColors } from '../types.js';
import { formatCost, formatTokens, truncate } from '../utils.js';

interface HeaderProps {
  session?: Session;
  theme: ThemeColors;
  status: string;
}

export function Header({ session, theme, status }: HeaderProps) {
  const statusColor = (() => {
    switch (status) {
      case 'thinking': return theme.warning;
      case 'streaming': return theme.primary;
      case 'error': return theme.error;
      default: return theme.success;
    }
  })();

  return (
    <Box borderStyle="round" borderColor={theme.border} paddingX={1} paddingY={0} width="100%">
      <Box flexDirection="column" width="100%">
        <Box justifyContent="space-between" width="100%">
          <Box>
            <Text bold color={theme.primary}>
              {'◆'} {'Nexus'}
            </Text>
            {session && (
              <Text color={theme.muted}> — {truncate(session.name, 30)}</Text>
            )}
          </Box>
          <Box>
            <Text color={statusColor} bold>{status}</Text>
          </Box>
        </Box>
        {session && (
          <Box justifyContent="space-between" width="100%" marginTop={0}>
            <Text color={theme.muted}>
              {session.metadata.model || 'no model'} {'·'} branch: {session.branch}
            </Text>
            <Text color={theme.muted}>
              cost: {formatCost(session.cost.sessionTotal)} {'·'} tokens: {formatTokens(session.cost.tokensUsed)}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
