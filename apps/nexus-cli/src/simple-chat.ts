import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import chalk from 'chalk';
import { AgentLoop, SessionManager, ConfigManager } from 'nexus-core';

interface SimpleChatOptions {
  debug?: boolean;
  model?: string;
}

export async function startSimpleChat(
  agentLoop: AgentLoop,
  configManager: ConfigManager,
  sessionManager: SessionManager,
  options: SimpleChatOptions,
): Promise<void> {
  const debug = options.debug ?? false;
  const model = options.model ?? '';

  const session = sessionManager.create(
    `chat-${Date.now().toString(36)}`,
    { projectPath: process.cwd(), model },
  );

  console.log(chalk.cyan('\n╔══════════════════════════════════════╗'));
  console.log(chalk.cyan('║') + chalk.bold.green('     Nexus Interactive Chat') + chalk.cyan('        ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════╝'));
  console.log(chalk.dim('\nType /help for commands, /exit to quit.\n'));

  const rl = createInterface({ input, output, terminal: true });

  async function processInput(input: string): Promise<void> {
    const trimmed = input.trim();

    if (trimmed.startsWith('/')) {
      await handleCommand(trimmed);
      return;
    }

    console.log(chalk.dim('\nNexus is thinking...\n'));

    try {
      const result = await agentLoop.runTask(trimmed, { sessionName: session.name });
      if (result.success && result.finalMessage) {
        console.log(chalk.blue('nexus: ') + result.finalMessage + '\n');
      } else if (result.error) {
        console.log(chalk.red(`Error: ${result.error}\n`));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`Error: ${message}\n`));
    }
  }

  async function handleCommand(cmd: string): Promise<void> {
    const parts = cmd.split(/\s+/);
    const command = parts[0]!.toLowerCase();

    switch (command) {
      case '/help':
        console.log(chalk.cyan('\nAvailable commands:'));
        console.log(chalk.dim('  /help          ') + 'Show this help');
        console.log(chalk.dim('  /cost          ') + 'Show current session cost');
        console.log(chalk.dim('  /save          ') + 'Save session');
        console.log(chalk.dim('  /exit          ') + 'Exit chat\n');
        break;

      case '/cost': {
        const s = sessionManager.load(session.id);
        console.log(chalk.cyan(`\nSession cost: $${s.cost.sessionTotal.toFixed(6)}`));
        console.log(chalk.dim(`Tokens used: ${s.cost.tokensUsed.toLocaleString()}\n`));
        break;
      }

      case '/save':
        sessionManager.save(session);
        console.log(chalk.green('\n✓ Session saved\n'));
        break;

      case '/exit':
        console.log(chalk.yellow('\nGoodbye!\n'));
        sessionManager.updateStatus(session.id, 'completed');
        rl.close();
        process.exit(0);

      default:
        console.log(chalk.yellow(`Unknown command: ${command}. Type /help for available commands.\n`));
    }
  }

  rl.on('SIGINT', () => {
    console.log(chalk.yellow('\n\n⚠ Use /exit to quit.\n'));
  });

  while (true) {
    const input = await rl.question(chalk.green('\nYou: '));
    if (input.trim().toLowerCase() === '/exit') {
      await handleCommand('/exit');
      break;
    }
    await processInput(input);
  }

  rl.close();
}
