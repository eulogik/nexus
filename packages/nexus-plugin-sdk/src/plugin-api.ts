import { type PluginManifest, type PluginAPI, type PluginRegistration, type ToolDefinition, type PluginContext, type SandboxPermissions, ALL_SANDBOX_PERMISSIONS } from "./types.js";
import { PluginSandbox } from "./sandbox.js";
import { PluginStorageProvider } from "./storage.js";
import { EventEmitter } from "./events.js";

export class PluginLoader {
  private registry = new Map<string, PluginRegistration>();
  private plugins = new Map<string, PluginAPI>();
  private tools = new Map<string, ToolDefinition>();
  private sandbox: PluginSandbox;

  constructor(sandbox?: PluginSandbox) {
    this.sandbox = sandbox ?? new PluginSandbox();
  }

  async load(
    manifest: PluginManifest,
    sandboxPermissions?: Partial<SandboxPermissions>,
  ): Promise<PluginRegistration> {
    if (this.registry.has(manifest.name)) {
      throw new Error(`Plugin "${manifest.name}" is already loaded`);
    }

    const permissions: SandboxPermissions = {
      ...ALL_SANDBOX_PERMISSIONS,
      ...sandboxPermissions,
    };

    const storage = new PluginStorageProvider({ namespace: manifest.name });
    const events = new EventEmitter();

    const logger = {
      info: (...args: unknown[]) => console.log(`[plugin:${manifest.name}]`, ...args),
      warn: (...args: unknown[]) => console.warn(`[plugin:${manifest.name}]`, ...args),
      error: (...args: unknown[]) => console.error(`[plugin:${manifest.name}]`, ...args),
    };

    const toolRegistry = new Map<string, ToolDefinition>();
    const pluginToolAPI = this.createToolAPI(manifest, permissions);

    const context: PluginContext = {
      ui: {
        showNotification: async (message: string, _type?: "info" | "warning" | "error") => {
          events.emit("ui:notification", message);
        },
        showInput: async (_prompt: string, _defaultValue?: string) => {
          events.emit("ui:input");
          return null;
        },
        showConfirm: async (_message: string) => {
          events.emit("ui:confirm");
          return false;
        },
      },
      tools: pluginToolAPI,
      storage,
      logger,
      events,
    };

    const api = await this.importPluginModule(manifest);

    if (manifest.tools) {
      for (const toolDef of manifest.tools) {
        const definition: ToolDefinition = {
          name: toolDef.name,
          description: toolDef.description,
          parameters: toolDef.parameters as ToolDefinition["parameters"],
          handler: async (args: Record<string, unknown>) => {
            return this.executeInSandbox(manifest, toolDef.name, args, permissions);
          },
        };
        toolRegistry.set(toolDef.name, definition);
        this.tools.set(`${manifest.name}:${toolDef.name}`, definition);
      }
    }

    const hooks = manifest.hooks ?? [];

    const registration: PluginRegistration = {
      manifest,
      api,
      tools: toolRegistry,
      hooks,
    };

    this.registry.set(manifest.name, registration);
    this.plugins.set(manifest.name, api);

    await api.initialize(context);

    if (api.activate) {
      await api.activate();
    }

    return registration;
  }

  private async importPluginModule(manifest: PluginManifest): Promise<PluginAPI> {
    const path = await import("node:path");
    const mainPath = path.resolve(process.cwd(), manifest.main);

    let moduleExports: Record<string, unknown>;
    try {
      moduleExports = await import(mainPath);
    } catch {
      const fallbackPath = mainPath.replace(/\.\w+$/, "");
      try {
        moduleExports = await import(fallbackPath);
      } catch {
        throw new Error(`Failed to load plugin module: ${mainPath}`);
      }
    }

    if (!moduleExports.default) {
      throw new Error(`Plugin module must have a default export implementing PluginAPI`);
    }

    return moduleExports.default as PluginAPI;
  }

