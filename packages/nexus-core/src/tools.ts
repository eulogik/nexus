import { existsSync, readFileSync, writeFileSync, statSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { execSync } from 'node:child_process';
import { ErrorCode } from './types.js';
import { NexusError } from './error.js';
import type { ReadArgs, WriteArgs, EditArgs, BashArgs, ToolMessage, ToolAPI } from './types.js';
import { minimatch } from 'minimatch';

const DEFAULT_BLOCKED_COMMANDS = [
  'sudo', 'su', 'chmod', 'chown', 'passwd',
  'shutdown', 'reboot', 'init', 'systemctl', 'service',
  'kill', 'pkill', 'mkfs', 'dd', 'fdisk', 'parted',
  'iptables', 'ufw', 'halt', 'poweroff',
];

const DEFAULT_BLOCKED_SUBSTRINGS = [
  'rm -rf /', 'rm -rf ~', 'rm -rf .',
  ':(){ :|:& };:',
  '> /dev/sda',
  '| sh', '| bash',
];

const DANGEROUS_PATTERNS = [
  /\brm\s+(-rf|--recursive)\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  />\s*\/dev\//,
  /\bchmod\s+777\b/,
  /\bchown\b/,
];

function isPathBlocked(filePath: string, blockedPaths: string[]): boolean {
  const resolved = resolve(filePath);
  for (const bp of blockedPaths) {
    const blocked = resolve(bp);
    if (resolved === blocked || resolved.startsWith(blocked + sep)) {
      return true;
    }
  }
  return false;
}

function isPathAllowed(filePath: string, allowedPaths: string[]): boolean {
  if (allowedPaths.length === 0) return true;
  const resolved = resolve(filePath);
  for (const ap of allowedPaths) {
    const allowed = resolve(ap);
    if (resolved === allowed || resolved.startsWith(allowed + sep)) {
      return true;
    }
  }
  return false;
}

function safetyCheck(command: string, options?: {
  blockedCommands?: string[];
  blockedSubstrings?: string[];
  dangerousPatterns?: RegExp[];
}): void {
  const blockedCommands = options?.blockedCommands ?? DEFAULT_BLOCKED_COMMANDS;
  const blockedSubstrings = options?.blockedSubstrings ?? DEFAULT_BLOCKED_SUBSTRINGS;
  const dangerousPatterns = options?.dangerousPatterns ?? DANGEROUS_PATTERNS;

  const cmdLower = command.toLowerCase().trim();

  for (const bc of blockedCommands) {
    const regex = new RegExp(`\\b${bc}\\b`, 'i');
    if (regex.test(cmdLower)) {
      if (cmdLower.startsWith(bc) || cmdLower.includes(` ${bc} `) || cmdLower.includes(`\n${bc} `)) {
        throw new NexusError(ErrorCode.TOOL_SAFETY_BLOCKED, `Command '${bc}' is blocked for safety reasons`);
      }
    }
  }

  for (const bs of blockedSubstrings) {
    if (cmdLower.includes(bs.toLowerCase())) {
      throw new NexusError(ErrorCode.TOOL_SAFETY_BLOCKED, `Command contains blocked pattern: '${bs}'`);
    }
  }

  for (const dp of dangerousPatterns) {
    if (dp.test(command)) {
      throw new NexusError(ErrorCode.TOOL_SAFETY_BLOCKED, `Command matches dangerous pattern: ${dp.source}`);
    }
  }
}

export async function readTool(args: ReadArgs, options?: {
  blockedPaths?: string[];
  allowedPaths?: string[];
  maxSize?: number;
}): Promise<ToolMessage['result']> {
  try {
    const filePath = resolve(args.filePath);
    const maxSize = options?.maxSize ?? 1_048_576;

    if (!existsSync(filePath)) {
      return { success: false, output: '', error: `File not found: ${args.filePath}`, exitCode: 1 };
    }

    const blocked = options?.blockedPaths ?? [];
    if (isPathBlocked(filePath, blocked)) {
      return { success: false, output: '', error: `Path is blocked: ${args.filePath}`, exitCode: 1 };
    }

    if (!isPathAllowed(filePath, options?.allowedPaths ?? [])) {
      return { success: false, output: '', error: `Path is not in allowed paths: ${args.filePath}`, exitCode: 1 };
    }

    const stat = statSync(filePath);
    if (stat.size > maxSize) {
      return { success: false, output: '', error: `File too large (${stat.size} bytes, max ${maxSize})`, exitCode: 1 };
    }

    const encoding = args.encoding ?? 'utf-8';
    const supportedEncodings = ['utf-8', 'ascii', 'base64', 'hex'];
    if (!supportedEncodings.includes(encoding)) {
      return { success: false, output: '', error: `Unsupported encoding: ${encoding}`, exitCode: 1 };
    }

    let content = readFileSync(filePath, encoding as BufferEncoding);

    if (args.offset !== undefined || args.limit !== undefined) {
      const lines = content.split('\n');
      const offset = args.offset ?? 0;
      const limit = args.limit ?? lines.length;
      content = lines.slice(offset, offset + limit).join('\n');
      const totalLines = lines.length;
      const isTruncated = offset + limit < totalLines;
      if (isTruncated) {
        content += `\n... (showing ${limit} of ${totalLines} lines)`;
      }
    }

    return { success: true, output: content, exitCode: 0 };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: `Read failed: ${(error as Error).message}`,
      exitCode: 1,
    };
  }
}

