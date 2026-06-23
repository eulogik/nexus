import { useState, useEffect, useRef } from 'react';
import { X, Save, Eye, EyeOff, Settings, Key, Info, Globe } from 'lucide-react';
import { clsx } from 'clsx';
import { isTauri, getAppInfo, openUrl } from '../lib/tauri';

type Tab = 'general' | 'providers' | 'about';

interface ApiKeyEntry {
  label: string;
  key: string;
  value: string;
  placeholder: string;
}

interface SettingsState {
  defaultModel: string;
  dailyBudget: number;
  theme: 'dark' | 'light';
  compression: boolean;
  gitAutoCommit: boolean;
  apiKeys: {
    openrouter: string;
    anthropic: string;
    openai: string;
    google: string;
  };
}

interface SystemInfo {
  os: string;
  nodeVersion: string;
  rustVersion: string;
}

const models = [
  'anthropic/claude-sonnet-4-20250514',
  'anthropic/claude-3.5-haiku',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'google/gemini-2.5-pro-exp-03-25',
  'deepseek/deepseek-chat',
];

const tabs: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'providers', label: 'Providers', icon: Key },
  { id: 'about', label: 'About', icon: Info },
];

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (settings: SettingsState) => void;
  initialSettings?: Partial<SettingsState>;
}

