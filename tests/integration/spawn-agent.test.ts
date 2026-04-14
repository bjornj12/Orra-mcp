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

describe("AgentManager.spawnAgent — new worktree", () => {
  it("creates a new worktree when worktreeId is omitted", async () => {
    const result = await manager.spawnAgent({
      task: "do something fresh",
      reason: "needs a clean workspace",
      _spawnCommand: ["node", "-e", "process.exit(0);"],
    });

    // WorktreeManager.create returns path.join(projectRoot, ...) — unresolved path
    const expectedPath = path.join(projectDir, "worktrees", result.agentId);
    expect(result.worktreePath).toBe(expectedPath);
    expect(result.branch).toBe(`orra/${result.agentId}`);

    // The new worktree directory should exist
    const stat = await fs.stat(result.worktreePath);
    expect(stat.isDirectory()).toBe(true);

    // git worktree list should show it
    const wtList = execSync("git worktree list --porcelain", { cwd: projectDir, encoding: "utf-8" });
    expect(wtList).toContain(result.worktreePath);
  });

  it("respects a custom branch name", async () => {
    const result = await manager.spawnAgent({
      task: "custom branch task",
      reason: "user specified branch",
      branch: "feat/my-custom-branch",
      _spawnCommand: ["node", "-e", "process.exit(0);"],
    });

    expect(result.branch).toBe("feat/my-custom-branch");
  });
});

import { ConcurrencyLimitError } from "../../src/core/spawn-defaults.js";

describe("AgentManager.spawnAgent — concurrency limit", () => {
  it("throws ConcurrencyLimitError when at limit", async () => {
    // Write a config with limit = 2
    const orraDir = path.join(projectDir, ".orra");
    await fs.mkdir(orraDir, { recursive: true });
    await fs.writeFile(
      path.join(orraDir, "config.json"),
      JSON.stringify({
        markers: ["spec.md"],
        staleDays: 3,
        worktreeDir: "worktrees",
        driftThreshold: 20,
        defaultModel: null,
        defaultAgent: null,
        providers: [],
        providerCache: { ttl: 5000 },
        headlessSpawnConcurrency: 2,
      }),
    );

    // Spawn two long-running agents
    const a = await manager.spawnAgent({
      task: "long one a",
      reason: "concurrency test",
      _spawnCommand: ["node", "-e", "setTimeout(() => process.exit(0), 5000);"],
    });
    const b = await manager.spawnAgent({
      task: "long one b",
      reason: "concurrency test",
      _spawnCommand: ["node", "-e", "setTimeout(() => process.exit(0), 5000);"],
    });

    // Third spawn should reject
    await expect(
      manager.spawnAgent({
        task: "third one",
        reason: "should hit limit",
        _spawnCommand: ["node", "-e", "process.exit(0);"],
      })
    ).rejects.toBeInstanceOf(ConcurrencyLimitError);

    // Cleanup: kill the long-running children and wait for them to actually exit
    // so afterEach's fs.rm doesn't race against open file handles.
    try { process.kill(a.pid, "SIGTERM"); } catch {}
    try { process.kill(b.pid, "SIGTERM"); } catch {}
    await new Promise((r) => setTimeout(r, 200));
  });

  it("allows spawning again once a slot frees up", async () => {
    const orraDir = path.join(projectDir, ".orra");
    await fs.mkdir(orraDir, { recursive: true });
    await fs.writeFile(
      path.join(orraDir, "config.json"),
      JSON.stringify({
        markers: ["spec.md"],
        staleDays: 3,
        worktreeDir: "worktrees",
        driftThreshold: 20,
        defaultModel: null,
        defaultAgent: null,
        providers: [],
        providerCache: { ttl: 5000 },
        headlessSpawnConcurrency: 1,
      }),
    );

    // Spawn one short-lived agent
    const first = await manager.spawnAgent({
      task: "quick one",
      reason: "free up slot",
      _spawnCommand: ["node", "-e", "process.exit(0);"],
    });

    // Wait for it to complete
    await new Promise((r) => setTimeout(r, 200));

    // Should now be able to spawn another
    const second = await manager.spawnAgent({
      task: "second quick one",
      reason: "slot is free",
      _spawnCommand: ["node", "-e", "process.exit(0);"],
    });

    expect(second.agentId).not.toBe(first.agentId);
  });
});
