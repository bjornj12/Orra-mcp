import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { AgentManager } from "../../src/core/agent-manager.js";

/**
 * These tests use a real git repo in a temp directory.
 * They test the AgentManager's error paths and state management.
 * They do NOT spawn real claude processes.
 */

describe("Agent Lifecycle (integration)", () => {
  let tmpDir: string;
  let manager: AgentManager;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-integ-"));
    execSync("git init", { cwd: tmpDir });
    execSync("git commit --allow-empty -m 'init'", { cwd: tmpDir });

    manager = new AgentManager(tmpDir);
    await manager.init();
  });

  afterEach(() => {
    try {
      execSync("git worktree prune", { cwd: tmpDir });
    } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should initialize .orra directory structure", () => {
    expect(fs.existsSync(path.join(tmpDir, ".orra"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".orra", "agents"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".orra", "config.json"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".orra", "links.json"))).toBe(true);
  });

  it("should list no agents initially", async () => {
    const agents = await manager.listAgents();
    expect(agents).toHaveLength(0);
  });

  it("should return null for non-existent agent status", async () => {
    const status = await manager.getAgentStatus("nonexistent");
    expect(status).toBeNull();
  });

  it("should return null for non-existent agent output", async () => {
    const output = await manager.getAgentOutput("nonexistent");
    expect(output).toBeNull();
  });

  it("should throw when stopping non-existent agent", async () => {
    await expect(manager.stopAgent("nonexistent")).rejects.toThrow("not found");
  });

  it("should throw when messaging non-existent agent", async () => {
    await expect(manager.sendMessage("nonexistent", "hello")).rejects.toThrow(
      "not found"
    );
  });

});
