import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import chalk from 'chalk';

const DEFAULT_CONFIG = {
  session: {
    maxIterations: 50,
    maxToolCallsPerIteration: 1,
    defaultApprovalLevel: 'auto',
    autoContinue: false,
    saveOnEveryMessage: true,
    askOnTaskCompletion: true,
  },
  git: {
    enabled: true,
    autoCommit: true,
    autoCommitPrefix: 'nexus',
    defaultBranch: 'main',
    commitMessageTemplate: 'nexus/{session-name}-{date}',
    mergeStrategy: 'squash',
  },
  tools: {
    readMaxSize: 1_048_576,
    writeMaxSize: 1_048_576,
    bashTimeoutDefault: 30_000,
    bashTimeoutMax: 300_000,
    blockedCommands: ['sudo', 'su', 'chmod', 'chown', 'passwd', 'shutdown', 'reboot', 'init', 'systemctl', 'service', 'kill', 'pkill', 'mkfs', 'dd', 'fdisk', 'parted', 'iptables', 'ufw'],
    blockedSubstrings: ['rm -rf /', 'rm -rf ~', 'rm -rf .', ':(){ :|:& };:', '> /dev/sda', '| sh', '| bash', 'curl.*| sh', 'wget.*| sh'],
    allowedPaths: [],
    blockedPaths: ['/etc', '/usr', '/bin', '/sbin', '/dev', '/proc', '/sys'],
    dangerousPatterns: ['rm\\s+(-rf|--recursive)', 'mkfs', 'dd\\s+if=', '>\\s*/dev/', 'chmod\\s+777', 'chown\\s', 'wget.*\\|', 'curl.*\\|'],
  },
  compression: {
    enabled: true,
    minTokens: 2000,
    ratio: 0.5,
    strategy: 'truncate',
  },
  micro: {
    enabled: true,
    maxTokens: 500,
    routeThreshold: 'auto',
    preferredModel: 'qwen/qwen3-235b-a22b:free',
  },
  cost: {
    budget: 10.0,
    dailyLimit: 5.0,
    monthlyLimit: 50.0,
    warnAtPercent: 80,
    maxSessionCost: 2.0,
    trackFreeModels: true,
  },
  approval: {
    enabled: true,
    persistLearnedRules: true,
    learnedRulesFile: '~/.nexus/approval-rules.json',
    alwaysAsk: [],
    autoApprove: [],
    confidenceDecayPerMonth: 0.9,
  },
  plugins: {
    enabled: true,
    paths: [],
  },
};

async function askOverwrite(dir: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  const answer = await rl.question(chalk.yellow(`Directory ${chalk.bold(dir)} already exists. Overwrite? [y/N] `));
  rl.close();
  return answer.toLowerCase() === 'y';
}

export async function initCommand(): Promise<void> {
  const projectDir = process.cwd();
  const nexusDir = resolve(projectDir, '.nexus');

  console.log(chalk.cyan('\n⚡ Initializing Nexus in project...\n'));

  if (existsSync(nexusDir)) {
    const overwrite = await askOverwrite('.nexus');
    if (!overwrite) {
      console.log(chalk.yellow('✗ Initialization cancelled.\n'));
      return;
    }
  }

  const dirs = [nexusDir, join(nexusDir, 'sessions'), join(nexusDir, 'models')];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(chalk.green(`  ✓ Created ${chalk.dim(dir)}`));
    } else {
      console.log(chalk.dim(`  • Already exists ${chalk.dim(dir)}`));
    }
  }

  const configPath = join(nexusDir, 'config.json');
  writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
  console.log(chalk.green(`  ✓ Wrote ${chalk.dim(configPath)}`));

  console.log(chalk.cyan('\n✅ Nexus initialized successfully!\n'));
  console.log(chalk.dim('  Next steps:'));
  console.log(chalk.dim('    • Set your API key:'));
  console.log(chalk.cyan('      export OPENROUTER_API_KEY=sk-...'));
  console.log(chalk.dim('    • Start a chat session:'));
  console.log(chalk.cyan('      nexus chat\n'));
}
