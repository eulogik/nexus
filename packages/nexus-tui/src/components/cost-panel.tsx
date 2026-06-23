import { Box, Text } from 'ink';
import React from 'react';
import type { Session } from 'nexus-core';
import type { ThemeColors } from '../types.js';
import { formatCost, formatTokens } from '../utils.js';

interface CostPanelProps {
  session?: Session;
  theme: ThemeColors;
  visible: boolean;
}

export function CostPanel({ session, theme, visible }: CostPanelProps) {
  if (!visible || !session) return null;

  const cost = session.cost;
  const maxCost = session.metadata.maxCost || 2.0;
  const budgetRatio = maxCost > 0 ? Math.min(cost.sessionTotal / maxCost, 1) : 0;
  const budgetBarLen = 20;
  const filledLen = Math.round(budgetBarLen * budgetRatio);
  const bar = '█'.repeat(filledLen) + '░'.repeat(budgetBarLen - filledLen);

  const barColor = budgetRatio > 0.9 ? theme.error : budgetRatio > 0.7 ? theme.warning : theme.success;

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
      paddingY={0}
      flexDirection="column"
      width="100%"
    >
      <Box justifyContent="space-between" width="100%">
        <Text bold color={theme.primary}>Cost Dashboard</Text>
        <Text color={theme.muted}>Ctrl+L to toggle</Text>
      </Box>

      <Box flexDirection="column" marginTop={0} width="100%">
        <Box justifyContent="space-between" width="100%">
          <Text color={theme.text}>Session Cost</Text>
          <Text color={cost.sessionTotal > 0 ? theme.warning : theme.muted}>
            {formatCost(cost.sessionTotal)}
          </Text>
        </Box>
        <Box justifyContent="space-between" width="100%">
          <Text color={theme.text}>Daily Cost</Text>
          <Text color={theme.muted}>{formatCost(cost.dailyTotal)}</Text>
        </Box>
        <Box justifyContent="space-between" width="100%">
          <Text color={theme.text}>Monthly Cost</Text>
          <Text color={theme.muted}>{formatCost(cost.monthlyTotal)}</Text>
        </Box>
        <Box justifyContent="space-between" width="100%">
          <Text color={theme.text}>Token Usage</Text>
          <Text color={theme.muted}>{formatTokens(cost.tokensUsed)} tokens</Text>
        </Box>
      </Box>

      {(cost.savingsFromCompression > 0 || cost.savingsFromFreeModels > 0) && (
        <Box flexDirection="column" marginTop={0} width="100%">
          <Box justifyContent="space-between" width="100%">
            <Text color={theme.text}>Compression Savings</Text>
            <Text color={theme.success}>{formatCost(cost.savingsFromCompression)}</Text>
          </Box>
          <Box justifyContent="space-between" width="100%">
            <Text color={theme.text}>Free Model Savings</Text>
            <Text color={theme.success}>{formatCost(cost.savingsFromFreeModels)}</Text>
          </Box>
        </Box>
      )}

      <Box marginTop={0} flexDirection="column" width="100%">
        <Box justifyContent="space-between" width="100%">
          <Text color={theme.text}>Budget ({formatCost(cost.sessionTotal)} / {formatCost(maxCost)})</Text>
        </Box>
        <Box>
          <Text color={barColor}>{bar}</Text>
        </Box>
      </Box>
    </Box>
  );
}
