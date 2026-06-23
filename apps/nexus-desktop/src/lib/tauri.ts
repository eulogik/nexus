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
  console.warn(`[tauri] listen('${event}') called outside Tauri environment`);
  return () => {};
}

export async function getAppInfo(): Promise<{ name: string; version: string; tauriVersion: string }> {
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
