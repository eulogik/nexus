import { type ToolAPI, type PluginStorage, type PluginLogger, type PluginUI, type SandboxPermissions } from "./types.js";

let ivm: { Isolate: new (...args: never[]) => unknown; Context: new (...args: never[]) => unknown; Script: new (...args: never[]) => unknown; Reference: new (...args: never[]) => unknown } | null = null;
try {
  const mod = await import("isolated-vm");
  ivm = (mod.default ?? mod) as unknown as typeof ivm;
} catch {
  console.warn("[nexus-plugin-sdk] isolated-vm not available; sandbox will use fallback evaluation");
}

const FORBIDDEN_BASH_COMMANDS = [
  /^rm\s+-rf\s+\//,
  /^sudo\s+/,
  /^dd\s+/,
  /^mkfs\./,
  /^:\(\)\s*\{/,
  /^>\s*\/dev\/sda/,
  /^chmod\s+777\s+\//,
];

const PRIVATE_IP_RANGES = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}/,
  /^192\.168\.\d{1,3}\.\d{1,3}/,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
];

function isPrivateIP(hostname: string): boolean {
  return PRIVATE_IP_RANGES.some((range) => range.test(hostname));
}

function isPathWithinProject(absolutePath: string): boolean {
  const cwd = process.cwd();
  const normalized = absolutePath.replace(/\\/g, "/");
  const normalizedCwd = cwd.replace(/\\/g, "/");
  return normalized.startsWith(normalizedCwd);
}

function isDangerousCommand(command: string): boolean {
  return FORBIDDEN_BASH_COMMANDS.some((pattern) => pattern.test(command.trim()));
}

interface SandboxNexusContext {
  ui: PluginUI;
  tools: Partial<ToolAPI>;
  storage: PluginStorage;
  logger: PluginLogger;
  events: {
    on(event: string, handler: (...args: unknown[]) => void): void;
    off(event: string, handler: (...args: unknown[]) => void): void;
    emit(event: string, ...args: unknown[]): void;
    once(event: string, handler: (...args: unknown[]) => void): void;
  };
}

export class PluginSandbox {
  private memoryLimitMB: number;
  private defaultTimeout: number;

  constructor(memoryLimitMB = 128, defaultTimeout = 5000) {
    this.memoryLimitMB = memoryLimitMB;
    this.defaultTimeout = defaultTimeout;
  }

  async execute(
    code: string,
    context: SandboxNexusContext,
    permissions: SandboxPermissions,
    timeout?: number,
  ): Promise<unknown> {
    if (!ivm) {
      return this.fallbackExecute(code, context, permissions, timeout ?? this.defaultTimeout);
    }
    return this.isolatedExecute(code, context, permissions, timeout ?? this.defaultTimeout);
  }

  private async isolatedExecute(
    code: string,
    context: SandboxNexusContext,
    permissions: SandboxPermissions,
    timeout: number,
  ): Promise<unknown> {
    const ivmRef = ivm!;
    const Isolate = ivmRef.Isolate as unknown as new (opts?: { memoryLimit?: number }) => {
      createContext(): Promise<unknown>;
      compileScript(code: string): Promise<{ run(ctx: unknown, opts?: { timeout?: number }): Promise<{ copy(): unknown }>; release(): void }>;
      dispose(): void;
    };

    const isolate = new Isolate({ memoryLimit: this.memoryLimitMB });
    const context_ = await isolate.createContext() as {
      global: {
        set(key: string, value: unknown, opts?: { copy?: boolean }): Promise<void>;
      };
      release(): void;
    };

    const jail = context_.global;

    await jail.set("global", jail, { copy: true });

    const sandboxConsole = this.createSandboxConsole(context.logger);
    await jail.set("console", {
      log: (...args: unknown[]) => sandboxConsole.log(...args),
      warn: (...args: unknown[]) => sandboxConsole.warn(...args),
      error: (...args: unknown[]) => sandboxConsole.error(...args),
    });

    if (permissions.fs.read) {
      await jail.set("nexusFsRead", async (path: string) => {
        if (!isPathWithinProject(path)) {
          throw new Error(`Access denied: path "${path}" is outside the project directory`);
        }
        const fs = await import("node:fs");
        return fs.readFileSync(path, "utf-8");
      });
    }

    if (permissions.process.spawn) {
      await jail.set("nexusBash", async (command: string, opts?: { cwd?: string; timeout?: number }) => {
        if (isDangerousCommand(command)) {
          throw new Error(`Access denied: dangerous command not allowed: "${command.slice(0, 50)}..."`);
        }
        const { execSync } = await import("node:child_process");
        try {
          const stdout = execSync(command, {
            encoding: "utf-8",
            cwd: opts?.cwd,
            timeout: opts?.timeout ?? timeout,
          });
          return { stdout, stderr: "", exitCode: 0 };
        } catch (err: unknown) {
          const execErr = err as { stdout?: string; stderr?: string; status?: number };
          return {
            stdout: execErr.stdout ?? "",
            stderr: execErr.stderr ?? "",
            exitCode: execErr.status ?? 1,
          };
        }
      });
    }

    if (permissions.network.fetch) {
      await jail.set("nexusFetch", async (url: string, opts?: Record<string, unknown>) => {
        const parsedUrl = new URL(url);
        if (isPrivateIP(parsedUrl.hostname)) {
          throw new Error(`Access denied: fetch to private IP not allowed: ${parsedUrl.hostname}`);
        }
        const response = await fetch(url, opts as RequestInit);
        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          body: await response.text(),
        };
      });
    }

