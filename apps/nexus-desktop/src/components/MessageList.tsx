import { useRef, useEffect, useState, useCallback } from 'react';
import { User, Bot, Terminal, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type { Message, UserMessage, AssistantMessage, ToolMessage, SystemMessage } from 'nexus-sdk';
import { Markdown } from './Markdown';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatCost(cost: number): string {
  if (cost <= 0) return '';
  if (cost >= 0.01) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(4)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return String(tokens);
}

function isUserMessage(msg: Message): msg is UserMessage {
  return msg.role === 'user';
}

function isAssistantMessage(msg: Message): msg is AssistantMessage {
  return msg.role === 'assistant';
}

function isToolMessage(msg: Message): msg is ToolMessage {
  return msg.role === 'tool';
}

function isSystemMessage(msg: Message): msg is SystemMessage {
  return msg.role === 'system';
}

function UserBubble({ msg }: { msg: UserMessage }) {
  return (
    <div className="flex justify-end animate-fade-in group">
      <div className="flex items-end gap-2 max-w-[80%]">
        <div
          className="px-4 py-2.5 rounded-2xl rounded-tr-sm shadow-sm"
          style={{
            background: 'rgba(92, 124, 250, 0.15)',
            border: '1px solid rgba(92, 124, 250, 0.2)',
          }}
        >
          <p className="text-sm leading-relaxed text-white whitespace-pre-wrap break-words">
            {msg.content}
          </p>
        </div>
        <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-nexus-500/20">
          <User size={14} className="text-nexus-400" />
        </div>
      </div>
    </div>
  );
}

function AssistantBubble({ msg }: { msg: AssistantMessage }) {
  return (
    <div className="flex animate-fade-in group">
      <div className="flex items-start gap-2 max-w-[80%]">
        <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-nexus-500/20 mt-1">
          <Bot size={14} className="text-nexus-400" />
        </div>
        <div>
          <div
            className="px-4 py-2.5 rounded-2xl rounded-tl-sm"
            style={{
              background: 'var(--nexus-bg-elevated)',
              border: '1px solid var(--nexus-border-primary)',
            }}
          >
            <div className="text-sm leading-relaxed text-[var(--nexus-text-primary)]">
              <Markdown content={msg.content} />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[11px] text-[var(--nexus-text-tertiary)]">
              {formatTime(msg.timestamp)}
            </span>
            {(msg.tokens.input > 0 || msg.tokens.output > 0) && (
              <span className="text-[11px] text-[var(--nexus-text-tertiary)]">
                · {formatTokens(msg.tokens.input)} in / {formatTokens(msg.tokens.output)} out
              </span>
            )}
            {msg.cost > 0 && (
              <span className="text-[11px] text-amber-400/70">
                · {formatCost(msg.cost)}
              </span>
            )}
            {msg.model && (
              <span className="text-[11px] text-[var(--nexus-text-tertiary)]">
                · {msg.model}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolBubble({ msg }: { msg: ToolMessage }) {
  const [expanded, setExpanded] = useState(false);

  const statusColor = msg.result.success
    ? 'var(--nexus-accent-green)'
    : 'var(--nexus-accent-red)';

  const statusLabel = msg.result.success ? 'Success' : 'Failed';

  return (
    <div className="flex justify-center animate-fade-in px-8">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full max-w-[600px]"
      >
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-surface-hover"
          style={{
            background: 'rgba(48, 54, 61, 0.3)',
            border: '1px solid var(--nexus-border-secondary)',
          }}
        >
          <Terminal size={12} className="text-[var(--nexus-text-tertiary)]" />
          <span className="font-mono text-[var(--nexus-text-secondary)]">
            {msg.toolName}
          </span>
          <span
            className="ml-auto text-[11px] font-medium"
            style={{ color: statusColor }}
          >
            {statusLabel}
          </span>
          <span className="text-[var(--nexus-text-tertiary)]">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        </div>
        {expanded && (
          <div
            className="mt-1 p-3 rounded-lg text-xs font-mono leading-relaxed whitespace-pre-wrap break-words max-h-48 overflow-y-auto"
            style={{
              background: 'rgba(13, 17, 23, 0.8)',
              border: '1px solid var(--nexus-border-secondary)',
              color: 'var(--nexus-text-secondary)',
            }}
          >
            {msg.result.output || msg.result.error || '(no output)'}
          </div>
        )}
      </button>
    </div>
  );
}

function SystemBubble({ msg }: { msg: SystemMessage }) {
  const typeStyles: Record<string, { dot: string; label: string }> = {
    error: { dot: 'var(--nexus-accent-red)', label: 'Error' },
    warning: { dot: 'var(--nexus-accent-orange)', label: 'Warning' },
    info: { dot: 'var(--nexus-accent-blue)', label: 'Info' },
    prompt: { dot: 'var(--nexus-accent-purple)', label: 'Prompt' },
    config: { dot: 'var(--nexus-text-tertiary)', label: 'Config' },
  };

  const style = typeStyles[msg.type] ?? typeStyles.info;

  return (
    <div className="flex justify-center animate-fade-in px-8">
      <div className="flex items-center gap-1.5 text-[11px] italic text-[var(--nexus-text-tertiary)] max-w-[600px] text-center">
        <span
          className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0"
          style={{ backgroundColor: style.dot }}
        />
        <span className="font-medium not-italic mr-1" style={{ color: style.dot }}>
          {style.label}
        </span>
        {msg.content}
      </div>
    </div>
  );
}

function LoadingDots() {
  return (
    <div className="flex items-start gap-2 animate-fade-in">
      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-nexus-500/20 mt-1">
        <Bot size={14} className="text-nexus-400" />
      </div>
      <div
        className="px-4 py-3 rounded-2xl rounded-tl-sm"
        style={{
          background: 'var(--nexus-bg-elevated)',
          border: '1px solid var(--nexus-border-primary)',
        }}
      >
        <div className="flex gap-1.5">
          <span
            className="w-2 h-2 rounded-full animate-bounce"
            style={{
              backgroundColor: 'var(--nexus-accent-blue)',
              animationDelay: '0ms',
            }}
          />
          <span
            className="w-2 h-2 rounded-full animate-bounce"
            style={{
              backgroundColor: 'var(--nexus-accent-blue)',
              animationDelay: '150ms',
            }}
          />
          <span
            className="w-2 h-2 rounded-full animate-bounce"
            style={{
              backgroundColor: 'var(--nexus-accent-blue)',
              animationDelay: '300ms',
            }}
          />
        </div>
      </div>
    </div>
  );
}

function StreamingCursor() {
  return (
    <div className="flex items-start gap-2 animate-fade-in">
      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-nexus-500/20 mt-1">
        <Bot size={14} className="text-nexus-400" />
      </div>
      <div
        className="px-4 py-2.5 rounded-2xl rounded-tl-sm"
        style={{
          background: 'var(--nexus-bg-elevated)',
          border: '1px solid var(--nexus-border-primary)',
        }}
      >
        <span
          className="inline-block w-2 h-4 bg-nexus-400 animate-pulse"
          style={{
            animation: 'blink 1s step-end infinite',
          }}
        />
      </div>
    </div>
  );
}

function ErrorBubble({ message }: { message: string }) {
  return (
    <div className="flex justify-center animate-fade-in px-8">
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
        style={{
          background: 'rgba(248, 81, 73, 0.1)',
          border: '1px solid rgba(248, 81, 73, 0.3)',
          color: 'var(--nexus-accent-red)',
        }}
      >
        <Loader2 size={12} className="animate-spin" />
        {message}
      </div>
    </div>
  );
}

export interface MessageListProps {
  messages: Message[];
  status: 'idle' | 'thinking' | 'streaming' | 'error';
  error?: string | null;
}

export function MessageList({ messages, status, error }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (isNearBottom || status === 'streaming') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, status]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
    >
      {messages.length === 0 && status === 'idle' && (
        <div className="flex items-center justify-center h-full text-sm text-[var(--nexus-text-tertiary)]">
          Send a message to start the conversation
        </div>
      )}

      {messages.map((msg) => {
        if (isUserMessage(msg)) return <UserBubble key={msg.id} msg={msg} />;
        if (isAssistantMessage(msg)) return <AssistantBubble key={msg.id} msg={msg} />;
        if (isToolMessage(msg)) return <ToolBubble key={msg.id} msg={msg} />;
        if (isSystemMessage(msg)) return <SystemBubble key={msg.id} msg={msg} />;
        return null;
      })}

      {status === 'thinking' && <LoadingDots />}
      {status === 'streaming' && <StreamingCursor />}
      {status === 'error' && error && <ErrorBubble message={error} />}

      <div ref={bottomRef} />
    </div>
  );
}
