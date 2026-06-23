import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hostname, freemem, totalmem } from 'node:os';
import chalk from 'chalk';

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

function check(name: string, pass: boolean, passMsg: string, failMsg: string): CheckResult {
  return { name, status: pass ? 'pass' : 'fail', message: pass ? passMsg : failMsg };
}

function success(msg: string): string {
  return `${chalk.green('✓')} ${msg}`;
}

function failure(msg: string): string {
  return `${chalk.red('✗')} ${msg}`;
}

function warning(msg: string): string {
  return `${chalk.yellow('⚠')} ${msg}`;
}

function printResults(results: CheckResult[]): void {
  const passes = results.filter((r) => r.status === 'pass').length;
  const fails = results.filter((r) => r.status === 'fail').length;
  const warns = results.filter((r) => r.status === 'warn').length;

  for (const result of results) {
    const icon = result.status === 'pass' ? success('') : result.status === 'fail' ? failure('') : warning('');
    const color = result.status === 'pass' ? chalk.green : result.status === 'fail' ? chalk.red : chalk.yellow;
    console.log(`  ${icon} ${chalk.bold(result.name)}: ${color(result.message)}`);
  }

  console.log(chalk.dim(`\n  ${passes} passed, ${fails} failed, ${warns} warnings\n`));
}

export async function doctorCommand(): Promise<void> {
  console.log(chalk.cyan('\n🔍 Running Nexus Diagnostics\n'));
  console.log(chalk.dim(`  Host: ${hostname()}`));
  console.log(chalk.dim(`  PID: ${process.pid}`));
  console.log(chalk.dim(`  Time: ${new Date().toISOString()}\n`));

  const results: CheckResult[] = [];

  results.push(check(
    'Node.js Version',
    process.versions.node >= '20.18.0',
    `v${process.versions.node} (>=20.18.0)`,
    `v${process.versions.node} (<20.18.0 minimum)`,
  ));

  let pnpmAvailable = false;
  try {
    execSync('pnpm --version', { encoding: 'utf-8', stdio: 'pipe' });
    pnpmAvailable = true;
  } catch { /* not available */ }
  results.push(check(
    'pnpm',
    pnpmAvailable,
    'Available',
    'pnpm not found (recommended)',
  ));

  let gitAvailable = false;
  let gitVersion = '';
  try {
    gitVersion = execSync('git --version', { encoding: 'utf-8', stdio: 'pipe' }).trim();
    gitAvailable = true;
  } catch { /* not available */ }
  results.push(check(
    'Git',
    gitAvailable,
    gitVersion || 'Available',
    'Git not found',
  ));

  let isRepo = false;
  if (gitAvailable) {
    try {
      execSync('git rev-parse --is-inside-work-tree', { encoding: 'utf-8', stdio: 'pipe' });
      isRepo = true;
    } catch { /* not a repo */ }
  }
  results.push(check(
    'Git Repository',
    isRepo,
    'Valid git repository',
    'Not a git repository (recommended)',
  ));

  const configPath = resolve('.nexus/config.json');
  let configValid = false;
  let configMsg = 'Not found';
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      JSON.parse(raw);
      configValid = true;
      configMsg = 'Valid JSON config';
    } catch {
      configMsg = 'Invalid JSON';
    }
  }
  results.push(check(
    'Configuration',
    configValid,
    configMsg,
    configMsg,
  ));

  const apiKey = process.env.NEXUS_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || process.env.NEXUS_OPENROUTER_KEY || '';
  results.push(check(
    'OpenRouter API Key',
    apiKey.length > 0,
    apiKey.length > 0 ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : 'Set',
    'Not set (required for AI features)',
  ));

  if (apiKey) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      results.push(check(
        'API Connectivity (OpenRouter)',
        response.ok,
        `Reachable (${response.status})`,
        `Failed (${response.status}: ${response.statusText})`,
      ));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push(check(
        'API Connectivity (OpenRouter)',
        false,
        'Reachable',
        `Connection failed: ${msg}`,
      ));
    }
  }

  const freeMemory = freemem() / 1024 / 1024;
  const totalMemory = totalmem() / 1024 / 1024;
  const freePercent = (freeMemory / totalMemory) * 100;
  results.push(check(
    'Memory',
    freePercent > 10,
    `${freeMemory.toFixed(0)} MB free (${freePercent.toFixed(0)}%)`,
    `Low memory: ${freeMemory.toFixed(0)} MB free (${freePercent.toFixed(0)}%)`,
  ));

  printResults(results);

  if (results.some((r) => r.status === 'fail')) {
    console.log(chalk.yellow('  Some checks failed. Fix the issues above and re-run `nexus doctor`.\n'));
  } else {
    console.log(chalk.green('  All checks passed! Nexus is ready to use.\n'));
  }
}
