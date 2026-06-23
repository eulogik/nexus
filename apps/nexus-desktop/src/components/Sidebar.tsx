import { useState, useMemo, type ComponentType } from 'react';
import {
  Plus,
  MessageSquare,
  Settings,
  Book,
  Keyboard,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import type { Session } from 'nexus-sdk';
import { SidebarSessionItem } from './SidebarSessionItem';

export interface SidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onExport?: (id: string) => void;
  onOpenSettings?: () => void;
  onOpenDocs?: () => void;
  onOpenShortcuts?: () => void;
}

type DateGroup = 'Today' | 'Yesterday' | 'Older';

const dateHeaders: Record<DateGroup, string> = {
  Today: 'Today',
  Yesterday: 'Yesterday',
  Older: 'Older',
};

function groupSessionsByDate(
  sessions: Session[],
): { label: DateGroup; sessions: Session[] }[] {
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const yesterdayStart = todayStart - 86_400_000;

  const groups: { label: DateGroup; sessions: Session[] }[] = [
    { label: 'Today', sessions: [] },
    { label: 'Yesterday', sessions: [] },
    { label: 'Older', sessions: [] },
  ];

  for (const session of sessions) {
    const t = session.createdAt;
    if (t >= todayStart) groups[0].sessions.push(session);
    else if (t >= yesterdayStart) groups[1].sessions.push(session);
    else groups[2].sessions.push(session);
  }

  return groups.filter((g) => g.sessions.length > 0);
}

function QuickLink({
  icon: Icon,
  label,
  collapsed,
  onClick,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  collapsed: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 text-sm text-[var(--nexus-text-secondary)] hover:text-white hover:bg-surface-hover rounded-lg transition-colors w-full ${
        collapsed ? 'justify-center p-2' : 'px-3 py-2'
      }`}
      title={label}
    >
      <Icon size={16} className="flex-shrink-0" />
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

function CollapsedSessionDot({
  session,
  isActive,
  onSelect,
}: {
  session: Session;
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  const dotColor =
    session.status === 'active'
      ? 'var(--nexus-accent-green)'
      : session.status === 'paused'
        ? 'var(--nexus-accent-orange)'
        : session.status === 'error'
          ? 'var(--nexus-accent-red)'
          : 'var(--nexus-text-tertiary)';

  return (
    <button
      onClick={() => onSelect(session.id)}
      className={`flex items-center justify-center w-full py-2.5 transition-colors ${
        isActive
          ? 'text-nexus-500 bg-nexus-500/10'
          : 'text-[var(--nexus-text-tertiary)] hover:text-[var(--nexus-text-primary)] hover:bg-surface-hover'
      }`}
      title={session.name}
    >
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: dotColor }}
      />
    </button>
  );
}

export function Sidebar({
  sessions,
  activeSessionId,
  onSelect,
  onCreate,
  onDelete,
  onExport,
  onOpenSettings,
  onOpenDocs,
  onOpenShortcuts,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const grouped = useMemo(() => groupSessionsByDate(sessions), [sessions]);

  return (
    <aside
      className={`flex flex-col h-full bg-surface-card border-r border-surface-border transition-all duration-300 ease-in-out flex-shrink-0 overflow-hidden ${
        collapsed ? 'w-14' : 'w-64'
      }`}
    >
      {/* Top: logo + actions */}
      <div
        className={`flex items-center border-b border-surface-border h-12 flex-shrink-0 ${
          collapsed ? 'justify-center px-2' : 'justify-between px-4'
        }`}
      >
        {collapsed ? (
          <MessageSquare size={18} className="text-nexus-500 flex-shrink-0" />
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare size={18} className="text-nexus-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-white tracking-tight truncate">
              Nexus
            </span>
          </div>
        )}

        <div className="flex items-center gap-0.5">
          <button
            onClick={onCreate}
            className={`flex items-center justify-center text-[var(--nexus-text-secondary)] hover:text-white hover:bg-surface-hover rounded-lg transition-colors ${
              collapsed ? 'p-1.5' : 'gap-1.5 px-2.5 py-1.5 text-xs font-medium'
            }`}
            title="New Session (Cmd+N)"
          >
            <Plus size={collapsed ? 16 : 14} />
            {!collapsed && <span>New</span>}
          </button>

          <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 text-[var(--nexus-text-tertiary)] hover:text-[var(--nexus-text-primary)] hover:bg-surface-hover rounded-lg transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeft size={15} />
            ) : (
              <PanelLeftClose size={15} />
            )}
          </button>
        </div>
      </div>

      {/* Middle: session list */}
      <div className="flex-1 overflow-y-auto py-2 space-y-1">
        {grouped.length === 0 && (
          <div
            className={`text-xs text-center text-[var(--nexus-text-tertiary)] ${
              collapsed ? 'px-1 py-6' : 'px-4 py-8'
            }`}
          >
            {collapsed ? '\u2014' : 'No sessions yet'}
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <div className="px-4 py-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--nexus-text-tertiary)]">
                  {dateHeaders[group.label]}
                </span>
              </div>
            )}

            {group.sessions.map((session) =>
              collapsed ? (
                <CollapsedSessionDot
                  key={session.id}
                  session={session}
                  isActive={activeSessionId === session.id}
                  onSelect={onSelect}
                />
              ) : (
                <SidebarSessionItem
                  key={session.id}
                  session={session}
                  isActive={activeSessionId === session.id}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  onExport={onExport ?? (() => {})}
                />
              ),
            )}
          </div>
        ))}
      </div>

      {/* Bottom: quick links */}
      <div
        className={`border-t border-surface-border py-2 flex-shrink-0 ${
          collapsed ? 'px-2' : 'px-3'
        }`}
      >
        <QuickLink
          icon={Settings}
          label="Settings"
          collapsed={collapsed}
          onClick={onOpenSettings}
        />
        <QuickLink
          icon={Book}
          label="Documentation"
          collapsed={collapsed}
          onClick={onOpenDocs}
        />
        <QuickLink
          icon={Keyboard}
          label="Keyboard Shortcuts"
          collapsed={collapsed}
          onClick={onOpenShortcuts}
        />
      </div>
    </aside>
  );
}
