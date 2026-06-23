import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

interface DetectedFramework {
  name: string;
  runner: string;
}

interface PackageJson {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
}

const FRAMEWORKS = {
  vitest: { runner: "npx vitest run", coverageFlag: "--coverage", watchFlag: "--watch", fileArg: "" },
  jest: { runner: "npx jest", coverageFlag: "--coverage", watchFlag: "--watch", fileArg: "" },
  mocha: { runner: "npx mocha", coverageFlag: "", watchFlag: "--watch", fileArg: "" },
  ava: { runner: "npx ava", coverageFlag: "", watchFlag: "--watch", fileArg: "" },
  tape: { runner: "npx tape", coverageFlag: "", watchFlag: "", fileArg: "" },
} as const;

const DETECTION_ORDER = ["vitest", "jest", "mocha", "ava", "tape"] as const;

function detectFramework(projectPath: string): DetectedFramework {
  const pkgPath = join(projectPath, "package.json");
  if (!existsSync(pkgPath)) {
    return { name: "node:test", runner: "node --test" };
  }

  let pkg: PackageJson;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as PackageJson;
  } catch {
    return { name: "node:test", runner: "node --test" };
  }

  const deps = { ...pkg.devDependencies, ...pkg.dependencies };

  for (const name of DETECTION_ORDER) {
    if (deps[name]) {
      const info = FRAMEWORKS[name]!;
      return { name, runner: info.runner };
    }
  }

  if (pkg.scripts) {
    const testScript = pkg.scripts.test;
    if (testScript) {
      for (const name of DETECTION_ORDER) {
        const info = FRAMEWORKS[name]!;
        if (testScript.startsWith(name)) {
          return { name, runner: info.runner };
        }
      }
    }
  }

  return { name: "node:test", runner: "node --test" };
}

function buildRunCommand(
  framework: DetectedFramework,
  options: { filter?: string; coverage?: boolean; watch?: boolean },
): string {
  let cmd = framework.runner;

  if (framework.name === "vitest") {
    if (options.coverage) cmd += ` ${FRAMEWORKS.vitest.coverageFlag}`;
    if (options.watch) cmd += ` ${FRAMEWORKS.vitest.watchFlag}`;
    if (options.filter) cmd += ` -t "${options.filter.replace(/"/g, '\\"')}"`;
  } else if (framework.name === "jest") {
    if (options.coverage) cmd += ` ${FRAMEWORKS.jest.coverageFlag}`;
    if (options.watch) cmd += ` ${FRAMEWORKS.jest.watchFlag}`;
    if (options.filter) cmd += ` -t "${options.filter.replace(/"/g, '\\"')}"`;
  } else if (framework.name === "mocha") {
    if (options.coverage) cmd = `npx nyc ${cmd}`;
    if (options.watch) cmd += ` ${FRAMEWORKS.mocha.watchFlag}`;
    if (options.filter) cmd += ` --grep "${options.filter.replace(/"/g, '\\"')}"`;
  } else if (framework.name === "ava") {
    if (options.watch) cmd += ` ${FRAMEWORKS.ava.watchFlag}`;
    if (options.filter) cmd += ` --match="${options.filter.replace(/"/g, '\\"')}"`;
  } else if (framework.name === "tape") {
    if (options.filter) cmd += ` | grep "${options.filter.replace(/"/g, '\\"')}"`;
  } else if (framework.name === "node:test") {
    if (options.coverage) cmd += " --experimental-test-coverage";
    if (options.filter) cmd += ` --test-name-pattern="${options.filter.replace(/"/g, '\\"')}"`;
  }

  return cmd;
}

function buildFileCommand(framework: DetectedFramework, file: string, watch: boolean): string {
  const escapedFile = file.includes(" ") ? `"${file}"` : file;

  if (framework.name === "vitest") {
    return `npx vitest run ${escapedFile}${watch ? " --watch" : ""}`;
  }
  if (framework.name === "jest") {
    return `npx jest ${escapedFile}${watch ? " --watch" : ""}`;
  }
  if (framework.name === "mocha") {
    return `npx mocha ${escapedFile}${watch ? " --watch" : ""}`;
  }
  if (framework.name === "ava") {
    return `npx ava ${escapedFile}${watch ? " --watch" : ""}`;
  }
  if (framework.name === "tape") {
    return `npx tape ${escapedFile}`;
  }
  return `node --test ${escapedFile}`;
}

function execCommand(cmd: string, cwd?: string): ToolResult {
  try {
    const stdout = execSync(cmd, {
      encoding: "utf-8",
      cwd,
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

function resolveToolArgs(args: Record<string, unknown>, toolName: string): Record<string, unknown> {
  return args;
}

const toolHandlers: Record<string, (args: Record<string, unknown>) => ToolResult> = {
  test_detect: (args) => {
    const projectPath = args.path as string;
    if (!projectPath || !existsSync(projectPath)) {
      return { success: false, output: "", error: "Project path does not exist" };
    }
    const framework = detectFramework(projectPath);
    return { success: true, output: JSON.stringify(framework, null, 2) };
  },

  test_run: (args) => {
    const projectPath = args.path as string;
    if (!projectPath || !existsSync(projectPath)) {
      return { success: false, output: "", error: "Project path does not exist" };
    }
    const framework = detectFramework(projectPath);
    const cmd = buildRunCommand(framework, {
      filter: args.filter as string | undefined,
      coverage: args.coverage as boolean | undefined,
      watch: args.watch as boolean | undefined,
    });
    const result = execCommand(cmd, projectPath);
    return {
      ...result,
      output: `[${framework.name}] ${cmd}\n${result.output}`,
    };
  },

  test_run_file: (args) => {
    const file = args.file as string;
    if (!file) {
      return { success: false, output: "", error: "File path is required" };
    }
    if (!existsSync(file)) {
      return { success: false, output: "", error: `Test file not found: ${file}` };
    }
    const projectPath = file.includes("/") ? file.substring(0, file.lastIndexOf("/")) : ".";
    const framework = detectFramework(projectPath);
    const cmd = buildFileCommand(framework, file, false);
    const result = execCommand(cmd);
    return {
      ...result,
      output: `[${framework.name}] ${cmd}\n${result.output}`,
    };
  },

  test_watch: (args) => {
    const file = args.file as string;
    if (!file) {
      return { success: false, output: "", error: "File path is required" };
    }
    if (!existsSync(file)) {
      return { success: false, output: "", error: `Test file not found: ${file}` };
    }
    const projectPath = file.includes("/") ? file.substring(0, file.lastIndexOf("/")) : ".";
    const framework = detectFramework(projectPath);
    const cmd = buildFileCommand(framework, file, true);
    const result = execCommand(cmd);
    return {
      ...result,
      output: `[${framework.name}] ${cmd}\n${result.output}`,
    };
  },
};

let pluginContext: PluginContext | null = null;

const plugin: PluginAPI = {
  async initialize(context: PluginContext): Promise<void> {
    pluginContext = context;
    context.logger.info("Test plugin initialized");
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
