import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { AgentManager } from "../../src/core/agent-manager.js";

let projectDir: string;
let worktreeDir: string;
let manager: AgentManager;

beforeEach(async () => {
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "orra-spawn-test-"));
  execSync("git init -q", { cwd: projectDir });
  execSync("git config user.email test@example.com", { cwd: projectDir });
  execSync("git config user.name test", { cwd: projectDir });
  execSync("git commit --allow-empty -q -m init", { cwd: projectDir });
  execSync("git branch -M main", { cwd: projectDir });

  // Create an existing worktree we can attach to
  const worktreeBase = path.join(projectDir, "worktrees", "existing-wt");
  await fs.mkdir(path.dirname(worktreeBase), { recursive: true });
  execSync(`git worktree add -q -b feat/existing ${worktreeBase}`, { cwd: projectDir });
  // Resolve symlinks (macOS /var -> /private/var) so path comparisons match git's output
  worktreeDir = await fs.realpath(worktreeBase);

  manager = new AgentManager(projectDir);
  await manager.init();
});

afterEach(async () => {
  await fs.rm(projectDir, { recursive: true, force: true });
});

describe("AgentManager.spawnAgent — existing worktree", () => {
  it("spawns a process and writes initial state", async () => {
    // Use `node -e` instead of `claude` so the test doesn't depend on Claude being installed
    const result = await manager.spawnAgent({
      task: "test task",
      reason: "integration test",
      worktreeId: "existing-wt",
      _spawnCommand: ["node", "-e", "console.log('hello'); setTimeout(() => process.exit(0), 50);"],
    });

    expect(result.agentId).toMatch(/^test-task-[a-z0-9]{4}$/);
    expect(result.worktreePath).toBe(worktreeDir);
    expect(result.branch).toBe("feat/existing");
    expect(result.pid).toBeGreaterThan(0);

    // State file should exist with status: running
    const statePath = path.join(projectDir, ".orra", "agents", `${result.agentId}.json`);
    const state = JSON.parse(await fs.readFile(statePath, "utf-8"));
    expect(state.status).toBe("running");
    expect(state.agentPersona).toBe("headless-spawn");
    expect(state.task).toBe("test task");
    expect(state.pid).toBe(result.pid);
  });

  it("captures stdout to the log file", async () => {
    const result = await manager.spawnAgent({
      task: "log capture test",
      reason: "verifying log capture",
      worktreeId: "existing-wt",
      _spawnCommand: ["node", "-e", "console.log('captured-marker'); setTimeout(() => process.exit(0), 50);"],
    });

    // Wait for the child to exit (50ms timer + small buffer)
    await new Promise((r) => setTimeout(r, 200));

    const logPath = path.join(projectDir, ".orra", "agents", `${result.agentId}.log`);
    const log = await fs.readFile(logPath, "utf-8");
    expect(log).toContain("captured-marker");
  });

  it("updates state to completed on exit code 0", async () => {
    const result = await manager.spawnAgent({
      task: "exit zero test",
      reason: "verifying success status",
      worktreeId: "existing-wt",
      _spawnCommand: ["node", "-e", "process.exit(0);"],
    });

    await new Promise((r) => setTimeout(r, 200));

    const statePath = path.join(projectDir, ".orra", "agents", `${result.agentId}.json`);
    const state = JSON.parse(await fs.readFile(statePath, "utf-8"));
    expect(state.status).toBe("completed");
    expect(state.exitCode).toBe(0);
  });

  it("updates state to failed on non-zero exit", async () => {
    const result = await manager.spawnAgent({
      task: "exit nonzero test",
      reason: "verifying failure status",
      worktreeId: "existing-wt",
      _spawnCommand: ["node", "-e", "process.exit(2);"],
    });

    await new Promise((r) => setTimeout(r, 200));

    const statePath = path.join(projectDir, ".orra", "agents", `${result.agentId}.json`);
    const state = JSON.parse(await fs.readFile(statePath, "utf-8"));
    expect(state.status).toBe("failed");
    expect(state.exitCode).toBe(2);
  });
});
