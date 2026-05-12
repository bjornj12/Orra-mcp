import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { configDir, readRoster, readJobs, readJobState, readJobTimeline } from "../../../src/core/daemon-state.js";

const ROSTER_FIXTURE = {
  proto: 1,
  supervisorPid: 46918,
  updatedAt: 1778599821448,
  workers: {
    "192c325c": {
      pid: 46928,
      procStart: "Tue May 12 15:30:20 2026",
      sessionId: "192c325c-9d2f-4b11-bb54-ea933ddcb36b",
      cwd: "/private/tmp",
      startedAt: 1778599820998,
      cliVersion: "2.1.139",
    },
  },
};

const JOB_STATE_FIXTURE = {
  state: "done",
  detail: "executed echo command, probe complete",
  tempo: "idle",
  inFlight: { tasks: 0, queued: 0, kinds: [] },
  output: { result: "echo hello executed" },
  children: null,
  linkScanPath: "/x/projects/-private-tmp/192c325c-9d2f-4b11-bb54-ea933ddcb36b.jsonl",
  intent: "Run: echo hello",
  name: "orra-probe",
  sessionId: "192c325c-9d2f-4b11-bb54-ea933ddcb36b",
  resumeSessionId: "192c325c-9d2f-4b11-bb54-ea933ddcb36b",
  daemonShort: "192c325c",
  cwd: "/private/tmp",
  backend: "daemon",
  createdAt: "2026-05-12T15:30:20.508Z",
  updatedAt: "2026-05-12T15:30:28.715Z",
  firstTerminalAt: "2026-05-12T15:30:28.715Z",
};

const TIMELINE_LINE_1 = {
  at: "2026-05-12T15:30:22.000Z",
  state: "running",
  detail: "starting task",
  text: "I'll run echo hello now.",
};
const TIMELINE_LINE_2 = {
  at: "2026-05-12T15:30:28.715Z",
  state: "done",
  detail: "executed echo command, probe complete",
  text: "Done. Echo executed successfully.",
};

describe("daemon-state", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), "orra-daemon-"));
    await fsp.mkdir(path.join(dir, "daemon"), { recursive: true });
    await fsp.mkdir(path.join(dir, "jobs", "192c325c"), { recursive: true });
    await fsp.writeFile(path.join(dir, "daemon", "roster.json"), JSON.stringify(ROSTER_FIXTURE));
    await fsp.writeFile(path.join(dir, "jobs", "192c325c", "state.json"), JSON.stringify(JOB_STATE_FIXTURE));
    await fsp.writeFile(path.join(dir, "jobs", "pins.json"), "[]");
  });
  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it("configDir honors CLAUDE_CONFIG_DIR", () => {
    const prev = process.env.CLAUDE_CONFIG_DIR;
    try {
      process.env.CLAUDE_CONFIG_DIR = "/custom/dir";
      expect(configDir()).toBe("/custom/dir");
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = prev;
    }
  });

  it("configDir defaults to ~/.claude", () => {
    const prev = process.env.CLAUDE_CONFIG_DIR;
    try {
      delete process.env.CLAUDE_CONFIG_DIR;
      expect(configDir()).toBe(path.join(os.homedir(), ".claude"));
    } finally {
      if (prev !== undefined) process.env.CLAUDE_CONFIG_DIR = prev;
    }
  });

  it("readRoster parses workers", async () => {
    const r = await readRoster(dir);
    expect(r?.workers["192c325c"].sessionId).toBe("192c325c-9d2f-4b11-bb54-ea933ddcb36b");
  });

  it("readRoster returns null when missing", async () => {
    expect(await readRoster("/no/such/dir")).toBeNull();
  });

  it("readRoster returns null on unknown proto", async () => {
    await fsp.writeFile(
      path.join(dir, "daemon", "roster.json"),
      JSON.stringify({ ...ROSTER_FIXTURE, proto: 99 })
    );
    expect(await readRoster(dir)).toBeNull();
  });

  it("readJobs lists job states, skipping pins.json", async () => {
    const jobs = await readJobs(dir);
    expect(jobs.map((j) => j.daemonShort)).toEqual(["192c325c"]);
    expect(jobs[0].detail).toContain("probe complete");
  });

  it("readJobState reads one job by short id", async () => {
    const j = await readJobState(dir, "192c325c");
    expect(j?.state).toBe("done");
  });

  it("readJobState returns null for unknown short", async () => {
    expect(await readJobState(dir, "deadbeef")).toBeNull();
  });

  it("readJobs tolerates a malformed job dir", async () => {
    await fsp.mkdir(path.join(dir, "jobs", "garbage"), { recursive: true });
    await fsp.writeFile(path.join(dir, "jobs", "garbage", "state.json"), "{not json");
    const jobs = await readJobs(dir);
    expect(jobs.map((j) => j.daemonShort)).toEqual(["192c325c"]);
  });

  it("readJobTimeline parses timeline lines", async () => {
    await fsp.writeFile(
      path.join(dir, "jobs", "192c325c", "timeline.jsonl"),
      [JSON.stringify(TIMELINE_LINE_1), JSON.stringify(TIMELINE_LINE_2)].join("\n") + "\n"
    );
    const lines = await readJobTimeline(dir, "192c325c");
    expect(lines).toHaveLength(2);
    expect(lines[0].state).toBe("running");
    expect(lines[1].text).toBe("Done. Echo executed successfully.");
  });

  it("readJobTimeline returns empty array when file is missing", async () => {
    expect(await readJobTimeline(dir, "192c325c")).toEqual([]);
  });

  it("readJobTimeline returns empty array for unknown short", async () => {
    expect(await readJobTimeline(dir, "deadbeef")).toEqual([]);
  });

  it("readJobTimeline tolerates malformed lines", async () => {
    await fsp.writeFile(
      path.join(dir, "jobs", "192c325c", "timeline.jsonl"),
      "{not json\n" + JSON.stringify(TIMELINE_LINE_2) + "\n"
    );
    const lines = await readJobTimeline(dir, "192c325c");
    expect(lines).toHaveLength(1);
    expect(lines[0].state).toBe("done");
  });

  it("readRoster preserves unknown fields via passthrough", async () => {
    const withExtra = { ...ROSTER_FIXTURE, futureProp: "hello" };
    await fsp.writeFile(path.join(dir, "daemon", "roster.json"), JSON.stringify(withExtra));
    const r = await readRoster(dir);
    expect((r as any).futureProp).toBe("hello");
  });

  it("readJobState preserves worktreePath and worktreeBranch when present", async () => {
    const withWorktree = {
      ...JOB_STATE_FIXTURE,
      worktreePath: "/repo/.claude/worktrees/p-wt",
      worktreeBranch: "worktree-p-wt",
    };
    await fsp.writeFile(
      path.join(dir, "jobs", "192c325c", "state.json"),
      JSON.stringify(withWorktree)
    );
    const j = await readJobState(dir, "192c325c");
    expect(j?.worktreePath).toBe("/repo/.claude/worktrees/p-wt");
    expect(j?.worktreeBranch).toBe("worktree-p-wt");
  });
});
