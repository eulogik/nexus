type EventHandler = (...args: unknown[]) => void;

export class EventEmitter {
  private listeners = new Map<string, Set<EventHandler>>();
  private onceListeners = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler);
    this.onceListeners.get(event)?.delete(handler);
  }

  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((handler) => {
      try {
        handler(...args);
      } catch (err) {
        console.error(`[nexus-plugin-sdk] Error in event handler for "${event}":`, err);
      }
    });

    const onceHandlers = this.onceListeners.get(event);
    if (onceHandlers) {
      onceHandlers.forEach((handler) => {
        try {
          handler(...args);
        } catch (err) {
          console.error(`[nexus-plugin-sdk] Error in once handler for "${event}":`, err);
        }
      });
      this.onceListeners.delete(event);
    }
  }

  once(event: string, handler: EventHandler): void {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, new Set());
    }
    this.onceListeners.get(event)!.add(handler);
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
    }
  }

  listenerCount(event: string): number {
    const normal = this.listeners.get(event)?.size ?? 0;
    const once = this.onceListeners.get(event)?.size ?? 0;
    return normal + once;
  }
}

export const PREDEFINED_EVENTS = [
  "session:start",
  "session:end",
  "message:received",
  "tool:before",
  "tool:after",
  "error",
] as const;

export type PredefinedEvent = (typeof PREDEFINED_EVENTS)[number];