  private createToolAPI(_manifest: PluginManifest, permissions: SandboxPermissions): import("./types.js").ToolAPI {
    return {
      read: async (filePath: string) => {
        if (!permissions.fs.read) throw new Error("Permission denied: fs:read");
        const fs = await import("node:fs");
        return fs.readFileSync(filePath, "utf-8");
      },
      write: async (filePath: string, content: string) => {
        if (!permissions.fs.write) throw new Error("Permission denied: fs:write");
        const fs = await import("node:fs");
        fs.writeFileSync(filePath, content, "utf-8");
      },
      edit: async (filePath: string, oldStr: string, newStr: string) => {
        if (!permissions.fs.write) throw new Error("Permission denied: fs:write");
        const fs = await import("node:fs");
        const content = fs.readFileSync(filePath, "utf-8");
        if (!content.includes(oldStr)) {
          throw new Error(`Could not find old string in ${filePath}`);
        }
        const updated = content.replace(oldStr, newStr);
        fs.writeFileSync(filePath, updated, "utf-8");
      },
      bash: async (command: string, opts?: { cwd?: string; timeout?: number }) => {
        if (!permissions.process.spawn) throw new Error("Permission denied: process:spawn");
        const { execSync } = await import("node:child_process");
        try {
          const stdout = execSync(command, {
            encoding: "utf-8",
            cwd: opts?.cwd,
            timeout: opts?.timeout ?? 30000,
          });
          return { stdout: stdout as string, stderr: "", exitCode: 0 };
        } catch (err: unknown) {
          const execErr = err as { stdout?: string; stderr?: string; status?: number };
          return {
            stdout: execErr.stdout ?? "",
            stderr: execErr.stderr ?? "",
            exitCode: execErr.status ?? 1,
          };
        }
      },
      glob: async (pattern: string) => {
        const fs = await import("node:fs");
        const path = await import("node:path");
        return globFiles(process.cwd(), pattern, fs, path);
      },
      grep: async (regex: string, pattern?: string) => {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const files = await globFiles(
          process.cwd(),
          pattern ?? "**/*.{ts,js,json,md}",
          fs,
          path,
        );
        const results: { file: string; line: number; content: string }[] = [];
        const re = new RegExp(regex);
        for (const file of files) {
          const content = fs.readFileSync(file, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (re.test(lines[i]!)) {
              results.push({ file, line: i + 1, content: lines[i]!.trim() });
            }
          }
        }
        return results;
      },
    };
  }

  private async executeInSandbox(
    manifest: PluginManifest,
    toolName: string,
    args: Record<string, unknown>,
    permissions: SandboxPermissions,
  ): Promise<unknown> {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const mainPath = path.resolve(process.cwd(), manifest.main);
    const pluginCode = fs.readFileSync(mainPath, "utf-8");

    const invokeCode = `
      const plugin = (${pluginCode});
      if (typeof plugin.default === 'function') {
        const instance = plugin.default();
        if (instance.executeTool) {
          return instance.executeTool("${toolName}", ${JSON.stringify(args)});
        }
      }
      throw new Error("Plugin does not expose executeTool method");
    `;

    return this.sandbox.execute(
      invokeCode,
      {
        ui: {
          showNotification: async () => {},
          showInput: async () => null,
          showConfirm: async () => false,
        },
        tools: this.createToolAPI(manifest, permissions),
        storage: new PluginStorageProvider({ namespace: manifest.name }),
        logger: {
          info: (...args: unknown[]) => console.log(`[sandbox:${manifest.name}]`, ...args),
          warn: (...args: unknown[]) => console.warn(`[sandbox:${manifest.name}]`, ...args),
          error: (...args: unknown[]) => console.error(`[sandbox:${manifest.name}]`, ...args),
        },
        events: new EventEmitter(),
      },
      permissions,
    );
  }

  getPlugin(name: string): PluginAPI | undefined {
    return this.plugins.get(name);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getRegistration(name: string): PluginRegistration | undefined {
    return this.registry.get(name);
  }

  listPlugins(): string[] {
    return Array.from(this.registry.keys());
  }

  listTools(): string[] {
    return Array.from(this.tools.keys());
  }

  async unload(name: string): Promise<void> {
    const registration = this.registry.get(name);
    if (!registration) {
      throw new Error(`Plugin "${name}" is not loaded`);
    }

    if (registration.api.deactivate) {
      await registration.api.deactivate();
    }

    for (const [toolName] of registration.tools) {
      this.tools.delete(`${name}:${toolName}`);
    }

    this.registry.delete(name);
    this.plugins.delete(name);
  }
}

async function globFiles(
  rootDir: string,
  pattern: string,
  fs: typeof import("node:fs"),
  path: typeof import("node:path"),
): Promise<string[]> {
  const results: string[] = [];
  const ignoreDirs = new Set(["node_modules", "dist", ".git"]);

  // Simple conversion: **/*.ext -> matches any depth with .ext extension
  // * matches anything without slash
  // ** matches any depth
  function walk(dir: string, relativeDepth: number): void {
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (ignoreDirs.has(entry)) continue;
      const fullPath = path.join(dir, entry);
      const relativePath = path.relative(rootDir, fullPath);
      let stat: import("node:fs").Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(fullPath, relativeDepth + 1);
      } else if (matchGlob(relativePath, pattern)) {
        results.push(fullPath);
      }
    }
  }

  walk(rootDir, 0);
  return results;
}

function matchGlob(filePath: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "___DOUBLESTAR___")
    .replace(/\*/g, "[^/]*")
    .replace(/___DOUBLESTAR___/g, ".*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${regexStr}$`).test(filePath);
}
