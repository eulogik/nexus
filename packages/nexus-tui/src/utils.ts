import chalk from 'chalk';

export function formatTokens(n: number): string {
  if (n < 0) return '0';
  return n.toLocaleString('en-US');
}

export function formatCost(n: number): string {
  if (n <= 0) return '$0.00';
  if (n < 0.0001) return '$0.0000';
  if (n < 0.01) return '$' + n.toFixed(4);
  return '$' + n.toFixed(2);
}

export function formatTime(ms: number): string {
  if (ms < 0) return '0ms';
  if (ms < 1000) return ms + 'ms';
  if (ms <= 60_000) return (ms / 1000).toFixed(1) + 's';
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return m + 'm ' + s + 's';
}

export function truncate(str: string, max: number): string {
  if (max < 3) return '...';
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

const ANSI_PATTERN = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

export function stripAnsi(str: string): string {
  return str.replace(ANSI_PATTERN, '');
}

const KEYWORDS: Record<string, string[]> = {
  js: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'from', 'async', 'await', 'try', 'catch', 'throw', 'new', 'this', 'typeof', 'instanceof', 'true', 'false', 'null', 'undefined'],
  ts: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'from', 'async', 'await', 'try', 'catch', 'throw', 'new', 'this', 'typeof', 'instanceof', 'true', 'false', 'null', 'undefined', 'interface', 'type', 'enum', 'implements', 'extends'],
  py: ['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'yield', 'lambda', 'pass', 'break', 'continue', 'and', 'or', 'not', 'in', 'is', 'None', 'True', 'False'],
  go: ['func', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'break', 'continue', 'var', 'const', 'type', 'struct', 'interface', 'map', 'chan', 'go', 'defer', 'select', 'package', 'import', 'true', 'false', 'nil'],
  rust: ['fn', 'let', 'mut', 'return', 'if', 'else', 'for', 'while', 'loop', 'match', 'enum', 'struct', 'impl', 'trait', 'pub', 'use', 'mod', 'crate', 'self', 'super', 'where', 'as', 'in', 'ref', 'move', 'async', 'await', 'true', 'false'],
};

const LANG_ALIASES: Record<string, string> = {
  javascript: 'js', typescript: 'ts', python: 'py',
  golang: 'go', rust: 'rust', rs: 'rust', jsx: 'js', tsx: 'ts',
};

const STRING_RE = /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/g;
const COMMENT_RE = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm;
const NUMBER_RE = /\b(\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g;
const KEYWORD_RE = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;

export function highlightCode(code: string, lang?: string): string {
  const normalized = lang ? (LANG_ALIASES[lang.toLowerCase()] ?? lang.toLowerCase()) : '';
  const keywords = KEYWORDS[normalized];

  let result = code;

  result = result.replace(COMMENT_RE, (m) => chalk.gray(m));
  result = result.replace(STRING_RE, (m) => chalk.green(m));
  result = result.replace(NUMBER_RE, (m) => chalk.yellow(m));

  if (keywords) {
    result = result.replace(KEYWORD_RE, (m) => {
      return keywords.includes(m) ? chalk.cyan(m) : m;
    });
  }

  return result;
}
