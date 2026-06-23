import { Box, Text } from 'ink';
import React from 'react';
import type { ThemeColors } from '../types.js';
import { formatCost } from '../utils.js';

interface ApprovalRequest {
  toolName: string;
  args: Record<string, unknown>;
  reasoning?: string;
}

interface ApprovalDialogProps {
  request: ApprovalRequest;
  estimatedCost: number;
  theme: ThemeColors;
  onApprove: () => void;
  onReject: () => void;
  onAlwaysApprove: () => void;
}

export function ApprovalDialog({ request, estimatedCost, theme, onApprove, onReject, onAlwaysApprove }: ApprovalDialogProps) {
  return (
    <Box
      borderStyle="round"
      borderColor={theme.warning}
      padding={1}
      flexDirection="column"
      width="100%"
    >
      <Box justifyContent="space-between" width="100%">
        <Text bold color={theme.warning}>{'⚠'} Tool Approval Required</Text>
          <Text color={theme.muted} dimColor>Press a key to decide</Text>
      </Box>

      <Box flexDirection="column" marginTop={0} width="100%">
        <Box>
          <Text color={theme.text}>Tool: </Text>
          <Text color={theme.primary} bold>{request.toolName}</Text>
        </Box>

        {request.reasoning && (
          <Box flexDirection="column">
            <Text color={theme.text}>Reasoning: </Text>
            <Text color={theme.muted}>{request.reasoning}</Text>
          </Box>
        )}

        <Box flexDirection="column">
          <Text color={theme.text}>Arguments:</Text>
          {Object.entries(request.args).map(([key, value]) => (
            <Box key={key} paddingLeft={2}>
              <Text color={theme.secondary}>{key}: </Text>
              <Text color={theme.text}>
                {typeof value === 'string' && value.length > 80
                  ? value.slice(0, 80) + '…'
                  : JSON.stringify(value)
                }
              </Text>
            </Box>
          ))}
        </Box>

        <Box marginTop={0}>
          <Text color={theme.text}>Estimated Cost: </Text>
          <Text color={estimatedCost > 0.01 ? theme.warning : theme.muted}>
            {formatCost(estimatedCost)}
          </Text>
        </Box>
      </Box>

      <Box marginTop={0} justifyContent="space-around" width="100%">
        <Box>
          <Text color={theme.success}>[Y] Approve</Text>
        </Box>
        <Box>
          <Text color={theme.error}>[N] Reject</Text>
        </Box>
        <Box>
          <Text color={theme.primary}>[A] Always approve this</Text>
        </Box>
      </Box>
    </Box>
  );
}