export async function writeTool(args: WriteArgs, options?: {
  blockedPaths?: string[];
  allowedPaths?: string[];
  maxSize?: number;
}): Promise<ToolMessage['result']> {
  try {
    const filePath = resolve(args.filePath);
    const maxSize = options?.maxSize ?? 1_048_576;

    if (args.content.length > maxSize) {
      return { success: false, output: '', error: `Content too large (${args.content.length} bytes, max ${maxSize})`, exitCode: 1 };
    }

    const blocked = options?.blockedPaths ?? [];
    if (isPathBlocked(filePath, blocked)) {
      return { success: false, output: '', error: `Path is blocked: ${args.filePath}`, exitCode: 1 };
    }

    if (!isPathAllowed(filePath, options?.allowedPaths ?? [])) {
      return { success: false, output: '', error: `Path is not in allowed paths: ${args.filePath}`, exitCode: 1 };
    }

    if (!args.overwrite && existsSync(filePath)) {
      return { success: false, output: '', error: `File already exists and overwrite flag not set: ${args.filePath}`, exitCode: 1 };
    }

    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(filePath, args.content, 'utf-8');
    return { success: true, output: `File written: ${args.filePath}`, exitCode: 0 };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: `Write failed: ${(error as Error).message}`,
      exitCode: 1,
    };
  }
}

export async function editTool(args: EditArgs, options?: {
  blockedPaths?: string[];
  allowedPaths?: string[];
}): Promise<ToolMessage['result']> {
  try {
    const filePath = resolve(args.filePath);

    if (!existsSync(filePath)) {
      return { success: false, output: '', error: `File not found: ${args.filePath}`, exitCode: 1 };
    }

    const blocked = options?.blockedPaths ?? [];
    if (isPathBlocked(filePath, blocked)) {
      return { success: false, output: '', error: `Path is blocked: ${args.filePath}`, exitCode: 1 };
    }

    let content = readFileSync(filePath, 'utf-8');

    if (args.replaceAll) {
      if (!content.includes(args.oldString)) {
        return { success: false, output: '', error: `oldString not found in file: ${args.oldString}`, exitCode: 1 };
      }
      const count = (content.match(new RegExp(escapeRegExp(args.oldString), 'g')) ?? []).length;
      content = content.replaceAll(args.oldString, args.newString);
      writeFileSync(filePath, content, 'utf-8');
      return { success: true, output: `Replaced ${count} occurrences in ${args.filePath}`, exitCode: 0 };
    }

    const idx = content.indexOf(args.oldString);
    if (idx === -1) {
      return { success: false, output: '', error: `oldString not found in file: ${args.oldString}`, exitCode: 1 };
    }

    const firstOccurrence = content.indexOf(args.oldString);
    const lastOccurrence = content.lastIndexOf(args.oldString);
    if (firstOccurrence !== lastOccurrence) {
      const errMsg = `Found multiple matches for oldString. Provide more surrounding context or use replaceAll.`;
      return { success: false, output: '', error: errMsg, exitCode: 1 };
    }

    content = content.replace(args.oldString, args.newString);
    writeFileSync(filePath, content, 'utf-8');
    return { success: true, output: `Edited ${args.filePath}`, exitCode: 0 };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: `Edit failed: ${(error as Error).message}`,
      exitCode: 1,
    };
  }
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function bashTool(args: BashArgs, options?: {
  blockedCommands?: string[];
  blockedSubstrings?: string[];
  dangerousPatterns?: RegExp[];
  defaultTimeout?: number;
  maxTimeout?: number;
}): Promise<ToolMessage['result']> {
  try {
    const timeout = Math.min(
      args.timeout ?? options?.defaultTimeout ?? 30_000,
      options?.maxTimeout ?? 300_000,
    );

    safetyCheck(args.command, {
      blockedCommands: options?.blockedCommands ?? DEFAULT_BLOCKED_COMMANDS,
      blockedSubstrings: options?.blockedSubstrings ?? DEFAULT_BLOCKED_SUBSTRINGS,
      dangerousPatterns: options?.dangerousPatterns ?? DANGEROUS_PATTERNS,
    });

    const env = args.env
      ? { ...process.env as Record<string, string>, ...args.env }
      : (process.env as Record<string, string>);

    const stdout = execSync(args.command, {
      timeout,
      cwd: args.workdir ? resolve(args.workdir) : undefined,
      env,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const output = stdout.trim();
    return { success: true, output: output || '(no output)', exitCode: 0 };
  } catch (error: unknown) {
    const err = error as Error & { stdout?: string; stderr?: string; status?: number };
    const exitCode = err.status ?? 1;
    const stderr = err.stderr ?? '';
    const stdout = err.stdout ?? '';
    const combined = [stdout, stderr].filter(Boolean).join('\n').trim();

    return {
      success: exitCode === 0,
      output: combined || err.message || 'Command failed',
      error: err.message || 'Command execution error',
      exitCode,
    };
  }
}

function walkDir(dir: string, basePath: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (entry.isDirectory()) {
        results.push(...walkDir(fullPath, basePath));
      } else if (entry.isFile()) {
        results.push(relative(basePath, fullPath));
      }
    }
  } catch {
    // skip directories we can't read
  }
  return results;
}

