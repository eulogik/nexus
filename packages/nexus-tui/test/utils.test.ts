import { describe, it, expect } from 'vitest';
import chalk from 'chalk';
import { formatTokens, formatCost, formatTime, truncate, stripAnsi, highlightCode } from '../src/utils.js';

beforeAll(() => {
  chalk.level = 3;
});

describe('formatTokens', () => {
  it('formats 0 as "0"', () => {
    expect(formatTokens(0)).toBe('0');
  });

  it('formats 1000 as "1,000"', () => {
    expect(formatTokens(1000)).toBe('1,000');
  });

  it('formats 1000000 as "1,000,000"', () => {
    expect(formatTokens(1000000)).toBe('1,000,000');
  });

  it('handles negative by returning "0"', () => {
    expect(formatTokens(-5)).toBe('0');
    expect(formatTokens(-1000)).toBe('0');
  });
});

describe('formatCost', () => {
  it('formats 0 as "$0.00"', () => {
    expect(formatCost(0)).toBe('$0.00');
  });

  it('formats 1.5 as "$1.50"', () => {
    expect(formatCost(1.5)).toBe('$1.50');
  });

  it('formats 0.1234 as "$0.12"', () => {
    expect(formatCost(0.1234)).toBe('$0.12');
  });

  it('formats negative as "$0.00"', () => {
    expect(formatCost(-1)).toBe('$0.00');
    expect(formatCost(-0.5)).toBe('$0.00');
  });
});

describe('formatTime', () => {
  it('formats 0 as "0ms"', () => {
    expect(formatTime(0)).toBe('0ms');
  });

  it('formats 500 as "500ms"', () => {
    expect(formatTime(500)).toBe('500ms');
  });

  it('formats 1500 as "1.5s"', () => {
    expect(formatTime(1500)).toBe('1.5s');
  });

  it('formats 60000 as "60.0s"', () => {
    expect(formatTime(60000)).toBe('60.0s');
  });

  it('handles negative as "0ms"', () => {
    expect(formatTime(-100)).toBe('0ms');
  });
});

describe('truncate', () => {
  it('returns string unchanged when under max', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates with "…" when over max', () => {
    const result = truncate('hello world', 5);
    expect(result).toBe('hell…');
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('handles max < 3 by returning "..."', () => {
    expect(truncate('hello', 2)).toBe('...');
    expect(truncate('hello', 1)).toBe('...');
  });

  it('handles exact boundary', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});

describe('stripAnsi', () => {
  it('removes ANSI color codes', () => {
    const input = '\u001b[31mred\u001b[0m';
    expect(stripAnsi(input)).toBe('red');
  });

  it('returns plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });
});

describe('highlightCode', () => {
  it('returns string containing ANSI codes for known languages', () => {
    const result = highlightCode('const x = 1;', 'js');
    expect(result).toContain('\u001b[');
    expect(result).not.toBe('const x = 1;');
  });

  it('returns plain text for unknown language', () => {
    const result = highlightCode('abc def', 'unknown');
    expect(result).toBe('abc def');
  });
});
