import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import clsx from 'clsx';

interface DiffLine {
  type: 'added' | 'removed' | 'context' | 'hunk';
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

interface HunkHeader {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

function parseUnifiedDiff(diff: string): DiffLine[] {
  const lines = diff.split('\n');
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let currentHunk: HunkHeader | null = null;

  for (const raw of lines) {
    const line = raw;

    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      continue;
    }

    const hunkMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
    if (hunkMatch) {
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldCount: parseInt(hunkMatch[2] || '1', 10),
        newStart: parseInt(hunkMatch[3], 10),
        newCount: parseInt(hunkMatch[4] || '1', 10),
      };
      oldLine = currentHunk.oldStart;
      newLine = currentHunk.newStart;
      result.push({ type: 'hunk', content: line, oldLine: null, newLine: null });
      continue;
    }

    if (line.startsWith('+')) {
      result.push({ type: 'added', content: line.slice(1), oldLine: null, newLine: newLine });
      newLine++;
    } else if (line.startsWith('-')) {
      result.push({ type: 'removed', content: line.slice(1), oldLine: oldLine, newLine: null });
      oldLine++;
    } else {
      result.push({ type: 'context', content: line.slice(1), oldLine: oldLine, newLine: newLine });
      oldLine++;
      newLine++;
    }
  }

  return result;
}

function countStats(lines: DiffLine[]): { added: number; deleted: number } {
  let added = 0;
  let deleted = 0;
  for (const line of lines) {
    if (line.type === 'added') added++;
    if (line.type === 'removed') deleted++;
  }
  return { added, deleted };
}

function DiffLineNumber({ num }: { num: number | null }) {
  return (
    <span
      className={clsx(
        'inline-block w-10 flex-shrink-0 text-right pr-3 text-[11px] leading-5 select-none font-mono',
        num !== null ? 'text-[var(--nexus-text-tertiary)]' : 'text-transparent',
      )}
    >
      {num ?? ' '}
    </span>
  );
}

function DiffContentLine({
  line,
  side,
}: {
  line: DiffLine;
  side: 'old' | 'new';
}) {
  const isOldSide = side === 'old';

  if (line.type === 'hunk') {
    return null;
  }

  const showLine = isOldSide
    ? line.type === 'removed' || line.type === 'context'
    : line.type === 'added' || line.type === 'context';

  if (!showLine) {
    return (
      <div className="flex leading-5 min-h-[20px]">
        <DiffLineNumber num={null} />
        <span className="flex-1 text-[12px] leading-5" />
      </div>
    );
  }

  const bgColor =
    line.type === 'added'
      ? 'bg-green-500/10'
      : line.type === 'removed'
        ? 'bg-red-500/10'
        : '';

  const textColor =
    line.type === 'added'
      ? 'text-green-400'
      : line.type === 'removed'
        ? 'text-red-400'
        : 'text-[var(--nexus-text-secondary)]';

  return (
    <div className={clsx('flex leading-5 px-0', bgColor)}>
      <DiffLineNumber num={isOldSide ? line.oldLine : line.newLine} />
      <span className={clsx('flex-1 text-[12px] leading-5 whitespace-pre font-mono', textColor)}>
        {line.content || ' '}
      </span>
    </div>
  );
}

export interface DiffViewerProps {
  diff: string;
  fileName: string;
  onClose: () => void;
}

export function DiffViewer({ diff, fileName, onClose }: DiffViewerProps) {
  const [fullScreen, setFullScreen] = useState(false);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef<'left' | 'right' | null>(null);

  const lines = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const stats = useMemo(() => countStats(lines), [lines]);

  const handleScroll = useCallback((source: 'left' | 'right') => {
    if (syncingRef.current !== null) return;
    syncingRef.current = source;

    const sourceEl = source === 'left' ? leftRef.current : rightRef.current;
    const targetEl = source === 'left' ? rightRef.current : leftRef.current;
    if (!sourceEl || !targetEl) {
      syncingRef.current = null;
      return;
    }

    const pct = sourceEl.scrollTop / (sourceEl.scrollHeight - sourceEl.clientHeight);
    targetEl.scrollTop = pct * (targetEl.scrollHeight - targetEl.clientHeight);

    requestAnimationFrame(() => {
      syncingRef.current = null;
    });
  }, []);

  useEffect(() => {
    return () => {
      syncingRef.current = null;
    };
  }, []);

  if (!diff) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-[var(--nexus-text-tertiary)]">
        No diff selected
      </div>
    );
  }

  return (
    <div className={clsx('flex flex-col h-full bg-[var(--nexus-bg-primary)]', fullScreen && 'fixed inset-0 z-50')}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 h-10 flex-shrink-0 border-b"
        style={{ borderColor: 'var(--nexus-border-primary)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-medium text-white truncate">{fileName}</span>
          <span className="text-[11px] text-green-400 font-medium">+{stats.added}</span>
          <span className="text-[11px] text-red-400 font-medium">-{stats.deleted}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFullScreen((f) => !f)}
            className="p-1.5 rounded-md hover:bg-surface-hover text-[var(--nexus-text-tertiary)] hover:text-white transition-colors"
            title={fullScreen ? 'Exit full screen' : 'Full screen'}
          >
            {fullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-surface-hover text-[var(--nexus-text-tertiary)] hover:text-white transition-colors"
            title="Close diff"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Diff panels */}
      <div className="flex flex-1 overflow-hidden">
        {/* Hunk indicators as separator bars */}
        <div className="hidden">
          {lines.filter((l) => l.type === 'hunk').map((l, i) => (
            <div
              key={i}
              className="flex items-center px-4 py-1 text-[11px] font-mono text-[var(--nexus-text-tertiary)] bg-[var(--nexus-bg-tertiary)] border-b border-surface-border"
            >
              {l.content}
            </div>
          ))}
        </div>

        {/* Left panel: original */}
        <div
          ref={leftRef}
          onScroll={() => handleScroll('left')}
          className="flex-1 overflow-y-auto border-r"
          style={{ borderColor: 'var(--nexus-border-primary)' }}
        >
          <div
            className="sticky top-0 z-10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--nexus-text-tertiary)] border-b"
            style={{
              background: 'var(--nexus-bg-secondary)',
              borderColor: 'var(--nexus-border-primary)',
            }}
          >
            Original
          </div>
          <div className="py-1">
            {lines.map((line, i) => (
              <DiffContentLine key={i} line={line} side="old" />
            ))}
          </div>
        </div>

        {/* Right panel: modified */}
        <div
          ref={rightRef}
          onScroll={() => handleScroll('right')}
          className="flex-1 overflow-y-auto"
        >
          <div
            className="sticky top-0 z-10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--nexus-text-tertiary)] border-b"
            style={{
              background: 'var(--nexus-bg-secondary)',
              borderColor: 'var(--nexus-border-primary)',
            }}
          >
            Modified
          </div>
          <div className="py-1">
            {lines.map((line, i) => (
              <DiffContentLine key={i} line={line} side="new" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
