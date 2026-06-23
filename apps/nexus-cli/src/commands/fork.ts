import { randomUUID } from 'node:crypto';
import chalk from 'chalk';
import { SessionManager } from 'nexus-core';
import type { Session } from 'nexus-core';

interface ForkOptions {
  from: string;
  at?: string;
}

const sessionManager = new SessionManager('.nexus/sessions');

export async function forkCommand(argv: ForkOptions): Promise<void> {
  const { from: sessionId, at } = argv;

  if (!sessionId) {
    console.log(chalk.red('✗ --from <session-id> is required'));
    process.exit(1);
  }

  try {
    const sourceSession = sessionManager.load(sessionId);

    let splitIndex = sourceSession.messages.length;
    if (at) {
      const msgIdx = parseInt(at, 10);
      if (!isNaN(msgIdx) && msgIdx >= 0 && msgIdx < sourceSession.messages.length) {
        splitIndex = msgIdx + 1;
      } else {
        const msgById = sourceSession.messages.findIndex((m: { id: string }) => m.id.startsWith(at));
        if (msgById >= 0) {
          splitIndex = msgById + 1;
        } else {
          console.log(chalk.red(`✗ Message '${at}' not found in session`));
          process.exit(1);
        }
      }
    }

    const forkedMessages = sourceSession.messages.slice(0, splitIndex);
    const lastMessage = forkedMessages[forkedMessages.length - 1];
    const baseContext = lastMessage && 'content' in lastMessage
      ? (lastMessage as { content: string }).content.slice(0, 40)
      : 'forked';

    const newSession: Session = {
      id: randomUUID(),
      name: `${sourceSession.name}-fork-${Date.now().toString(36)}`,
      branch: `nexus/fork-${sourceSession.name.slice(0, 20)}-${Date.now().toString(36)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'active',
      messages: forkedMessages,
      metadata: { ...sourceSession.metadata },
      cost: {
        sessionTotal: 0,
        dailyTotal: 0,
        monthlyTotal: 0,
        budgetRemaining: sourceSession.cost.budgetRemaining,
        tokensUsed: sourceSession.cost.tokensUsed,
        savingsFromCompression: sourceSession.cost.savingsFromCompression,
        savingsFromFreeModels: sourceSession.cost.savingsFromFreeModels,
      },
    };

    sessionManager.save(newSession);

    console.log(chalk.green(`\n✓ Forked session from ${chalk.bold(sessionId.slice(0, 8))}`));
    console.log(chalk.dim(`  Source session: ${sessionId}`));
    console.log(chalk.dim(`  Forked messages: ${forkedMessages.length} (of ${sourceSession.messages.length})`));
    console.log(chalk.cyan(`  New session ID: ${newSession.id}\n`));
    console.log(chalk.dim('  Start a chat with this session:'));
    console.log(chalk.cyan(`  nexus chat\n`));
  } catch (err: unknown) {
    console.log(chalk.red(`\n✗ ${(err as Error).message}\n`));
    process.exit(1);
  }
}
