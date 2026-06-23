import { ConfigManager, SessionManager, AgentLoop, ApprovalChecker, GitManager } from 'nexus-core';
import { ProviderRegistry } from 'nexus-ai';
import type { StreamChunk, NexusConfig } from 'nexus-ai';
import chalk from 'chalk';

import { startSimpleChat } from '../simple-chat.js';

interface ChatOptions {
  debug?: boolean;
  model?: string;
  noTui?: boolean;
  costMax?: number;
}

export async function chatCommand(argv: ChatOptions): Promise<void> {
  const debug = argv.debug ?? false;
  const model = argv.model;
  const noTui = argv.noTui ?? false;
  const costMax = argv.costMax;

  if (debug) {
    console.log(chalk.dim('[debug] Starting chat...'));
  }

  const configManager = new ConfigManager();
  const nexusConfig: NexusConfig = {
    providers: {
      openrouter: {
        apiKey: process.env.OPENROUTER_API_KEY || process.env.NEXUS_OPENROUTER_KEY || '',
        enabled: true,
      },
    },
  };

  const providerRegistry = new ProviderRegistry(nexusConfig);
  const sessionManager = new SessionManager('.nexus/sessions');
  const approvalChecker = new ApprovalChecker({
    defaultLevel: configManager.get('session.defaultApprovalLevel') as 'auto' | 'notify' | 'ask' ?? 'auto',
    persistenceEnabled: configManager.get('approval.persistLearnedRules') as boolean ?? true,
  });
  const gitManager = new GitManager({
    enabled: configManager.get('git.enabled') as boolean ?? true,
  });

  const agentLoop = new AgentLoop(
    sessionManager,
    providerRegistry,
    approvalChecker,
    gitManager,
    configManager,
    { model, maxCost: costMax },
  );

  if (debug) {
    console.log(chalk.dim('[debug] AgentLoop initialized'));
  }

  if (!noTui) {
    try {
      const { runInkApp } = await import('nexus-tui/ink');
      const session = sessionManager.create(
        `chat-${Date.now().toString(36)}`,
        { projectPath: process.cwd(), model: model ?? '' },
      );

      const waitUntilExit = runInkApp({
        initialSession: session,
        onSendMessage: async (input: string) => {
          if (debug) console.log(chalk.dim(`[debug] User input: ${input.slice(0, 50)}...`));
          const result = await agentLoop.runTask(input, { sessionName: session.name });
          if (debug) console.log(chalk.dim(`[debug] Result: ${result.status}`));
        },
        onInterrupt: () => {
          console.log(chalk.yellow('\n⚠ Interrupted by user'));
          process.exit(0);
        },
      });

      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n⚠ Shutting down...'));
        sessionManager.updateStatus(session.id, 'aborted');
        process.exit(0);
      });

      await waitUntilExit;
      return;
    } catch (err) {
      console.log(chalk.yellow('\n⚠ TUI not available, falling back to simple chat...\n'));
      if (debug) console.error(chalk.dim('[debug] TUI error:'), err);
    }
  }

  await startSimpleChat(agentLoop, configManager, sessionManager, { debug, model });
}
