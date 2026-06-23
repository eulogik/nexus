import { describe, it, expect, beforeAll } from "vitest";

describe("nexus-plugin-docker", () => {
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
      const pkg = await import("../package.json", { assert: { type: "json" } });
      const nexus = (pkg as Record<string, unknown>).nexus as Record<string, unknown>;
      expect(nexus).toBeDefined();
      expect(nexus.name).toBe("nexus-plugin-docker");
      expect(nexus.version).toBe("1.0.0");
      expect(Array.isArray(nexus.tools)).toBe(true);
      expect(nexus.tools).toHaveLength(6);
      expect(Array.isArray(nexus.permissions)).toBe(true);
      expect(nexus.permissions).toContain("process:spawn");
    });

    it("should declare all expected tools", async () => {
      const pkg = await import("../package.json", { assert: { type: "json" } });
      const nexus = (pkg as Record<string, unknown>).nexus as Record<string, unknown>;
      const tools = nexus.tools as Array<{ name: string }>;
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("docker_ps");
      expect(toolNames).toContain("docker_images");
      expect(toolNames).toContain("docker_run");
      expect(toolNames).toContain("docker_stop");
      expect(toolNames).toContain("docker_logs");
      expect(toolNames).toContain("docker_build");
    });
  });

  describe("tool handling", () => {
    it("should dispatch to correct handler for each tool", async () => {
      const plugin = await import("../src/index.js");
      const toolNames = [
        "docker_ps",
        "docker_images",
        "docker_run",
        "docker_stop",
        "docker_logs",
        "docker_build",
      ];
      for (const name of toolNames) {
        expect(() => plugin.default.executeTool(name, {})).not.toThrow();
      }
    });

    it("should return error for unknown tool", async () => {
      const plugin = await import("../src/index.js");
      const result = await plugin.default.executeTool("nonexistent", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown tool");
    });
  });

  describe("Docker availability", () => {
    it("should return error when Docker is not available for docker_ps", async () => {
      const plugin = await import("../src/index.js");
      const result = await plugin.default.executeTool("docker_ps", {});
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("output");
      if (!result.success) {
        expect(result.error).toBeTruthy();
      }
    });

    it("should return error when Docker is not available for docker_images", async () => {
      const plugin = await import("../src/index.js");
      const result = await plugin.default.executeTool("docker_images", {});
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("output");
    });

    it("should return validation error when required args missing for docker_run", async () => {
      const plugin = await import("../src/index.js");
      const result = await plugin.default.executeTool("docker_run", {});
      expect(result.success).toBe(false);
    });

    it("should return validation error when required args missing for docker_stop", async () => {
      const plugin = await import("../src/index.js");
      const result = await plugin.default.executeTool("docker_stop", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Container");
    });

    it("should return validation error when required args missing for docker_build", async () => {
      const plugin = await import("../src/index.js");
      const result = await plugin.default.executeTool("docker_build", {});
      expect(result.success).toBe(false);
    });
  });
});
