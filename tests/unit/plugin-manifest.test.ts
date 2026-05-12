import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("plugin manifest — .claude-plugin/plugin.json", () => {
  it("is valid JSON", async () => {
    const raw = await fs.readFile(path.join(repoRoot, ".claude-plugin", "plugin.json"), "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("has name === 'orra'", async () => {
    const manifest = JSON.parse(
      await fs.readFile(path.join(repoRoot, ".claude-plugin", "plugin.json"), "utf-8"),
    );
    expect(manifest.name).toBe("orra");
  });

  it("has a version that matches package.json", async () => {
    const manifest = JSON.parse(
      await fs.readFile(path.join(repoRoot, ".claude-plugin", "plugin.json"), "utf-8"),
    );
    const pkg = JSON.parse(
      await fs.readFile(path.join(repoRoot, "package.json"), "utf-8"),
    );
    expect(manifest.version).toBe(pkg.version);
    expect(typeof manifest.version).toBe("string");
  });

  it("has a description string", async () => {
    const manifest = JSON.parse(
      await fs.readFile(path.join(repoRoot, ".claude-plugin", "plugin.json"), "utf-8"),
    );
    expect(typeof manifest.description).toBe("string");
    expect(manifest.description.length).toBeGreaterThan(10);
  });

  it("has an author field", async () => {
    const manifest = JSON.parse(
      await fs.readFile(path.join(repoRoot, ".claude-plugin", "plugin.json"), "utf-8"),
    );
    expect(manifest.author).toBeDefined();
  });
});

describe("plugin filesystem structure", () => {
  it("has agents/orchestrator.md", async () => {
    const agentPath = path.join(repoRoot, "agents", "orchestrator.md");
    const content = await fs.readFile(agentPath, "utf-8");
    expect(content).toContain("orchestrator");
  });

  it("has commands/orra.md", async () => {
    const cmdPath = path.join(repoRoot, "commands", "orra.md");
    const content = await fs.readFile(cmdPath, "utf-8");
    expect(content).toContain("orra");
  });

  it("has .mcp.json with orra server entry", async () => {
    const mcpPath = path.join(repoRoot, ".mcp.json");
    const mcp = JSON.parse(await fs.readFile(mcpPath, "utf-8"));
    const orraEntry = mcp["orra"] ?? mcp["orra-mcp"];
    expect(orraEntry).toBeDefined();
    expect(orraEntry.command).toBeDefined();
  });
});
