import { render } from 'ink';
import React from 'react';
import { NexusApp } from './nexus-app.js';
import type { Message, Session } from 'nexus-core';

export interface InkAppOptions {
  initialSession?: Session;
  initialMessages?: Message[];
  onSendMessage?: (input: string) => Promise<void>;
  onInterrupt?: () => void;
  exitOnCtrlC?: boolean;
}

export function runInkApp(options: InkAppOptions) {
  const { waitUntilExit } = render(
    React.createElement(NexusApp, {
      initialSession: options.initialSession,
      initialMessages: options.initialMessages,
      onSendMessage: options.onSendMessage,
      onInterrupt: options.onInterrupt,
    }),
  );

  waitUntilExit().catch((err: unknown) => {
    console.error('TUI exited with error:', err);
  });

  return waitUntilExit;
}
