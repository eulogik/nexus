import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

const iconMap: Record<ToastType, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const styles: Record<ToastType, { border: string; bg: string; icon: string; glow: string }> = {
  success: {
    border: 'var(--nexus-accent-green)',
    bg: 'rgba(63, 185, 80, 0.1)',
    icon: 'var(--nexus-accent-green)',
    glow: 'rgba(63, 185, 80, 0.15)',
  },
  error: {
    border: 'var(--nexus-accent-red)',
    bg: 'rgba(248, 81, 73, 0.1)',
    icon: 'var(--nexus-accent-red)',
    glow: 'rgba(248, 81, 73, 0.15)',
  },
  info: {
    border: 'var(--nexus-accent-blue)',
    bg: 'rgba(92, 124, 250, 0.1)',
    icon: 'var(--nexus-accent-blue)',
    glow: 'rgba(92, 124, 250, 0.15)',
  },
  warning: {
    border: 'var(--nexus-accent-orange)',
    bg: 'rgba(210, 153, 34, 0.1)',
    icon: 'var(--nexus-accent-orange)',
    glow: 'rgba(210, 153, 34, 0.15)',
  },
};

function ToastItem({
  toast,
  onRemove,
  style,
}: {
  toast: Toast;
  onRemove: (id: string) => void;
  style: React.CSSProperties;
}) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onRemove(toast.id), 200);
    }, 4000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [toast.id, onRemove]);

  const handleClose = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setExiting(true);
    setTimeout(() => onRemove(toast.id), 200);
  };

  const cfg = styles[toast.type];
  const Icon = iconMap[toast.type];

  return (
    <div
      style={{
        ...style,
        background: `linear-gradient(135deg, ${cfg.bg}, rgba(22, 27, 34, 0.95))`,
        border: `1px solid ${cfg.border}`,
        boxShadow: `0 4px 20px ${cfg.glow}, var(--nexus-shadow-lg)`,
        borderRadius: 'var(--nexus-radius-lg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        animation: exiting
          ? 'slideOutRight 0.2s ease-in forwards'
          : 'slideInRight 0.25s ease-out',
        pointerEvents: 'auto',
      }}
      className="flex items-start gap-3 px-4 py-3 min-w-[300px] max-w-[420px]"
    >
      <Icon size={18} style={{ color: cfg.icon, flexShrink: 0, marginTop: 1 }} />
      <p
        className="text-sm flex-1 leading-relaxed"
        style={{ color: 'var(--nexus-text-primary)' }}
      >
        {toast.message}
      </p>
      <button
        onClick={handleClose}
        className="p-0.5 rounded transition-colors flex-shrink-0"
        style={{ color: 'var(--nexus-text-tertiary)' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--nexus-text-primary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--nexus-text-tertiary)')}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((toast, index) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onRemove={removeToast}
            style={{
              transition: 'transform 0.2s ease, opacity 0.2s ease',
            }}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
