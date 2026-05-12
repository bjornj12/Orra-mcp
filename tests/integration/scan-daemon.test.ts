/**
 * Integration test: scanAll reads live bg-agent state from the daemon
 * (Task 4 of the Agents View pivot plan).
 *
 * Pattern: set up a real git repo + worktree, write fake daemon job state files,
 * override CLAUDE_CONFIG_DIR, call scanAll, restore env.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { scanAll } from "../../src/core/awareness.js";

const SHORT = "aabbccdd";

function makeJobState(opts: {
  state: string;
  worktreePath: string;
  short?: string;
}): object {
  const short = opts.short ?? SHORT;
  return {
    state: opts.state,
    detail: "test detail",
    tempo: opts.state === "running" ? "active" : "idle",
    inFlight: { tasks: 0, queued: 0, kinds: [] },
    output: { result: null },
    children: null,
    linkScanPath: "/tmp/fake-transcript.jsonl",
    intent: "test task",
    name: "test-agent",
    sessionId: `${short}-9d2f-4b11-bb54-ea933ddcb36b`,
    resumeSessionId: `${short}-9d2f-4b11-bb54-ea933ddcb36b`,
    daemonShort: short,
    worktreePath: opts.worktreePath,
    cwd: opts.worktreePath,
    backend: "daemon",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("scanAll — daemon provider integration", () => {
  let repoDir: string;
  let wtPath: string;
  let configDir: string;
  let prevConfigDir: string | undefined;

  beforeEach(() => {
    // Resolve real path to avoid macOS /var → /private/var symlink issues
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "orra-daemon-scan-")));
    repoDir = tmp;
    wtPath = path.join(repoDir, "worktrees", "foo");

    // Init git repo
    execSync("git init", { cwd: repoDir });
    execSync('git config user.email "test@test.com"', { cwd: repoDir });
    execSync('git config user.name "Test"', { cwd: repoDir });
    execSync("git commit --allow-empty -m init", { cwd: repoDir });
    execSync(`git worktree add ${wtPath} -b wt/foo`, { cwd: repoDir });

    // Set up a fake CLAUDE_CONFIG_DIR (no jobs/ yet — each test populates it)
    configDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "orra-fake-claude-"))
    );

    prevConfigDir = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    // Restore env
    if (prevConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = prevConfigDir;
    }
    try { execSync("git worktree prune", { cwd: repoDir }); } catch { /* ignore */ }
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  /** Write a job state for the worktree to the fake CLAUDE_CONFIG_DIR */
  function seedJobState(state: string, short: string = SHORT): void {
    const jobDir = path.join(configDir, "jobs", short);
    fs.mkdirSync(jobDir, { recursive: true });
    fs.writeFileSync(
      path.join(jobDir, "state.json"),
      JSON.stringify(makeJobState({ state, worktreePath: wtPath, short })),
    );
  }

  it("state:running → status in_progress, agent.id and agent.status populated", async () => {
    seedJobState("running");
    const result = await scanAll(repoDir);
    const entry = result.worktrees.find((w) => w.id === "foo");
    expect(entry, "entry for worktree foo should exist").toBeDefined();
    expect(entry!.status).toBe("in_progress");
    expect(entry!.agent).not.toBeNull();
    expect(entry!.agent!.id).toBe(SHORT);
    expect(entry!.agent!.status).toBe("running");
  });

  it("state:blocked → status needs_attention, flags includes 'blocked'", async () => {
    seedJobState("blocked");
    const result = await scanAll(repoDir);
    const entry = result.worktrees.find((w) => w.id === "foo");
    expect(entry, "entry for worktree foo should exist").toBeDefined();
    expect(entry!.status).toBe("needs_attention");
    expect(entry!.flags).toContain("blocked");
  });

  it("state:done → status is NOT in_progress, agent.status is completed", async () => {
    seedJobState("done");
    const result = await scanAll(repoDir);
    const entry = result.worktrees.find((w) => w.id === "foo");
    expect(entry, "entry for worktree foo should exist").toBeDefined();
    expect(entry!.status).not.toBe("in_progress");
    expect(entry!.agent).not.toBeNull();
    expect(entry!.agent!.status).toBe("completed");
  });

  it("no jobs/ dir → scanAll still works, agent is null for the worktree", async () => {
    // Don't seed any job state — configDir has no jobs/ directory at all
    const result = await scanAll(repoDir);
    const entry = result.worktrees.find((w) => w.id === "foo");
    expect(entry, "entry for worktree foo should exist").toBeDefined();
    expect(entry!.agent).toBeNull();
    // Status should be idle (recent commit) or stale — either is fine, just not in_progress
    expect(["idle", "stale"]).toContain(entry!.status);
  });
});
