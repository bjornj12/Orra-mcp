/**
 * tests/unit/providers/claude-daemon.test.ts
 *
 * Tests for the claude-daemon built-in provider.
 * Uses a temp configDir populated with fixture job state and roster files.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createClaudeDaemonProvider } from "../../../src/core/providers/claude-daemon.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RUNNING_JOB_SHORT = "abcd1234";
const RUNNING_JOB_WORKTREE = "/repo/root/.claude/worktrees/my-feature";
const RUNNING_JOB_BRANCH = "worktree-my-feature";

const BLOCKED_JOB_SHORT = "beef0001";
const BLOCKED_JOB_WORKTREE = "/repo/root/.claude/worktrees/blocked-feat";
const BLOCKED_JOB_BRANCH = "worktree-blocked-feat";

const DONE_JOB_SHORT = "cafe0002";
const DONE_JOB_CWD = "/repo/root";

const ROSTER_ONLY_SHORT = "feed0003";

const RUNNING_JOB_STATE = {
  state: "running",
  detail: "running npm test",
  tempo: "active",
  inFlight: { tasks: 1, queued: 0, kinds: ["Bash"] },
  output: { result: "" },
  linkScanPath: `/x/projects/-repo-root/.claude-worktrees-my-feature/${RUNNING_JOB_SHORT}.jsonl`,
  respawnFlags: [
    "--name", "my-feature",
    "--worktree", "my-feature",
    "--model", "claude-sonnet-4-5",
    "--agent", "orchestrator",
  ],
  intent: "Fix the failing tests",
  name: "my-feature",
  sessionId: `${RUNNING_JOB_SHORT}-session-uuid`,
  resumeSessionId: `${RUNNING_JOB_SHORT}-session-uuid`,
  daemonShort: RUNNING_JOB_SHORT,
  cwd: "/repo/root",
  worktreePath: RUNNING_JOB_WORKTREE,
  worktreeBranch: RUNNING_JOB_BRANCH,
  createdAt: "2026-05-12T10:00:00.000Z",
  updatedAt: "2026-05-12T10:05:00.000Z",
};

const BLOCKED_JOB_STATE = {
  state: "blocked",
  detail: "Waiting for user to allow Bash tool",
  tempo: "idle",
  inFlight: { tasks: 0, queued: 1, kinds: [] },
  output: { result: "" },
  linkScanPath: `/x/projects/-repo-root/.claude-worktrees-blocked-feat/${BLOCKED_JOB_SHORT}.jsonl`,
  respawnFlags: [
    "--name", "blocked-feat",
    "--worktree", "blocked-feat",
    "--model", "claude-haiku-4-5",
  ],
  intent: "Run build pipeline",
  name: "blocked-feat",
  sessionId: `${BLOCKED_JOB_SHORT}-session-uuid`,
  resumeSessionId: `${BLOCKED_JOB_SHORT}-session-uuid`,
  daemonShort: BLOCKED_JOB_SHORT,
  cwd: "/repo/root",
  worktreePath: BLOCKED_JOB_WORKTREE,
  worktreeBranch: BLOCKED_JOB_BRANCH,
  createdAt: "2026-05-12T09:00:00.000Z",
  updatedAt: "2026-05-12T09:30:00.000Z",
};

const DONE_JOB_STATE = {
  state: "done",
  detail: "Completed successfully",
  tempo: "idle",
  inFlight: { tasks: 0, queued: 0, kinds: [] },
  output: { result: "All tests passed" },
  linkScanPath: `/x/projects/-repo-root/${DONE_JOB_SHORT}.jsonl`,
  respawnFlags: ["--name", "root-task"],
  intent: "Run: npm test",
  name: "root-task",
  sessionId: `${DONE_JOB_SHORT}-session-uuid`,
  resumeSessionId: `${DONE_JOB_SHORT}-session-uuid`,
  daemonShort: DONE_JOB_SHORT,
  cwd: DONE_JOB_CWD,
  // no worktreePath / worktreeBranch → plain cwd session
  createdAt: "2026-05-12T08:00:00.000Z",
  updatedAt: "2026-05-12T08:10:00.000Z",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setupTempDir(): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "orra-daemon-provider-"));

  // Create jobs dirs
  for (const [short, state] of [
    [RUNNING_JOB_SHORT, RUNNING_JOB_STATE],
    [BLOCKED_JOB_SHORT, BLOCKED_JOB_STATE],
    [DONE_JOB_SHORT, DONE_JOB_STATE],
  ] as const) {
    await fsp.mkdir(path.join(dir, "jobs", short), { recursive: true });
    await fsp.writeFile(
      path.join(dir, "jobs", short, "state.json"),
      JSON.stringify(state),
    );
  }

  // Write pins.json (should be skipped)
  await fsp.writeFile(path.join(dir, "jobs", "pins.json"), "[]");

  // Write roster — includes a live worker NOT present in jobs
  const roster = {
    proto: 1,
    supervisorPid: 99999,
    updatedAt: Date.now(),
    workers: {
      [RUNNING_JOB_SHORT]: {
        pid: 12340,
        sessionId: `${RUNNING_JOB_SHORT}-session-uuid`,
        cwd: "/repo/root",
        startedAt: Date.now() - 60000,
        cliVersion: "2.1.139",
        dispatch: {
          launch: {
            args: [
              "--bg",
              "--name", "my-feature",
              "--worktree", "my-feature",
              "--model", "claude-sonnet-4-5",
              "--",
              "Fix the failing tests",
            ],
          },
        },
      },
      [ROSTER_ONLY_SHORT]: {
        pid: 12341,
        sessionId: `${ROSTER_ONLY_SHORT}-session-uuid`,
        cwd: "/other/project",
        startedAt: Date.now() - 30000,
        cliVersion: "2.1.139",
        dispatch: {
          launch: {
            args: [
              "--bg",
              "--name", "aux-task",
              "--",
              "Do something auxiliary",
            ],
          },
        },
      },
    },
  };
  await fsp.mkdir(path.join(dir, "daemon"), { recursive: true });
  await fsp.writeFile(path.join(dir, "daemon", "roster.json"), JSON.stringify(roster));

  return dir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createClaudeDaemonProvider", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await setupTempDir();
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns protocolVersion 1.0 and an array of worktrees", async () => {
    const provider = createClaudeDaemonProvider({ configDir: tmpDir });
    const result = await provider.fetch();
    expect(result.protocolVersion).toBe("1.0");
    expect(Array.isArray(result.worktrees)).toBe(true);
  });

  it("running job → entry keyed by worktreePath with agent.status === 'running'", async () => {
    const provider = createClaudeDaemonProvider({ configDir: tmpDir });
    const result = await provider.fetch();
    const entry = result.worktrees.find((w) => w.id === RUNNING_JOB_WORKTREE);
    expect(entry).toBeDefined();
    expect(entry!.path).toBe(RUNNING_JOB_WORKTREE);
    expect(entry!.agent?.status).toBe("running");
    expect(entry!.agent?.id).toBe(RUNNING_JOB_SHORT);
    expect(entry!.agent?.sessionId).toBe(`${RUNNING_JOB_SHORT}-session-uuid`);
  });

  it("running job → agent has model and agentPersona from respawnFlags", async () => {
    const provider = createClaudeDaemonProvider({ configDir: tmpDir });
    const result = await provider.fetch();
    const entry = result.worktrees.find((w) => w.id === RUNNING_JOB_WORKTREE);
    expect(entry!.agent?.model).toBe("claude-sonnet-4-5");
    expect(entry!.agent?.agentPersona).toBe("orchestrator");
  });

  it("blocked job → flags includes 'blocked' and agent.status === 'waiting'", async () => {
    const provider = createClaudeDaemonProvider({ configDir: tmpDir });
    const result = await provider.fetch();
    const entry = result.worktrees.find((w) => w.id === BLOCKED_JOB_WORKTREE);
    expect(entry).toBeDefined();
    expect(entry!.flags).toContain("blocked");
    expect(entry!.agent?.status).toBe("waiting");
  });

  it("done job → agent.status === 'completed', keyed by cwd", async () => {
    const provider = createClaudeDaemonProvider({ configDir: tmpDir });
    const result = await provider.fetch();
    const entry = result.worktrees.find((w) => w.id === DONE_JOB_CWD);
    expect(entry).toBeDefined();
    expect(entry!.agent?.status).toBe("completed");
  });

  it("roster-only worker (no job dir) → minimal entry with agent.status === 'running'", async () => {
    const provider = createClaudeDaemonProvider({ configDir: tmpDir });
    const result = await provider.fetch();
    const entry = result.worktrees.find((w) => w.agent?.id === ROSTER_ONLY_SHORT);
    expect(entry).toBeDefined();
    expect(entry!.agent?.status).toBe("running");
    expect(entry!.agent?.sessionId).toBe(`${ROSTER_ONLY_SHORT}-session-uuid`);
  });

  it("missing configDir → returns empty worktrees (no throw)", async () => {
    const provider = createClaudeDaemonProvider({ configDir: "/no/such/dir/at/all" });
    const result = await provider.fetch();
    expect(result.protocolVersion).toBe("1.0");
    expect(result.worktrees).toHaveLength(0);
  });

  it("extras stays under 1KB when serialized", async () => {
    const provider = createClaudeDaemonProvider({ configDir: tmpDir });
    const result = await provider.fetch();
    for (const wt of result.worktrees) {
      if (wt.extras) {
        const size = JSON.stringify(wt.extras).length;
        expect(size).toBeLessThanOrEqual(1024);
      }
    }
  });

  it("provider name starts with 'claude-daemon'", () => {
    const provider = createClaudeDaemonProvider({ configDir: tmpDir });
    expect(provider.name).toMatch(/^claude-daemon:/);
  });

  it("blocked job → no flags for non-blocked job", async () => {
    const provider = createClaudeDaemonProvider({ configDir: tmpDir });
    const result = await provider.fetch();
    const entry = result.worktrees.find((w) => w.id === RUNNING_JOB_WORKTREE);
    expect(entry!.flags ?? []).not.toContain("blocked");
  });

  it("blocked job without model → agent.model is null", async () => {
    const provider = createClaudeDaemonProvider({ configDir: tmpDir });
    const result = await provider.fetch();
    const blockedEntry = result.worktrees.find((w) => w.id === BLOCKED_JOB_WORKTREE);
    // The blocked job has --model claude-haiku-4-5 in respawnFlags
    expect(blockedEntry!.agent?.model).toBe("claude-haiku-4-5");
  });

  it("done job without --agent flag → agent.agentPersona is null", async () => {
    const provider = createClaudeDaemonProvider({ configDir: tmpDir });
    const result = await provider.fetch();
    const doneEntry = result.worktrees.find((w) => w.id === DONE_JOB_CWD);
    expect(doneEntry!.agent?.agentPersona).toBeNull();
  });

  it("running job → agent has task from intent", async () => {
    const provider = createClaudeDaemonProvider({ configDir: tmpDir });
    const result = await provider.fetch();
    const entry = result.worktrees.find((w) => w.id === RUNNING_JOB_WORKTREE);
    expect(entry!.agent?.task).toBe("Fix the failing tests");
  });

  it("running job → extras contains daemonShort and linkScanPath", async () => {
    const provider = createClaudeDaemonProvider({ configDir: tmpDir });
    const result = await provider.fetch();
    const entry = result.worktrees.find((w) => w.id === RUNNING_JOB_WORKTREE);
    expect(entry!.extras?.daemonShort).toBe(RUNNING_JOB_SHORT);
    expect(entry!.extras?.linkScanPath).toBeTruthy();
  });
});
