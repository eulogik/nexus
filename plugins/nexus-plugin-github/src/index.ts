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

const GITHUB_API_BASE = "https://api.github.com";

function getToken(): string | null {
  return process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? null;
}

async function githubFetch(
  path: string,
  options: RequestInit = {},
): Promise<ToolResult> {
  const token = getToken();
  if (!token) {
    return {
      success: false,
      output: "",
      error: "GitHub token not set. Set GITHUB_TOKEN or GH_TOKEN environment variable.",
    };
  }

  try {
    const res = await fetch(`${GITHUB_API_BASE}${path}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "nexus-plugin-github/1.0.0",
        ...(options.headers as Record<string, string>),
      },
    });

    const body = await res.text();

    if (res.status === 401) {
      return {
        success: false,
        output: body,
        error: "GitHub authentication failed: bad or expired token (401).",
      };
    }
    if (res.status === 403) {
      return {
        success: false,
        output: body,
        error: "GitHub API rate limit exceeded or resource forbidden (403).",
      };
    }
    if (res.status === 404) {
      return {
        success: false,
        output: body,
        error: "GitHub resource not found (404). Check the repository name and path.",
      };
    }
    if (!res.ok) {
      return {
        success: false,
        output: body,
        error: `GitHub API error (${res.status}): ${res.statusText}`,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return { success: true, output: body };
    }

    return {
      success: true,
      output: typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, output: "", error: `Network error: ${msg}` };
  }
}

const api: Record<string, (args: Record<string, unknown>) => Promise<ToolResult>> = {
  github_list_prs: async (args) => {
    const repo = args.repo as string;
    const state = (args.state as string) ?? "open";
    return githubFetch(`/repos/${repo}/pulls?state=${state}`);
  },

  github_get_pr: async (args) => {
    const repo = args.repo as string;
    const pr = args.pr as number;
    return githubFetch(`/repos/${repo}/pulls/${pr}`);
  },

  github_create_pr: async (args) => {
    const repo = args.repo as string;
    const title = args.title as string;
    const body = (args.body as string) ?? "";
    const head = args.head as string;
    const base = args.base as string;
    return githubFetch(`/repos/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({ title, body, head, base }),
    });
  },

  github_list_issues: async (args) => {
    const repo = args.repo as string;
    const state = (args.state as string) ?? "open";
    return githubFetch(`/repos/${repo}/issues?state=${state}`);
  },

  github_create_issue: async (args) => {
    const repo = args.repo as string;
    const title = args.title as string;
    const body = (args.body as string) ?? "";
    return githubFetch(`/repos/${repo}/issues`, {
      method: "POST",
      body: JSON.stringify({ title, body }),
    });
  },

  github_review_pr: async (args) => {
    const repo = args.repo as string;
    const pr = args.pr as number;
    const body = (args.body as string) ?? "";
    const event = args.event as string;
    return githubFetch(`/repos/${repo}/pulls/${pr}/reviews`, {
      method: "POST",
      body: JSON.stringify({ body, event }),
    });
  },
};

let pluginContext: PluginContext | null = null;

const plugin: PluginAPI = {
  async initialize(context: PluginContext): Promise<void> {
    pluginContext = context;
    const token = getToken();
    if (token) {
      context.logger.info("GitHub token found");
    } else {
      context.logger.warn("GitHub token not set — tools will return auth errors");
    }
  },

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const handler = api[toolName];
    if (!handler) {
      return { success: false, output: "", error: `Unknown tool: ${toolName}` };
    }
    return handler(args);
  },
};

export default plugin;
