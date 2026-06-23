import { type PluginStorage } from "./types.js";

export interface StorageOptions {
  namespace: string;
  persistencePath?: string;
}

export class PluginStorageProvider implements PluginStorage {
  private store = new Map<string, unknown>();
  private namespace: string;
  private persistencePath?: string;
  private dirty = false;
  private persistenceTimer?: ReturnType<typeof setInterval>;

  constructor(options: StorageOptions) {
    this.namespace = options.namespace;
    this.persistencePath = options.persistencePath;

    if (this.persistencePath) {
      this.loadFromDisk();
      this.persistenceTimer = setInterval(() => this.flush(), 5000);
    }
  }

  private prefixKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  async get(key: string): Promise<unknown | undefined> {
    return this.store.get(this.prefixKey(key));
  }

  async set(key: string, value: unknown): Promise<void> {
    this.store.set(this.prefixKey(key), value);
    this.dirty = true;
  }

  async delete(key: string): Promise<boolean> {
    const result = this.store.delete(this.prefixKey(key));
    if (result) this.dirty = true;
    return result;
  }

  async clear(): Promise<void> {
    const prefix = `${this.namespace}:`;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
    this.dirty = true;
  }

  async getAll(): Promise<Record<string, unknown>> {
    const prefix = `${this.namespace}:`;
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.store.entries()) {
      if (key.startsWith(prefix)) {
        result[key.slice(prefix.length)] = value;
      }
    }
    return result;
  }

  private async loadFromDisk(): Promise<void> {
    if (!this.persistencePath) return;
    try {
      const fs = await import("node:fs");
      if (fs.existsSync(this.persistencePath)) {
        const data = JSON.parse(fs.readFileSync(this.persistencePath, "utf-8"));
        if (typeof data === "object" && data !== null) {
          for (const [key, value] of Object.entries(data)) {
            this.store.set(key, value);
          }
        }
      }
    } catch {
      console.warn(`[nexus-plugin-sdk] Could not load storage from ${this.persistencePath}`);
    }
  }

  private async flush(): Promise<void> {
    if (!this.dirty || !this.persistencePath) return;
    this.dirty = false;
    try {
      const fs = await import("node:fs");
      const data: Record<string, unknown> = {};
      for (const [key, value] of this.store.entries()) {
        if (key.startsWith(this.namespace)) {
          data[key] = value;
        }
      }
      const dir = this.persistencePath.substring(0, this.persistencePath.lastIndexOf("/"));
      if (dir) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.persistencePath, JSON.stringify(data, null, 2), "utf-8");
    } catch {
      console.warn(`[nexus-plugin-sdk] Could not persist storage to ${this.persistencePath}`);
    }
  }

  dispose(): void {
    if (this.persistenceTimer) {
      clearInterval(this.persistenceTimer);
    }
    this.flush();
  }
}
