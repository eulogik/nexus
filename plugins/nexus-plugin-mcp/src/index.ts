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

interface MCPConnection {
  url: string;
  serverInfo: Record<string, unknown> | null;
  capabilities: Record<string, unknown> | null;
  tools: Array<Record<string, unknown>>;
}

interface JSONRPCResponse {
  jsonrpc: string;
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const connections = new Map<string, MCPConnection>();

let currentConnectionUrl: string | null = null;

let requestId = 1;

async function jsonRpcRequest(
  url: string,
  method: string,
  params?: Record<string, unknown>,
  timeout = 30000,
): Promise<JSONRPCResponse> {
  const id = requestId++;
  const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: response.status, message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = (await response.json()) as JSONRPCResponse;
    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { jsonrpc: "2.0", id, error: { code: 0, message } };
  } finally {
    clearTimeout(timer);
  }
}

async function sendNotification(
  url: string,
  method: string,
  params?: Record<string, unknown>,
  timeout = 30000,
): Promise<void> {
  const body = JSON.stringify({ jsonrpc: "2.0", method, params });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });
  } catch {
  } finally {
    clearTimeout(timer);
  }
}

const toolHandlers: Record<string, (args: Record<string, unknown>) => Promise<ToolResult>> = {
  mcp_connect: async (args) => {
    const url = args.url as string;
    if (!url) {
      return { success: false, output: "", error: "URL is required" };
    }

    const timeout = (args.timeout as number) ?? 30000;

    const result = await jsonRpcRequest(url, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "nexus-mcp", version: "1.0.0" },
    }, timeout);

    if (result.error) {
      return { success: false, output: "", error: result.error.message };
    }

    const initResult = result.result as Record<string, unknown> | undefined;

    await sendNotification(url, "notifications/initialized", undefined, timeout);

    const toolsResult = await jsonRpcRequest(url, "tools/list", {}, timeout);
    const tools = (toolsResult.result as { tools?: Array<Record<string, unknown>> })?.tools ?? [];

    const connection: MCPConnection = {
      url,
      serverInfo: (initResult?.serverInfo as Record<string, unknown>) ?? null,
      capabilities: (initResult?.capabilities as Record<string, unknown>) ?? null,
      tools,
    };

    connections.set(url, connection);
    currentConnectionUrl = url;

    return {
      success: true,
      output: JSON.stringify({
        serverInfo: connection.serverInfo,
        capabilities: connection.capabilities,
        tools: connection.tools,
      }, null, 2),
    };
  },

  mcp_list_tools: async (_args) => {
    if (!currentConnectionUrl) {
      return { success: false, output: "", error: "Not connected to any MCP server" };
    }

    const conn = connections.get(currentConnectionUrl);
    if (!conn) {
      return { success: false, output: "", error: "Connection not found" };
    }

    return {
      success: true,
      output: JSON.stringify({ tools: conn.tools }, null, 2),
    };
  },

  mcp_call_tool: async (args) => {
    const tool = args.tool as string;
    if (!tool) {
      return { success: false, output: "", error: "Tool name is required" };
    }

    if (!currentConnectionUrl) {
      return { success: false, output: "", error: "Not connected to any MCP server" };
    }

    const toolArgs = (args.args as Record<string, unknown>) ?? {};

    const result = await jsonRpcRequest(currentConnectionUrl, "tools/call", {
      name: tool,
      arguments: toolArgs,
    });

    if (result.error) {
      return { success: false, output: "", error: result.error.message };
    }

    return {
      success: true,
      output: JSON.stringify(result.result, null, 2),
    };
  },

  mcp_disconnect: async (_args) => {
    if (currentConnectionUrl) {
      connections.delete(currentConnectionUrl);
      currentConnectionUrl = null;
    }

    return { success: true, output: "Disconnected from MCP server" };
  },
};

let pluginContext: PluginContext | null = null;

const plugin: PluginAPI = {
  async initialize(context: PluginContext): Promise<void> {
    pluginContext = context;
    context.logger.info("MCP plugin initialized");
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
