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

function execGit(args: string[], cwd?: string): ToolResult {
  try {
    const cmd = `git ${args.join(" ")}`;
    const stdout = execSync(cmd, {
      encoding: "utf-8",
      cwd,
      timeout: 30000,
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
  git_status: (args) => {
    const cwd = args.cwd as string | undefined;
    return execGit(["status"], cwd);
  },

  git_log: (args) => {
    const maxCount = (args.maxCount as number) ?? 10;
    const cwd = args.cwd as string | undefined;
    return execGit(["log", `--max-count=${maxCount}`, "--oneline"], cwd);
  },

  git_diff: (args) => {
    const cmdArgs = ["diff"];
    const filePath = args.path as string | undefined;
    if (filePath) cmdArgs.push("--", filePath);
    const cwd = args.cwd as string | undefined;
    return execGit(cmdArgs, cwd);
  },

  git_commit: (args) => {
    const message = args.message as string;
    if (!message) {
      return { success: false, output: "", error: "Commit message is required" };
    }
    const cwd = args.cwd as string | undefined;
    return execGit(["commit", "-m", `"${message.replace(/"/g, '\\"')}"`], cwd);
  },

  git_branch: (args) => {
    const name = args.name as string | undefined;
    const list = args.list as boolean | undefined;
    const cwd = args.cwd as string | undefined;
    if (name) {
      return execGit(["branch", name], cwd);
    }
    if (list !== false) {
      return execGit(["branch"], cwd);
    }
    return execGit(["branch"], cwd);
  },

  git_push: (args) => {
    const cmdArgs = ["push"];
    const remote = args.remote as string | undefined;
    const branch = args.branch as string | undefined;
    const cwd = args.cwd as string | undefined;
    if (remote) cmdArgs.push(remote);
    if (branch) cmdArgs.push(branch);
    return execGit(cmdArgs, cwd);
  },

  git_pull: (args) => {
    const cmdArgs = ["pull"];
    const remote = args.remote as string | undefined;
    const branch = args.branch as string | undefined;
    const cwd = args.cwd as string | undefined;
    if (remote) cmdArgs.push(remote);
    if (branch) cmdArgs.push(branch);
    return execGit(cmdArgs, cwd);
  },
};

let pluginContext: PluginContext | null = null;

const plugin: PluginAPI = {
  async initialize(context: PluginContext): Promise<void> {
    pluginContext = context;
    context.logger.info("Git plugin initialized");
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
