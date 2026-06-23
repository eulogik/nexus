import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, rmSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readTool, writeTool, editTool, bashTool, globTool, grepTool, getAllTools,
} from '../src/tools.js';
import type { ReadArgs, WriteArgs, EditArgs, BashArgs } from '../src/types.js';

let tempDir: string;

function tmpFile(name = 'test.txt'): string {
  return join(tempDir, name);
}

function mkTemp(content: string, name = 'test.txt'): string {
  const p = tmpFile(name);
  mkdirSync(tempDir, { recursive: true });
  writeFileSync(p, content, 'utf-8');
  return p;
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'nexus-tools-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('readTool', () => {
  it('reads file content', async () => {
    const fp = mkTemp('hello world\nline 2');
    const result = await readTool({ filePath: fp });
    expect(result.success).toBe(true);
    expect(result.output).toBe('hello world\nline 2');
  });

  it('with offset and limit works', async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
    const fp = mkTemp(lines.join('\n'));
    const result = await readTool({ filePath: fp, offset: 2, limit: 3 });
    expect(result.success).toBe(true);
    expect(result.output).toContain('line 3');
    expect(result.output).toContain('line 4');
    expect(result.output).toContain('line 5');
    expect(result.output).toContain('showing 3 of 10 lines');
  });

  it('returns error for non-existent file', async () => {
    const result = await readTool({ filePath: tmpFile('nope.txt') });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns error for blocked path', async () => {
    const result = await readTool({ filePath: '/etc/passwd' }, { blockedPaths: ['/etc'] });
    expect(result.success).toBe(false);
    expect(result.error).toContain('blocked');
  });

  it('returns error for file too large', async () => {
    const fp = mkTemp('x'.repeat(100));
    const result = await readTool({ filePath: fp }, { maxSize: 10 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('too large');
  });

  it('returns error for unsupported encoding', async () => {
    const fp = mkTemp('test');
    const args: ReadArgs = { filePath: fp, encoding: 'latin1' as 'utf-8' };
    const result = await readTool(args);
    expect(result.success).toBe(false);
    expect(result.error).toContain('encoding');
  });
});