export async function globTool(args: { pattern: string; path?: string }): Promise<ToolMessage['result']> {
  try {
    const searchPath = resolve(args.path ?? '.');
    if (!existsSync(searchPath)) {
      return { success: false, output: '', error: `Path not found: ${args.path}`, exitCode: 1 };
    }
    const allFiles = walkDir(searchPath, searchPath);
    const matched = allFiles.filter((f) => minimatch(f, args.pattern, { dot: false, matchBase: false }));
    return { success: true, output: matched.join('\n') || '(no matches)', exitCode: 0 };
  } catch (error) {
    return { success: false, output: '', error: `Glob failed: ${(error as Error).message}`, exitCode: 1 };
  }
}

export async function grepTool(args: {
  pattern: string;
  path?: string;
  include?: string;
  exclude?: string;
}): Promise<ToolMessage['result']> {
  try {
    const searchPath = args.path ?? '.';
    let cmd = `rg --line-number --with-filename '${args.pattern.replace(/'/g, "'\\''")}' '${searchPath}'`;
    if (args.include) {
      cmd += ` --glob '${args.include}'`;
    }
    if (args.exclude) {
      cmd += ` --glob '!${args.exclude}'`;
    }

    const stdout = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 30_000 });
    return { success: true, output: stdout.trim() || '(no matches)', exitCode: 0 };
  } catch (error: unknown) {
    const err = error as Error & { status?: number; stderr?: string };
    if (err.status === 1) {
      return { success: true, output: '(no matches)', exitCode: 0 };
    }
    return { success: false, output: '', error: `Grep failed: ${(error as Error).message}`, exitCode: 1 };
  }
}

export async function searchTool(args: { pattern: string; path?: string }): Promise<ToolMessage['result']> {
  return globTool(args);
}

export function getAllTools(options?: {
  blockedPaths?: string[];
  allowedPaths?: string[];
  readMaxSize?: number;
  writeMaxSize?: number;
  bashTimeoutDefault?: number;
  bashTimeoutMax?: number;
  blockedCommands?: string[];
  blockedSubstrings?: string[];
  dangerousPatterns?: RegExp[];
}): ToolAPI {
  const toolOptions = {
    blockedPaths: options?.blockedPaths ?? [],
    allowedPaths: options?.allowedPaths ?? [],
    maxSize: options?.readMaxSize ?? 1_048_576,
  };

  return {
    async read(args: ReadArgs) {
      return readTool(args, {
        ...toolOptions,
        maxSize: options?.readMaxSize ?? 1_048_576,
      });
    },

    async write(args: WriteArgs) {
      return writeTool(args, {
        ...toolOptions,
        maxSize: options?.writeMaxSize ?? 1_048_576,
      });
    },

    async edit(args: EditArgs) {
      return editTool(args, toolOptions);
    },

    async bash(args: BashArgs) {
      return bashTool(args, {
        blockedCommands: options?.blockedCommands ?? DEFAULT_BLOCKED_COMMANDS,
        blockedSubstrings: options?.blockedSubstrings ?? DEFAULT_BLOCKED_SUBSTRINGS,
        dangerousPatterns: options?.dangerousPatterns ?? DANGEROUS_PATTERNS,
        defaultTimeout: options?.bashTimeoutDefault ?? 30_000,
        maxTimeout: options?.bashTimeoutMax ?? 300_000,
      });
    },

    async glob(args: { pattern: string; path?: string }) {
      return globTool(args);
    },

    async grep(args: { pattern: string; path?: string; include?: string }) {
      return grepTool(args);
    },

    async search(args: { pattern: string; path?: string }) {
      return searchTool(args);
    },
  };
}
