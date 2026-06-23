import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, Paperclip, ChevronDown } from 'lucide-react';

const ESTIMATED_COST_PER_CHAR = 0.0000003;

function estimateCost(text: string): string {
  if (!text.trim()) return '';
  const estimated = text.length * ESTIMATED_COST_PER_CHAR;
  if (estimated >= 0.01) return `~$${estimated.toFixed(2)}`;
  if (estimated >= 0.001) return `~$${estimated.toFixed(3)}`;
  return `~$${estimated.toFixed(4)}`;
}

export interface InputBarProps {
  onSend: (text: string) => void;
  disabled: boolean;
  model: string;
  onModelChange?: (model: string) => void;
  models?: string[];
  onAttachFile?: () => void;
}

export function InputBar({
  onSend,
  disabled,
  model,
  onModelChange,
  models,
  onAttachFile,
}: InputBarProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);

  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 6 * 24)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [text, autoResize]);

  const handleSend = useCallback(() => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const costEstimate = estimateCost(text);

  return (
    <div
      className="flex-shrink-0 border-t px-4 py-3"
      style={{ borderColor: 'var(--nexus-border-primary)' }}
    >
      <div
        className="rounded-xl transition-all duration-200"
        style={{
          background: 'var(--nexus-bg-tertiary)',
          border: '1px solid var(--nexus-border-primary)',
        }}
        onFocus={() => {}}
      >
        <div className="flex items-end gap-2 px-3 pt-2">
          <button
            onClick={onAttachFile}
            disabled={disabled}
            className="p-1.5 rounded-lg text-[var(--nexus-text-tertiary)] hover:text-white hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-1"
            title="Attach file"
          >
            <Paperclip size={16} />
          </button>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Nexus to do anything..."
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-white placeholder-[var(--nexus-text-tertiary)] outline-none py-1.5 max-h-[144px] leading-6"
            style={{ fontFamily: 'var(--nexus-font-sans)' }}
          />

          <button
            onClick={handleSend}
            disabled={!text.trim() || disabled}
            className="p-2 rounded-full bg-nexus-500 hover:bg-nexus-600 disabled:bg-[var(--nexus-bg-elevated)] disabled:text-[var(--nexus-text-tertiary)] text-white transition-all flex-shrink-0 mb-1"
            title="Send message"
          >
            <ArrowUp size={16} />
          </button>
        </div>

        <div className="flex items-center justify-between px-3 pb-2">
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowModelPicker(!showModelPicker)}
                className="flex items-center gap-1 text-[11px] text-[var(--nexus-text-tertiary)] hover:text-white transition-colors px-1.5 py-0.5 rounded hover:bg-surface-hover"
              >
                <span>{model || 'auto'}</span>
                <ChevronDown size={10} />
              </button>
              {showModelPicker && models && models.length > 0 && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowModelPicker(false)}
                  />
                  <div
                    className="absolute bottom-full left-0 mb-1 z-20 py-1 rounded-lg shadow-lg min-w-[160px]"
                    style={{
                      background: 'var(--nexus-bg-elevated)',
                      border: '1px solid var(--nexus-border-primary)',
                    }}
                  >
                    {models.map((m) => (
                      <button
                        key={m}
                        onClick={() => {
                          onModelChange?.(m);
                          setShowModelPicker(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                          m === model
                            ? 'text-white bg-nexus-500/20'
                            : 'text-[var(--nexus-text-secondary)] hover:text-white hover:bg-surface-hover'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {costEstimate && (
              <span className="text-[11px] text-[var(--nexus-text-tertiary)]">
                {costEstimate}
              </span>
            )}
            <span className="text-[11px] text-[var(--nexus-text-tertiary)]">
              <span className="hidden sm:inline">Cmd+Enter </span>
              <span className="sm:hidden">Enter </span>
              to send
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
