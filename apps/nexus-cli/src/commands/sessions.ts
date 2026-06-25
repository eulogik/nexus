import { resolve } from 'node:path';
import chalk from 'chalk';
import type { Argv, ArgumentsCamelCase } from 'yargs';
import { SessionManager } from 'nexus-core';
import type { Session } from 'nexus-core';

const sessionManager = new SessionManager('.nexus/sessions');

function formatDate(ts: number): string {
  if (!ts || isNaN(ts)) return 'Unknown';
  return new Date(ts).toLocaleString();
}

function formatCost(cost: number): string {
  if (typeof cost !== 'number' || isNaN(cost)) return '$0.000000';
  return `$${cost.toFixed(6)}`;
}

function formatStatus(status: string): string {
  const colors: Record<string, (s: string) => string> = {
    active: chalk.green,
    paused: chalk.yellow,
    completed: chalk.blue,
    error: chalk.red,
    aborted: chalk.red,
  };
  const color = colors[status] ?? chalk.white;
  return color(status);
}

function sessionList(): void {
  const sessions = sessionManager.list();
  if (sessions.length === 0) {
    console.log(chalk.yellow('\nNo sessions found.\n'));
    return;
  }

  console.log(chalk.bold.cyan(`\nSessions (${sessions.length}):\n`));
  console.log(chalk.dim('  ID'.padEnd(38) + 'Name'.padEnd(30) + 'Status'.padEnd(12) + 'Cost'.padEnd(14) + 'Updated'));
  console.log(chalk.dim('  ' + '─'.repeat(100)));

  for (const s of sessions) {
    const id = (s.id || '').slice(0, 36);
    const name = (s.name || '').slice(0, 28);
    const status = formatStatus(s.status || 'completed');
    const cost = formatCost(s.cost?.sessionTotal ?? 0);
    const date = formatDate(s.updatedAt);
    console.log(`  ${chalk.dim(id)} ${chalk.white(name.padEnd(28))} ${status.padEnd(12)} ${chalk.cyan(cost.padEnd(12))} ${chalk.dim(date)}`);
  }
  console.log();
}

function sessionShow(args: ArgumentsCamelCase<{ id: string }>): void {
  try {
    const session = sessionManager.load(args.id);
    console.log(chalk.bold.cyan(`\nSession: ${session.name}\n`));
    console.log(`  ${chalk.bold('ID:')}      ${chalk.dim(session.id)}`);
    console.log(`  ${chalk.bold('Status:')}  ${formatStatus(session.status)}`);
    console.log(`  ${chalk.bold('Created:')} ${formatDate(session.createdAt)}`);
    console.log(`  ${chalk.bold('Updated:')} ${formatDate(session.updatedAt)}`);
    console.log(`  ${chalk.bold('Branch:')}  ${chalk.dim(session.branch)}`);
    console.log(`  ${chalk.bold('Model:')}   ${session.metadata.model || chalk.dim('(not set)')}`);
    console.log(`  ${chalk.bold('Cost:')}    ${chalk.cyan(formatCost(session.cost.sessionTotal))}`);
    console.log(`  ${chalk.bold('Tokens:')}  ${session.cost.tokensUsed.toLocaleString()}`);
    console.log(`  ${chalk.bold('Mode:')}    ${session.metadata.agentMode || 'code'}`);
    console.log(`  ${chalk.bold('Messages:')} ${session.messages.length}`);

    if (session.messages.length > 0) {
      console.log(chalk.bold.cyan('\n  Recent Messages:\n'));
      const recent = session.messages.slice(-5);
      for (const msg of recent) {
        const role = msg.role === 'user' ? chalk.green('user') : msg.role === 'assistant' ? chalk.blue('assistant') : chalk.yellow(msg.role);
        const preview = msg.role === 'tool'
          ? `${msg.toolName}: ${msg.result.success ? chalk.green('✓') : chalk.red('✗')}`
          : (msg as { content: string }).content.slice(0, 80).replace(/\n/g, ' ');
        console.log(`  [${role}] ${chalk.dim(preview)}`);
      }
    }
    console.log();
  } catch (err: unknown) {
    console.log(chalk.red(`\n✗ ${(err as Error).message}\n`));
  }
}

function sessionDelete(args: ArgumentsCamelCase<{ id: string }>): void {
  try {
    sessionManager.delete(args.id);
    console.log(chalk.green(`\n✓ Session ${chalk.bold(args.id.slice(0, 8))} deleted.\n`));
  } catch (err: unknown) {
    console.log(chalk.red(`\n✗ ${(err as Error).message}\n`));
  }
}

async function sessionExport(args: ArgumentsCamelCase<{ id: string }>): Promise<void> {
  try {
    const session = sessionManager.load(args.id);

    let output = `# Session: ${session.name}\n\n`;
    output += `- **ID**: ${session.id}\n`;
    output += `- **Status**: ${session.status}\n`;
    output += `- **Created**: ${formatDate(session.createdAt)}\n`;
    output += `- **Updated**: ${formatDate(session.updatedAt)}\n`;
    output += `- **Model**: ${session.metadata.model || '(not set)'}\n`;
    output += `- **Total Cost**: ${formatCost(session.cost.sessionTotal)}\n`;
    output += `- **Tokens Used**: ${session.cost.tokensUsed.toLocaleString()}\n\n`;

    output += `## Messages\n\n`;
    for (const msg of session.messages) {
      const role = msg.role.toUpperCase();
      const content = 'content' in msg ? (msg as { content: string }).content : '';
      output += `### ${role}\n\n${content}\n\n`;
      if (msg.role === 'assistant' && 'toolCalls' in msg && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          output += `> **Tool**: ${tc.tool}\n> **Status**: ${tc.status}\n\n`;
        }
      }
    }

    const filePath = resolve(`${session.name}-${session.id.slice(0, 8)}.md`);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(filePath, output, 'utf-8');
    console.log(chalk.green(`\n✓ Session exported to ${chalk.bold(filePath)}\n`));
  } catch (err: unknown) {
    console.log(chalk.red(`\n✗ ${(err as Error).message}\n`));
  }
}

export function sessionsCommand(yargs: Argv): void {
  yargs
    .command('list', 'List all sessions', () => {}, sessionList as never)
    .command('show <id>', 'Show session details', () => {}, sessionShow as never)
    .command('delete <id>', 'Delete a session', () => {}, sessionDelete as never)
    .command('export <id>', 'Export session as markdown', () => {}, sessionExport as never)
    .demandCommand(1, chalk.yellow('Please specify a subcommand'))
    .strict()
    .help();
}
