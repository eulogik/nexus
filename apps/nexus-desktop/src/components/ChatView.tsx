import type { Message } from '../hooks/use-nexus';
import { MessageList } from './MessageList';
import { InputBar } from './InputBar';

function formatCost(cost: number): string {
  if (cost <= 0) return '';
  if (cost >= 0.01) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(4)}`;
}

export interface ChatViewProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  sessionName: string;
  model: string;
  cost: number;
  status: 'idle' | 'thinking' | 'streaming' | 'error';
  error?: string | null;
  models?: string[];
  onModelChange?: (model: string) => void;
  onAttachFile?: () => void;
}

export function ChatView({
  messages,
  onSendMessage,
  sessionName,
  model,
  cost,
  status,
  error,
  models,
  onModelChange,
  onAttachFile,
}: ChatViewProps) {
  const disabled = status === 'streaming' || status === 'thinking';

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between px-4 h-10 flex-shrink-0 border-b"
        style={{ borderColor: 'var(--nexus-border-primary)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-white truncate">
            {sessionName}
          </span>
          {model && (
            <span
              className="text-[11px] font-medium px-1.5 py-0.5 rounded-md leading-none"
              style={{
                background: 'rgba(92, 124, 250, 0.15)',
                color: 'var(--nexus-accent-blue)',
              }}
            >
              {model}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {cost > 0 && (
            <span
              className="text-[11px] font-medium px-1.5 py-0.5 rounded-md leading-none"
              style={{
                background: 'rgba(210, 153, 34, 0.1)',
                color: 'var(--nexus-accent-orange)',
              }}
            >
              {formatCost(cost)}
            </span>
          )}
        </div>
      </div>

      <MessageList messages={messages} status={status} error={error} />

      <InputBar
        onSend={onSendMessage}
        disabled={disabled}
        model={model}
        onModelChange={onModelChange}
        models={models}
        onAttachFile={onAttachFile}
      />
    </div>
  );
}
