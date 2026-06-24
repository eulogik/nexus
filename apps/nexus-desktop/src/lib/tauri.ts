export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    return tauriInvoke<T>(cmd, args);
  }
  console.warn(`[tauri] invoke('${cmd}') called outside Tauri environment`);
  throw new Error('Not running in Tauri');
}

export async function listen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  if (isTauri()) {
    const { listen: tauriListen } = await import('@tauri-apps/api/event');
    return tauriListen<T>(event, (e) => handler(e.payload));
  }
  return () => {};
}

export async function getAppInfo(): Promise<{ version: string; platform: string; node_version: string }> {
  return invoke('get_app_info');
}

export async function showNotification(title: string, body: string): Promise<void> {
  try {
    await invoke('show_notification', { title, body });
  } catch {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }
}

export async function openUrl(url: string): Promise<void> {
  try {
    await invoke('open_url', { url });
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export async function pickFolder(): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const result = await open({ directory: true, multiple: false });
    return typeof result === 'string' ? result : null;
  }
  return null;
}

// ── Project File types ──
export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  created_at: string;
}

export interface Session {
  id: string;
  name: string;
  created_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: string;
}
