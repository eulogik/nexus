import { describe, it, expect, beforeEach } from "vitest";

describe("nexus-plugin-github", () => {
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
      expect(nexus.name).toBe("nexus-plugin-github");
      expect(nexus.version).toBe("1.0.0");
      expect(Array.isArray(nexus.tools)).toBe(true);
      expect(nexus.tools).toHaveLength(6);
      expect(Array.isArray(nexus.permissions)).toBe(true);
      expect(nexus.permissions).toContain("network:fetch");
    });

    it("should declare all expected tools", async () => {
      const pkg = await import("../package.json", { assert: { type: "json" } });
      const nexus = (pkg as Record<string, unknown>).nexus as Record<string, unknown>;
      const tools = nexus.tools as Array<{ name: string }>;
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("github_list_prs");
      expect(toolNames).toContain("github_get_pr");
      expect(toolNames).toContain("github_create_pr");
      expect(toolNames).toContain("github_list_issues");
      expect(toolNames).toContain("github_create_issue");
      expect(toolNames).toContain("github_review_pr");
    });
  });

  describe("auth errors", () => {
    beforeEach(() => {
      const savedToken = process.env.GITHUB_TOKEN;
      const savedGhToken = process.env.GH_TOKEN;
      delete process.env.GITHUB_TOKEN;
      delete process.env.GH_TOKEN;
      return () => {
        if (savedToken) process.env.GITHUB_TOKEN = savedToken;
        if (savedGhToken) process.env.GH_TOKEN = savedGhToken;
      };
    });

    it("should return auth error when no token is set", async () => {
      const mod = await import("../src/index.js");
      const result = await mod.default.executeTool("github_list_prs", {
        repo: "user/repo",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("GitHub token not set");
    });

    it("should return auth error for all tools when no token", async () => {
      const mod = await import("../src/index.js");
      const tools = [
        ["github_list_prs", { repo: "user/repo" }],
        ["github_get_pr", { repo: "user/repo", pr: 1 }],
        ["github_create_pr", { repo: "user/repo", title: "t", head: "h", base: "b" }],
        ["github_list_issues", { repo: "user/repo" }],
        ["github_create_issue", { repo: "user/repo", title: "t" }],
        ["github_review_pr", { repo: "user/repo", pr: 1, event: "COMMENT" }],
      ];
      for (const [name, args] of tools) {
        const result = await mod.default.executeTool(name, args);
        expect(result.success).toBe(false);
        expect(result.error).toContain("GitHub token not set");
      }
    });
  });

  describe("error handling", () => {
    it("should return error for unknown tool", async () => {
      const mod = await import("../src/index.js");
      const result = await mod.default.executeTool("nonexistent", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown tool");
    });

    it("should include output and error keys in all results", async () => {
      const mod = await import("../src/index.js");
      const result = await mod.default.executeTool("github_list_prs", {
        repo: "user/repo",
      });
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("output");
    });
  });

  describe("API failures with bad token", () => {
    beforeEach(() => {
      process.env.GITHUB_TOKEN = "ghp_invalid_token_for_testing";
      return () => {
        delete process.env.GITHUB_TOKEN;
      };
    });

    it("should return error for API call with bad token", async () => {
      const mod = await import("../src/index.js");
      const result = await mod.default.executeTool("github_list_prs", {
        repo: "nodejs/node",
      });
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    }, 30000);
  });
});