describe('writeTool', () => {
  it('creates new files', async () => {
    const fp = tmpFile('newfile.txt');
    const result = await writeTool({ filePath: fp, content: 'fresh content' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('written');
    expect(readFileSync(fp, 'utf-8')).toBe('fresh content');
  });

  it('with overwrite=false refuses existing file', async () => {
    mkTemp('existing', 'existing.txt');
    const fp = tmpFile('existing.txt');
    const result = await writeTool({ filePath: fp, content: 'new', overwrite: false });
    expect(result.success).toBe(false);
    expect(result.error).toContain('exists');
  });

  it('with overwrite=true overwrites existing file', async () => {
    mkTemp('old content', 'overwrite.txt');
    const fp = tmpFile('overwrite.txt');
    const result = await writeTool({ filePath: fp, content: 'new content', overwrite: true });
    expect(result.success).toBe(true);
    expect(readFileSync(fp, 'utf-8')).toBe('new content');
  });

  it('creates intermediate directories', async () => {
    const fp = join(tempDir, 'a', 'b', 'c', 'deep.txt');
    const result = await writeTool({ filePath: fp, content: 'deep' });
    expect(result.success).toBe(true);
    expect(existsSync(fp)).toBe(true);
  });

  it('rejects content exceeding maxSize', async () => {
    const fp = tmpFile('large.txt');
    const result = await writeTool({ filePath: fp, content: 'x'.repeat(100) }, { maxSize: 10 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('too large');
  });
});

describe('editTool', () => {
  it('replaces exact string', async () => {
    const fp = mkTemp('The quick brown fox');
    const result = await editTool({ filePath: fp, oldString: 'brown', newString: 'red' });
    expect(result.success).toBe(true);
    expect(readFileSync(fp, 'utf-8')).toBe('The quick red fox');
  });

  it('fails if oldString not found', async () => {
    const fp = mkTemp('hello world');
    const result = await editTool({ filePath: fp, oldString: 'goodbye', newString: 'hi' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('fails if file does not exist', async () => {
    const fp = tmpFile('nonexistent.txt');
    const result = await editTool({ filePath: fp, oldString: 'a', newString: 'b' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('replaceAll replaces all occurrences', async () => {
    const fp = mkTemp('foo bar foo bar foo');
    const result = await editTool({ filePath: fp, oldString: 'foo', newString: 'baz', replaceAll: true });
    expect(result.success).toBe(true);
    expect(result.output).toContain('Replaced 3 occurrences');
    expect(readFileSync(fp, 'utf-8')).toBe('baz bar baz bar baz');
  });

  it('rejects ambiguous single replace', async () => {
    const fp = mkTemp('same same same');
    const result = await editTool({ filePath: fp, oldString: 'same', newString: 'diff' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('multiple matches');
  });
});

describe('bashTool', () => {
  it('executes command and returns output', async () => {
    const result = await bashTool({ command: 'echo hello' });
    expect(result.success).toBe(true);
    expect(result.output).toBe('hello');
  });

  it('with workdir changes directory', async () => {
    const result = await bashTool({ command: 'pwd', workdir: tempDir });
    expect(result.success).toBe(true);
    const realTemp = realpathSync(tempDir);
    expect(result.output).toBe(realTemp);
  });

  it('returns error for non-existent command', async () => {
    const result = await bashTool({ command: 'nonexistentcmd12345' });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('safetyCheck blocks dangerous commands', async () => {
    const result = await bashTool({ command: 'sudo rm -rf /' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('blocked');
  });

  it('safetyCheck blocks dangerous patterns', async () => {
    const result = await bashTool({ command: 'chmod 777 /tmp/foo' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('blocked');
  });

  it('safetyCheck blocks rm -rf /', async () => {
    const result = await bashTool({ command: 'rm -rf /var/log' }, {
      blockedSubstrings: ['rm -rf /'],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('blocked');
  });
});

describe('globTool', () => {
  it('returns matching files', async () => {
    writeFileSync(join(tempDir, 'a.ts'), '// a', 'utf-8');
    writeFileSync(join(tempDir, 'b.ts'), '// b', 'utf-8');
    writeFileSync(join(tempDir, 'c.js'), '// c', 'utf-8');
    const result = await globTool({ pattern: '*.ts', path: tempDir });
    expect(result.success).toBe(true);
    expect(result.output).toContain('a.ts');
    expect(result.output).toContain('b.ts');
    expect(result.output).not.toContain('c.js');
  });

  it('returns empty for no matches', async () => {
    writeFileSync(join(tempDir, 'a.txt'), 'hello', 'utf-8');
    const result = await globTool({ pattern: '*.md', path: tempDir });
    expect(result.success).toBe(true);
    expect(result.output).toBe('(no matches)');
  });

  it('returns error for invalid path', async () => {
    const result = await globTool({ pattern: '*', path: join(tempDir, 'nonexistent') });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});

describe('grepTool', () => {
  const rgAvailable = (() => {
    try {
      const { execSync } = require('node:child_process');
      execSync('rg --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  })();

  it('finds patterns in files', async () => {
    if (!rgAvailable) return;
    writeFileSync(join(tempDir, 'search.txt'), 'apple\nbanana\ncherry\n', 'utf-8');
    const result = await grepTool({ pattern: 'ana', path: tempDir });
    expect(result.success).toBe(true);
    expect(result.output).toContain('banana');
  });

  it('returns no matches for non-existent pattern', async () => {
    if (!rgAvailable) return;
    writeFileSync(join(tempDir, 'data.txt'), 'hello world', 'utf-8');
    const result = await grepTool({ pattern: 'zzzzz', path: tempDir });
    expect(result.success).toBe(true);
  });
});

describe('getAllTools', () => {
  it('returns object with all tool functions', () => {
    const tools = getAllTools();
    expect(tools).toHaveProperty('read');
    expect(tools).toHaveProperty('write');
    expect(tools).toHaveProperty('edit');
    expect(tools).toHaveProperty('bash');
    expect(tools).toHaveProperty('glob');
    expect(tools).toHaveProperty('grep');
    expect(tools).toHaveProperty('search');
  });

  it('all tool functions are callable', async () => {
    const tools = getAllTools();
    const fp = mkTemp('test content for tools API');
    const readResult = await tools.read({ filePath: fp });
    expect(readResult.success).toBe(true);
    expect(readResult.output).toBe('test content for tools API');
  });

  it('passes blockedPaths to readTool', async () => {
    const tools = getAllTools({ blockedPaths: ['/etc'] });
    const result = await tools.read({ filePath: '/etc/hosts' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('blocked');
  });
});