export function SettingsModal({
  open,
  onClose,
  onSave,
  initialSettings,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [visible, setVisible] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo>({
    os: navigator.platform,
    nodeVersion: '—',
    rustVersion: '—',
  });
  const [settings, setSettings] = useState<SettingsState>({
    defaultModel: 'anthropic/claude-sonnet-4-20250514',
    dailyBudget: 5,
    theme: 'dark',
    compression: true,
    gitAutoCommit: true,
    apiKeys: {
      openrouter: '',
      anthropic: '',
      openai: '',
      google: '',
    },
  });

  const prevOpen = useRef(open);

  useEffect(() => {
    if (open && !prevOpen.current) {
      setActiveTab('general');
      if (initialSettings) {
        setSettings((s) => ({ ...s, ...initialSettings }));
      }
    }
    prevOpen.current = open;
  }, [open, initialSettings]);

  useEffect(() => {
    if (open) {
      setVisible(true);
    } else {
      const timer = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (isTauri()) {
      getAppInfo()
        .then((info) => {
          setSystemInfo((s) => ({
            ...s,
            nodeVersion: process.version || '—',
            rustVersion: info.tauriVersion || '—',
          }));
        })
        .catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!visible) return null;

  const apiKeyFields: ApiKeyEntry[] = [
    { label: 'OpenRouter', key: 'openrouter', value: settings.apiKeys.openrouter, placeholder: 'sk-or-...' },
    { label: 'Anthropic', key: 'anthropic', value: settings.apiKeys.anthropic, placeholder: 'sk-ant-...' },
    { label: 'OpenAI', key: 'openai', value: settings.apiKeys.openai, placeholder: 'sk-proj-...' },
    { label: 'Google', key: 'google', value: settings.apiKeys.google, placeholder: 'AIza...' },
  ];

  const handleTestConnection = async (provider: string) => {
    setTestingKey(provider);
    await new Promise((r) => setTimeout(r, 1500));
    setTestingKey(null);
  };

  const handleSave = () => {
    onSave(settings);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: open ? 'fadeIn 0.15s ease-out' : 'fadeIn 0.15s ease-out reverse',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--nexus-bg-secondary)',
          border: '1px solid var(--nexus-border-primary)',
          borderRadius: 'var(--nexus-radius-xl)',
          boxShadow: 'var(--nexus-shadow-lg)',
          width: 560,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          animation: open ? 'slideUp 0.2s ease-out' : 'none',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--nexus-border-primary)',
          }}
        >
          <h2
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--nexus-text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            Settings
          </h2>
          <button
            onClick={onClose}
            style={{
              padding: 4,
              borderRadius: 'var(--nexus-radius-md)',
              color: 'var(--nexus-text-tertiary)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--nexus-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--nexus-text-tertiary)')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 2,
            padding: '0 20px',
            borderBottom: '1px solid var(--nexus-border-primary)',
            background: 'var(--nexus-bg-tertiary)',
          }}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 14px',
                  fontSize: 13,
                  fontWeight: 500,
                  color: isActive ? 'var(--nexus-text-primary)' : 'var(--nexus-text-secondary)',
                  background: isActive ? 'var(--nexus-bg-secondary)' : 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--nexus-accent-blue)' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'color 0.15s, background 0.15s',
                  marginBottom: -1,
                }}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
          }}
        >
          {activeTab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Default Model */}
              <Field label="Default Model">
                <select
                  value={settings.defaultModel}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, defaultModel: e.target.value }))
                  }
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: 13,
                    color: 'var(--nexus-text-primary)',
                    background: 'var(--nexus-bg-tertiary)',
                    border: '1px solid var(--nexus-border-primary)',
                    borderRadius: 'var(--nexus-radius-md)',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>

              {/* Daily Budget */}
              <Field label="Daily Budget">
                <div style={{ position: 'relative' }}>
                  <span
                    style={{
                      position: 'absolute',
                      left: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--nexus-text-tertiary)',
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    $
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={settings.dailyBudget}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        dailyBudget: Math.max(0, parseFloat(e.target.value) || 0),
                      }))
                    }
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 28px',
                      fontSize: 13,
                      color: 'var(--nexus-text-primary)',
                      background: 'var(--nexus-bg-tertiary)',
                      border: '1px solid var(--nexus-border-primary)',
                      borderRadius: 'var(--nexus-radius-md)',
                      outline: 'none',
                    }}
                  />
                </div>
              </Field>

              {/* Toggles */}
              <ToggleField
                label="Dark Theme"
                description="Toggle between dark and light appearance"
                checked={settings.theme === 'dark'}
                onChange={(checked) =>
                  setSettings((s) => ({ ...s, theme: checked ? 'dark' : 'light' }))
                }
              />
              <ToggleField
                label="Compression"
                description="Compress session history to save tokens"
                checked={settings.compression}
                onChange={(checked) =>
                  setSettings((s) => ({ ...s, compression: checked }))
                }
              />
              <ToggleField
                label="Git Auto-Commit"
                description="Automatically commit changes after edits"
                checked={settings.gitAutoCommit}
                onChange={(checked) =>
                  setSettings((s) => ({ ...s, gitAutoCommit: checked }))
                }
              />
            </div>
          )}

          {activeTab === 'providers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {apiKeyFields.map((field) => {
                const show = showKeys[field.key] ?? false;
                const testing = testingKey === field.key;
                return (
                  <div key={field.key}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 6,
                      }}
                    >
                      <label
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--nexus-text-primary)',
                        }}
                      >
                        {field.label}
                      </label>
                      <button
                        onClick={() => handleTestConnection(field.key)}
                        disabled={testing}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 500,
                          color: 'var(--nexus-accent-blue)',
                          background: 'rgba(92, 124, 250, 0.1)',
                          border: '1px solid rgba(92, 124, 250, 0.2)',
                          borderRadius: 'var(--nexus-radius-md)',
                          cursor: testing ? 'not-allowed' : 'pointer',
                          opacity: testing ? 0.6 : 1,
                          transition: 'opacity 0.15s',
                        }}
                      >
                        {testing ? 'Testing...' : 'Test Connection'}
                      </button>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={show ? 'text' : 'password'}
                        value={field.value}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            apiKeys: { ...s.apiKeys, [field.key]: e.target.value },
                          }))
                        }
                        placeholder={field.placeholder}
                        style={{
                          width: '100%',
                          padding: '8px 36px 8px 12px',
                          fontSize: 13,
                          fontFamily: field.value && !show ? 'var(--nexus-font-mono)' : 'var(--nexus-font-sans)',
                          color: 'var(--nexus-text-primary)',
                          background: 'var(--nexus-bg-tertiary)',
                          border: '1px solid var(--nexus-border-primary)',
                          borderRadius: 'var(--nexus-radius-md)',
                          outline: 'none',
                        }}
                      />
                      <button
                        onClick={() =>
                          setShowKeys((s) => ({ ...s, [field.key]: !s[field.key] }))
                        }
                        style={{
                          position: 'absolute',
                          right: 8,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          padding: 4,
                          color: 'var(--nexus-text-tertiary)',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {show ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'about' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Version */}
              <div
                style={{
                  background: 'var(--nexus-bg-tertiary)',
                  borderRadius: 'var(--nexus-radius-lg)',
                  border: '1px solid var(--nexus-border-secondary)',
                  padding: '16px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--nexus-text-primary)',
                    }}
                  >
                    Nexus Desktop
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--nexus-text-tertiary)',
                      fontFamily: 'var(--nexus-font-mono)',
                    }}
                  >
                    v{initialSettings?.theme ?? '1.1.0'}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--nexus-text-secondary)',
                    lineHeight: 1.5,
                  }}
                >
                  Universal coding agent harness for desktop.
                </p>
              </div>

              {/* Links */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <LinkButton
                  label="Documentation"
                  url="https://opencode.ai"
                />
                <LinkButton
                  label="GitHub Repository"
                  url="https://github.com/anomalyco/opencode"
                />
              </div>

              {/* System Info */}
              <div>
                <h3
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--nexus-text-tertiary)',
                    marginBottom: 8,
                  }}
                >
                  System Information
                </h3>
                <div
                  style={{
                    background: 'var(--nexus-bg-tertiary)',
                    borderRadius: 'var(--nexus-radius-lg)',
                    border: '1px solid var(--nexus-border-secondary)',
                    overflow: 'hidden',
                  }}
                >
                  {[
                    { label: 'Operating System', value: systemInfo.os },
                    { label: 'Node.js', value: systemInfo.nodeVersion },
                    { label: 'Rust (Tauri)', value: systemInfo.rustVersion },
                  ].map((item, i) => (
                    <div
                      key={item.label}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 16px',
                        borderBottom:
                          i < 2 ? '1px solid var(--nexus-border-secondary)' : 'none',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: 'var(--nexus-text-secondary)',
                        }}
                      >
                        {item.label}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: 'var(--nexus-text-primary)',
                          fontFamily: 'var(--nexus-font-mono)',
                        }}
                      >
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '12px 20px',
            borderTop: '1px solid var(--nexus-border-primary)',
          }}
        >
          <button
            onClick={onClose}
            className="btn-ghost"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="btn-primary"
          >
            <Save size={14} />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--nexus-text-primary)',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        background: 'var(--nexus-bg-tertiary)',
        borderRadius: 'var(--nexus-radius-lg)',
        border: '1px solid var(--nexus-border-secondary)',
      }}
    >
      <div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--nexus-text-primary)',
            marginBottom: 2,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--nexus-text-tertiary)',
          }}
        >
          {description}
        </div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative',
          width: 36,
          height: 20,
          borderRadius: 10,
          background: checked
            ? 'var(--nexus-accent-blue)'
            : 'var(--nexus-bg-elevated)',
          border: '1px solid var(--nexus-border-primary)',
          cursor: 'pointer',
          transition: 'background 0.2s',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 18 : 2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}
        />
      </button>
    </div>
  );
}

function LinkButton({ label, url }: { label: string; url: string }) {
  const handleClick = () => openUrl(url);
  return (
    <button
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        fontSize: 13,
        color: 'var(--nexus-accent-blue)',
        background: 'var(--nexus-bg-tertiary)',
        border: '1px solid var(--nexus-border-secondary)',
        borderRadius: 'var(--nexus-radius-lg)',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--nexus-bg-elevated)';
        e.currentTarget.style.borderColor = 'var(--nexus-border-focus)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--nexus-bg-tertiary)';
        e.currentTarget.style.borderColor = 'var(--nexus-border-secondary)';
      }}
    >
      <Globe size={14} />
      {label}
    </button>
  );
}
