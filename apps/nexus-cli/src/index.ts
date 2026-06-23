#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';

import { initCommand } from './commands/init.js';
import { chatCommand } from './commands/chat.js';
import { configCommand } from './commands/config.js';
import { doctorCommand } from './commands/doctor.js';
import { sessionsCommand } from './commands/sessions.js';
import { forkCommand } from './commands/fork.js';

const BANNER = `
${chalk.bold.cyan('╔══════════════════════════════════════════╗')}
${chalk.bold.cyan('║')}          ${chalk.bold.green('Nexus — Coding Agent')}          ${chalk.bold.cyan('║')}
${chalk.bold.cyan('║')}       ${chalk.dim('Zero Cost · Zero Dependencies')}      ${chalk.bold.cyan('║')}
${chalk.bold.cyan('╚══════════════════════════════════════════╝')}
`;

yargs(hideBin(process.argv))
  .scriptName('nexus')
  .usage(`${BANNER}\n$0 <command> [options]`)
  .command('init', 'Initialize Nexus in current project', () => {}, (() => { initCommand().catch(console.error); }) as never)
  .command('chat', 'Start interactive chat session', () => {}, ((argv: { debug?: boolean; model?: string; noTui?: boolean; costMax?: number }) => {
    chatCommand(argv).catch(console.error);
  }) as never)
  .command('config', 'View/edit configuration', configCommand as never)
  .command('doctor', 'Run system diagnostics', () => {}, (() => { doctorCommand().catch(console.error); }) as never)
  .command('sessions', 'List/manage sessions', sessionsCommand as never)
  .command('fork', 'Fork a session from a specific message', () => {}, ((argv: { from?: string; at?: string }) => {
    forkCommand({ from: argv.from ?? '', at: argv.at }).catch(console.error);
  }) as never)
  .option('debug', {
    type: 'boolean',
    description: 'Enable debug logging',
    default: false,
  })
  .option('model', {
    type: 'string',
    description: 'Model to use for chat',
  })
  .option('no-tui', {
    type: 'boolean',
    description: 'Disable TUI, use simple readline',
    default: false,
  })
  .option('cost-max', {
    type: 'number',
    description: 'Maximum cost for a session',
  })
  .demandCommand(1, chalk.yellow('Please specify a command'))
  .strict()
  .help()
  .alias('h', 'help')
  .version()
  .alias('v', 'version')
  .parse();
