import { execSync } from 'node:child_process';
import path from 'node:path';
import chalk from 'chalk';
import type { Argv, ArgumentsCamelCase } from 'yargs';
import { ConfigManager, DEFAULT_CONFIG } from 'nexus-core';

const configManager = new ConfigManager();

function printConfig(obj: Record<string, unknown>, prefix = ''): void {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      console.log(chalk.bold.cyan(`\n${fullKey}:`));
      printConfig(value as Record<string, unknown>, fullKey);
    } else if (Array.isArray(value)) {
      console.log(`${chalk.dim(fullKey)}: ${chalk.white(value.join(', '))}`);
    } else {
      console.log(`${chalk.dim(fullKey)}: ${chalk.white(String(value))}`);
    }
  }
}

function configGet(args: ArgumentsCamelCase<{ key: string }>): void {
  const value = configManager.get(args.key);
  if (value === undefined) {
    console.log(chalk.red(`Key not found: ${args.key}`));
    process.exit(1);
  }
  if (typeof value === 'object') {
    console.log(JSON.stringify(value, null, 2));
  } else {
    console.log(String(value));
  }
}

function configSet(args: ArgumentsCamelCase<{ key: string; value: string }>): void {
  let parsed: unknown = args.value;
  if (args.value === 'true') parsed = true;
  else if (args.value === 'false') parsed = false;
  else if (/^-?\d+$/.test(args.value)) parsed = parseInt(args.value, 10);
  else if (/^-?\d+\.\d+$/.test(args.value)) parsed = parseFloat(args.value);
  else if (args.value.startsWith('[') || args.value.startsWith('{')) {
    try { parsed = JSON.parse(args.value); } catch { /* keep as string */ }
  }

  configManager.set(args.key, parsed);
  configManager.write();
  console.log(chalk.green(`✓ Set ${chalk.bold(args.key)} = ${chalk.white(JSON.stringify(parsed))}`));
}

function configList(): void {
  const config = configManager.get() as unknown as Record<string, unknown>;
  console.log(chalk.bold.cyan('\nNexus Configuration:\n'));
  printConfig(config);
  console.log();
}

function configEdit(): void {
  const configPath = path.join(process.env.HOME || '~', '.nexus', 'config.json');
  const editor = process.env.EDITOR || process.env.VISUAL || 'nano';

  try {
    execSync(`${editor} "${configPath}"`, { stdio: 'inherit' });
    console.log(chalk.green('✓ Configuration saved'));
  } catch {
    console.log(chalk.red(`Failed to open editor. Edit manually: ${configPath}`));
  }
}

function configReset(): void {
  const config = structuredClone(DEFAULT_CONFIG);
  configManager.write(config);
  console.log(chalk.green('✓ Configuration reset to defaults'));
}

export function configCommand(yargs: Argv): void {
  yargs
    .command('get <key>', 'Get a config value', () => {}, ((args: ArgumentsCamelCase<{ key: string }>) => {
      configGet(args);
    }) as never)
    .command('set <key> <value>', 'Set a config value', () => {}, ((args: ArgumentsCamelCase<{ key: string; value: string }>) => {
      configSet(args);
    }) as never)
    .command('list', 'Show full configuration', () => {}, configList as never)
    .command('edit', 'Open configuration in editor', () => {}, configEdit as never)
    .command('reset', 'Reset configuration to defaults', () => {}, configReset as never)
    .demandCommand(1, chalk.yellow('Please specify a subcommand'))
    .strict()
    .help();
}