    const filteredTools = this.filterTools(context.tools, permissions);
    await jail.set("nexus", {
      ui: context.ui,
      tools: filteredTools,
      storage: context.storage,
      logger: context.logger,
      events: context.events,
    });

    const allowedGlobals: string[] = [
      "Buffer", "TextEncoder", "TextDecoder", "URL", "URLSearchParams",
      "console", "Math", "JSON", "Array", "Object", "String", "Number",
      "Boolean", "Map", "Set", "Promise", "RegExp", "Date", "Error",
      "TypeError", "RangeError", "SyntaxError", "ReferenceError",
      "parseInt", "parseFloat", "isNaN", "isFinite",
      "undefined", "null", "true", "false", "NaN", "Infinity",
      "decodeURI", "encodeURI", "decodeURIComponent", "encodeURIComponent",
      "ArrayBuffer", "Uint8Array", "Uint16Array", "Uint32Array",
      "Int8Array", "Int16Array", "Int32Array", "Float32Array", "Float64Array",
      "DataView", "Intl", "Reflect", "Proxy", "Symbol", "WeakMap", "WeakSet", "BigInt",
    ];

    for (const name of allowedGlobals) {
      const globalVal = (globalThis as Record<string, unknown>)[name];
      if (globalVal !== undefined) {
        try {
          await jail.set(name, globalVal as never, { copy: true });
        } catch {
          // skip globals that cannot be transferred
        }
      }
    }

    const script = await isolate.compileScript(`"use strict";\n(async () => {\n${code}\n})();`);

    try {
      const result = await script.run(context_, { timeout });
      return result.copy();
    } finally {
      try { script.release(); } catch { /* ignore */ }
      try { context_.release(); } catch { /* ignore */ }
      try { isolate.dispose(); } catch { /* ignore */ }
    }
  }

  private filterTools(tools: Partial<ToolAPI>, permissions: SandboxPermissions): Partial<ToolAPI> {
    const allowed: Partial<ToolAPI> = {};

    if (permissions.fs.read) allowed.read = tools.read;
    if (permissions.fs.write) allowed.write = tools.write;
    if (permissions.fs.delete) {
      allowed.edit = tools.edit;
    }
    if (permissions.process.spawn) allowed.bash = tools.bash;
    allowed.glob = tools.glob;
    allowed.grep = tools.grep;

    return allowed;
  }

  private createSandboxConsole(logger: PluginLogger): { log: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void } {
    return {
      log: (...args: unknown[]) => logger.info(...args),
      warn: (...args: unknown[]) => logger.warn(...args),
      error: (...args: unknown[]) => logger.error(...args),
    };
  }

  private async fallbackExecute(
    code: string,
    context: SandboxNexusContext,
    permissions: SandboxPermissions,
    timeout: number,
  ): Promise<unknown> {
    const filteredTools = this.filterTools(context.tools, permissions);
    const sandboxGlobals: Record<string, unknown> = {
      console: this.createSandboxConsole(context.logger),
      process: undefined,
      require: undefined,
      module: undefined,
      exports: undefined,
      global: undefined,
      globalThis: undefined,
      Buffer,
      TextEncoder,
      TextDecoder,
      URL,
      URLSearchParams,
    };

    const allowedAPIs = {
      nexus: {
        ui: context.ui,
        tools: filteredTools,
        storage: context.storage,
        logger: context.logger,
        events: context.events,
      },
    };

    const wrappedCode = `
      "use strict";
      const __sandbox = ${JSON.stringify(JSON.stringify(allowedAPIs))};
      const nexus = JSON.parse(__sandbox).nexus;
      return (async () => { ${code} })();
    `;

    const asyncFn = new Function(
      ...Object.keys(sandboxGlobals),
      wrappedCode,
    );

    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Sandbox execution timed out")), timeout),
    );

    const execution = asyncFn(...Object.values(sandboxGlobals));

    return Promise.race([execution, timer]);
  }
}
