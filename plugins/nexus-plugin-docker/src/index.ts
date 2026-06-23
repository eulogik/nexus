import { execSync } from "node:child_process";

interface PluginContext {
  ui: {
    showNotification: (message: string, type?: "info" | "warning" | "error") => Promise<void>;
    showInput: (prompt: string, defaultValue?: string) => Promise<string | null>;
    showConfirm: (message: string) => Promise<boolean>;
  };
  tools: Record<string, unknown>;
  storage: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<boolean>;
    clear: () => Promise<void>;
    getAll: () => Promise<Record<string, unknown>>;
  };
  logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  events: {
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    off: (event: string, handler: (...args: unknown[]) => void) => void;
    emit: (event: string, ...args: unknown[]) => void;
    once: (event: string, handler: (...args: unknown[]) => void) => void;
  };
}

interface PluginAPI {
  initialize(context: PluginContext): Promise<void>;
  activate?(): Promise<void>;
  deactivate?(): Promise<void>;
  executeTool?(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

function checkDockerAvailable(): boolean {
  try {
    execSync("docker info --format '{{.ServerVersion}}'", {
      encoding: "utf-8",
      timeout: 10000,
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

let dockerAvailable: boolean | null = null;

function ensureDockerAvailable(): void {
  if (dockerAvailable === null) {
    dockerAvailable = checkDockerAvailable();
  }
  if (!dockerAvailable) {
    throw new Error(
      "Docker is not available. Please ensure Docker is installed and the daemon is running."
    );
  }
}

function execDocker(args: string[]): ToolResult {
  try {
    ensureDockerAvailable();
    const cmd = `docker ${args.join(" ")}`;
    const stdout = execSync(cmd, {
      encoding: "utf-8",
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { success: true, output: (stdout as string).trimEnd() };
  } catch (err: unknown) {
    const execErr = err as {
      stdout?: string;
      stderr?: string;
      status?: number;
      message?: string;
    };
    return {
      success: false,
      output: (execErr.stdout as string) ?? "",
      error: (execErr.stderr as string) ?? execErr.message ?? "Unknown error",
    };
  }
}

const toolHandlers: Record<string, (args: Record<string, unknown>) => ToolResult> = {
  docker_ps: (args) => {
    const cmdArgs = ["ps"];
    if (args.all) cmdArgs.push("-a");
    return execDocker(cmdArgs);
  },

  docker_images: () => {
    return execDocker(["images"]);
  },

  docker_run: (args) => {
    const image = args.image as string;
    if (!image) {
      return { success: false, output: "", error: "Image name is required" };
    }
    const cmdArgs: string[] = ["run"];
    const name = args.name as string | undefined;
    if (name) cmdArgs.push("--name", name);
    const ports = args.ports as string | undefined;
    if (ports) cmdArgs.push("-p", ports);
    const detach = args.detach as boolean | undefined;
    if (detach) cmdArgs.push("-d");
    cmdArgs.push(image);
    const command = args.command as string | undefined;
    if (command) cmdArgs.push(command);
    return execDocker(cmdArgs);
  },

  docker_stop: (args) => {
    const container = args.container as string;
    if (!container) {
      return { success: false, output: "", error: "Container ID or name is required" };
    }
    return execDocker(["stop", container]);
  },

  docker_logs: (args) => {
    const container = args.container as string;
    if (!container) {
      return { success: false, output: "", error: "Container ID or name is required" };
    }
    const cmdArgs: string[] = ["logs"];
    const tail = args.tail as number | undefined;
    if (tail !== undefined) cmdArgs.push("--tail", String(tail));
    cmdArgs.push(container);
    return execDocker(cmdArgs);
  },

  docker_build: (args) => {
    const path = args.path as string;
    const tag = args.tag as string;
    if (!path || !tag) {
      return {
        success: false,
        output: "",
        error: "Both path and tag are required",
      };
    }
    return execDocker(["build", "-t", tag, path]);
  },
};

const plugin: PluginAPI = {
  async initialize(context: PluginContext): Promise<void> {
    dockerAvailable = checkDockerAvailable();
    if (dockerAvailable) {
      context.logger.info("Docker plugin initialized");
    } else {
      context.logger.warn("Docker plugin initialized but Docker is not available");
    }
  },

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const handler = toolHandlers[toolName];
    if (!handler) {
      return { success: false, output: "", error: `Unknown tool: ${toolName}` };
    }
    return handler(args);
  },
};

export default plugin;
