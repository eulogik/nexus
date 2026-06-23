import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("nexus-plugin-git", () => {
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
      expect(nexus.name).toBe("nexus-plugin-git");
      expect(nexus.version).toBe("1.0.0");
      expect(Array.isArray(nexus.tools)).toBe(true);
      expect(nexus.tools).toHaveLength(7);
      expect(Array.isArray(nexus.permissions)).toBe(true);
      expect(nexus.permissions).toContain("git:read");
      expect(nexus.permissions).toContain("git:write");
    });

    it("should declare all expected tools", async () => {
      const pkg = await import("../package.json", { assert: { type: "json" } });
      const nexus = (pkg as Record<string, unknown>).nexus as Record<string, unknown>;
      const tools = nexus.tools as Array<{ name: string }>;
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("git_status");
      expect(toolNames).toContain("git_log");
      expect(toolNames).toContain("git_diff");
      expect(toolNames).toContain("git_commit");
      expect(toolNames).toContain("git_branch");
      expect(toolNames).toContain("git_push");
      expect(toolNames).toContain("git_pull");
    });
  });

  describe("tool initialization", () => {
    it("should execute each tool without throwing", async () => {
      const plugin = await import("../src/index.js");
      const toolNames = [
        "git_status",
        "git_log",
        "git_diff",
        "git_commit",
        "git_branch",
        "git_push",
        "git_pull",
      ];
      for (const name of toolNames) {
        expect(typeof plugin.default.executeTool).toBe("function");
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

  describe("git operations in temp repo", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "nexus-git-test-"));
      execSync("git init", { cwd: tmpDir, encoding: "utf-8" });
      execSync('git config user.email "test@test.com"', {
        cwd: tmpDir,
        encoding: "utf-8",
      });
      execSync('git config user.name "Test"', { cwd: tmpDir, encoding: "utf-8" });
      writeFileSync(join(tmpDir, "test.txt"), "hello world\n");
      execSync("git add . && git commit -m 'initial commit'", {
        cwd: tmpDir,
        encoding: "utf-8",
      });
    });

    afterAll(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("git_status should return output", async () => {
      const mod = await import("../src/index.js");
      const result = await mod.default.executeTool("git_status", { cwd: tmpDir });
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("output");
    });

    it("git_log should return commit history", async () => {
      const mod = await import("../src/index.js");
      const result = await mod.default.executeTool("git_log", { maxCount: 5, cwd: tmpDir });
      expect(result.success).toBe(true);
      expect(result.output).toContain("initial commit");
    });

    it("git_branch should list branches", async () => {
      const mod = await import("../src/index.js");
      const result = await mod.default.executeTool("git_branch", { list: true, cwd: tmpDir });
      expect(result.success).toBe(true);
      expect(result.output).toMatch(/master|main/);
    });

    it("git_commit should create a commit", async () => {
      const mod = await import("../src/index.js");
      writeFileSync(join(tmpDir, "new.txt"), "new file\n");
      execSync("git add new.txt", { cwd: tmpDir, encoding: "utf-8" });
      const result = await mod.default.executeTool("git_commit", {
        message: "test commit",
        cwd: tmpDir,
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("test commit");
    });

    it("git_diff should show diff of modified file", async () => {
      const mod = await import("../src/index.js");
      writeFileSync(join(tmpDir, "test.txt"), "hello world\nmodified\n");
      const result = await mod.default.executeTool("git_diff", { path: "test.txt", cwd: tmpDir });
      expect(result.success).toBe(true);
      expect(result.output).toContain("+modified");
    });
  });
});
