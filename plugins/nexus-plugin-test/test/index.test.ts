import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("nexus-plugin-test", () => {
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
      expect(nexus.name).toBe("nexus-plugin-test");
      expect(nexus.version).toBe("1.0.0");
      expect(Array.isArray(nexus.tools)).toBe(true);
      expect(nexus.tools).toHaveLength(4);
      expect(Array.isArray(nexus.permissions)).toBe(true);
      expect(nexus.permissions).toContain("process:spawn");
      expect(nexus.permissions).toContain("fs:read");
    });

    it("should declare all expected tools", async () => {
      const pkg = await import("../package.json", { assert: { type: "json" } });
      const nexus = (pkg as Record<string, unknown>).nexus as Record<string, unknown>;
      const tools = nexus.tools as Array<{ name: string }>;
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("test_detect");
      expect(toolNames).toContain("test_run");
      expect(toolNames).toContain("test_run_file");
      expect(toolNames).toContain("test_watch");
    });
  });

  describe("test_detect", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "nexus-test-plugin-test-"));
    });

    afterAll(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should detect vitest from devDependencies", async () => {
      writeFileSync(
        join(tmpDir, "package.json"),
        JSON.stringify({
          devDependencies: { vitest: "^2.0.0" },
          scripts: { test: "vitest run" },
        }),
      );
      const mod = await import("../src/index.js");
      const result = await mod.default.executeTool("test_detect", { path: tmpDir });
      expect(result.success).toBe(true);
      expect(result.output).toContain("vitest");
    });

    it("should fall back to node --test when no framework found", async () => {
      const emptyDir = mkdtempSync(join(tmpdir(), "nexus-test-empty-"));
      writeFileSync(
        join(emptyDir, "package.json"),
        JSON.stringify({
          name: "empty",
          devDependencies: {},
          scripts: { test: "echo no tests" },
        }),
      );
      const mod = await import("../src/index.js");
      const result = await mod.default.executeTool("test_detect", { path: emptyDir });
      expect(result.success).toBe(true);
      expect(result.output).toContain("node:test");
      rmSync(emptyDir, { recursive: true, force: true });
    });

    it("should return error for non-existent path", async () => {
      const mod = await import("../src/index.js");
      const result = await mod.default.executeTool("test_detect", {
        path: "/nonexistent/path/12345",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
    });
  });

  describe("test_run", () => {
    it("should return error for non-existent path", async () => {
      const mod = await import("../src/index.js");
      const result = await mod.default.executeTool("test_run", {
        path: "/nonexistent/path/12345",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("should return error for unknown tool", async () => {
      const mod = await import("../src/index.js");
      const result = await mod.default.executeTool("nonexistent_tool", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown tool");
    });
  });

  describe("test_run_file", () => {
    it("should return error when file is missing", async () => {
      const mod = await import("../src/index.js");
      const result = await mod.default.executeTool("test_run_file", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("File path is required");
    });

    it("should return error for non-existent file", async () => {
      const mod = await import("../src/index.js");
      const result = await mod.default.executeTool("test_run_file", {
        file: "/nonexistent/test.test.ts",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Test file not found");
    });
  });

  describe("test_watch", () => {
    it("should return error when file is missing", async () => {
      const mod = await import("../src/index.js");
      const result = await mod.default.executeTool("test_watch", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("File path is required");
    });

    it("should return error for non-existent file", async () => {
      const mod = await import("../src/index.js");
      const result = await mod.default.executeTool("test_watch", {
        file: "/nonexistent/test.test.ts",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Test file not found");
    });
  });
});
