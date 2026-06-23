import { describe, it, expect } from "vitest";

describe("nexus-plugin-mcp", () => {
  describe("module", () => {
    it("should export a default object with initialize", async () => {
      const plugin = await import("../src/index.js");
      expect(plugin.default).toBeDefined();
      expect(typeof plugin.default.initialize).toBe("function");
    });

    it("should have executeTool method", async () => {
      const plugin = await import("../src/index.js");
      expect(typeof plugin.default.executeTool).toBe("function");
    });
  });

  describe("manifest", () => {
    it("should have valid nexus field in package.json", async () => {
      const pkg = await import("../package.json", { with: { type: "json" } });
      const nexus = (pkg as Record<string, unknown>).nexus as Record<string, unknown>;
      expect(nexus).toBeDefined();
      expect(nexus.name).toBe("nexus-plugin-mcp");
      expect(nexus.version).toBe("1.0.0");
      expect(Array.isArray(nexus.tools)).toBe(true);
      expect(nexus.tools).toHaveLength(4);
      expect(Array.isArray(nexus.permissions)).toBe(true);
      expect(nexus.permissions).toContain("network:fetch");
      expect(nexus.permissions).toContain("fs:read");
    });

    it("should declare all expected tools", async () => {
      const pkg = await import("../package.json", { with: { type: "json" } });
      const nexus = (pkg as Record<string, unknown>).nexus as Record<string, unknown>;
      const tools = nexus.tools as Array<{ name: string }>;
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("mcp_connect");
      expect(toolNames).toContain("mcp_list_tools");
      expect(toolNames).toContain("mcp_call_tool");
      expect(toolNames).toContain("mcp_disconnect");
    });
  });

  describe("tool behavior", () => {
    it("mcp_connect should handle connection failure gracefully", async () => {
      const plugin = await import("../src/index.js");
      const result = await plugin.default.executeTool("mcp_connect", {
        url: "http://127.0.0.1:1/mcp",
        timeout: 1000,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe("string");
    });

    it("mcp_list_tools should return error when not connected", async () => {
      const plugin = await import("../src/index.js");

      const result = await plugin.default.executeTool("mcp_list_tools", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Not connected");
    });

    it("mcp_call_tool should return error when not connected", async () => {
      const plugin = await import("../src/index.js");

      const result = await plugin.default.executeTool("mcp_call_tool", {
        tool: "some_tool",
        args: {},
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Not connected");
    });

    it("mcp_call_tool should return error when tool name is missing", async () => {
      const plugin = await import("../src/index.js");

      const result = await plugin.default.executeTool("mcp_call_tool", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Tool name is required");
    });

    it("mcp_disconnect is idempotent", async () => {
      const plugin = await import("../src/index.js");

      const result1 = await plugin.default.executeTool("mcp_disconnect", {});
      expect(result1.success).toBe(true);

      const result2 = await plugin.default.executeTool("mcp_disconnect", {});
      expect(result2.success).toBe(true);
    });

    it("should return error for unknown tool", async () => {
      const plugin = await import("../src/index.js");
      const result = await plugin.default.executeTool("nonexistent", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown tool");
    });
  });
});
