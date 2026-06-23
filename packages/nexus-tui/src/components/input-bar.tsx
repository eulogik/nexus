import { Box, Text } from 'ink';
import React from 'react';
import type { ThemeColors } from '../types.js';

interface InputBarProps {
  input: string;
  status: string;
  theme: ThemeColors;
}

export function InputBar({ input, status, theme }: InputBarProps) {
  const isProcessing = status === 'thinking' || status === 'streaming';
  const cursorLine = isProcessing ? '' : (input.length > 0 ? input : '');

  return (
    <Box width="100%" borderStyle="single" borderColor={theme.border} paddingX={1} paddingY={0} flexDirection="column">
      <Box justifyContent="space-between" width="100%">
        <Box flexGrow={1}>
          {isProcessing ? (
            <Box>
              <Text color={theme.warning}>
                {'⠋'} Processing...
              </Text>
            </Box>
          ) : (
            <Box>
              <Text color={theme.primary}>{'> '}</Text>
              <Text color={theme.text}>{cursorLine}</Text>
              <Text color={theme.primary}>{'█'}</Text>
            </Box>
          )}
        </Box>
        {!isProcessing && (
          <Box marginLeft={1}>
            <Text color={theme.muted}>{input.length} chars</Text>
          </Box>
        )}
      </Box>
      {!isProcessing && input.length === 0 && (
        <Box>
          <Text color={theme.muted} dimColor>Type a message and press Enter to send...</Text>
        </Box>
      )}
    </Box>
  );
}
