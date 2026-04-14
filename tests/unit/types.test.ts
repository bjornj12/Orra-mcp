import { describe, it, expect } from "vitest";
import {
  AgentStateSchema,
  ConfigSchema,
  AgentStatus,
  GitStateSchema,
  PrStateSchema,
  WorktreeStatusSchema,
  ScanResultSchema,
  AgentSummarySchema,
  WorktreeScanEntrySchema,
  type AgentState,
  type Config,
  type GitState,
  type PrState,
  type WorktreeStatus,
  type ScanResult,
} from "../../src/types.js";

describe("AgentStateSchema", () => {
  it("should validate a complete agent state", () => {
    const state: AgentState = {
      id: "auth-refactor-a1b2",
      task: "Refactor auth middleware",
      branch: "orra/auth-refactor-a1b2",
      worktree: "worktrees/auth-refactor-a1b2",
      pid: 12345,
      status: "running",
      agentPersona: null,
      model: null,
      createdAt: "2026-04-06T14:30:00.000Z",
      updatedAt: "2026-04-06T14:30:00.000Z",
      exitCode: null,
      pendingQuestion: null,
    };
    expect(AgentStateSchema.parse(state)).toEqual(state);
  });

  it("should reject invalid status", () => {
    expect(() =>
      AgentStateSchema.parse({
        id: "test",
        task: "test",
        branch: "orra/test",
        worktree: "worktrees/test",
        pid: 1,
        status: "invalid",
        agentPersona: null,
        model: null,
        createdAt: "2026-04-06T14:30:00.000Z",
        updatedAt: "2026-04-06T14:30:00.000Z",
        exitCode: null,
        pendingQuestion: null,
      })
    ).toThrow();
  });

  it("should accept completed state with exit code", () => {
    const state: AgentState = {
      id: "test-a1b2",
      task: "test task",
      branch: "orra/test-a1b2",
      worktree: "worktrees/test-a1b2",
      pid: 999,
      status: "completed",
      agentPersona: "my-agent",
      model: "sonnet",
      createdAt: "2026-04-06T14:30:00.000Z",
      updatedAt: "2026-04-06T14:31:00.000Z",
      exitCode: 0,
      pendingQuestion: null,
    };
    expect(AgentStateSchema.parse(state)).toEqual(state);
  });

  it("should validate with a pendingQuestion object", () => {
    const state: AgentState = {
      id: "test-b3c4",
      task: "Write tests",
      branch: "orra/write-tests-b3c4",
      worktree: "worktrees/write-tests-b3c4",
      pid: 99999,
      status: "waiting",
      agentPersona: "tester",
      model: null,
      createdAt: "2026-04-08T11:00:00.000Z",
      updatedAt: "2026-04-08T11:02:00.000Z",
      exitCode: null,
      pendingQuestion: {
        tool: "Bash",
        input: { command: "npm test" },
      },
    };
    const parsed = AgentStateSchema.parse(state);
    expect(parsed.pendingQuestion).toEqual({ tool: "Bash", input: { command: "npm test" } });
  });
});


describe("ConfigSchema", () => {
  it("should validate a full config", () => {
    const config: Config = {
      markers: ["spec.md", "PLAN.md"],
      staleDays: 7,
      worktreeDir: "worktrees",
      driftThreshold: 50,
      defaultModel: "sonnet",
      defaultAgent: "my-agent",
      providers: [],
      providerCache: { ttl: 5000 },
      headlessSpawnConcurrency: 3,
    };
    expect(ConfigSchema.parse(config)).toEqual(config);
  });

  it("should apply defaults when fields are omitted", () => {
    const parsed = ConfigSchema.parse({});
    expect(parsed.markers).toEqual(["spec.md", "PRD.md", "PLAN.md", "CHANGELOG.md"]);
    expect(parsed.staleDays).toBe(3);
    expect(parsed.worktreeDir).toBe("worktrees");
    expect(parsed.driftThreshold).toBe(20);
    expect(parsed.defaultModel).toBeNull();
    expect(parsed.defaultAgent).toBeNull();
  });

  it("should accept null for defaultModel and defaultAgent", () => {
    const config = {
      markers: ["spec.md"],
      staleDays: 5,
      worktreeDir: "wt",
      driftThreshold: 10,
      defaultModel: null,
      defaultAgent: null,
    };
    const parsed = ConfigSchema.parse(config);
    expect(parsed.defaultModel).toBeNull();
    expect(parsed.defaultAgent).toBeNull();
  });
});


describe("AgentStatus with idle and waiting", () => {
  it("should accept idle status", () => {
    expect(AgentStatus.parse("idle")).toBe("idle");
  });
  it("should accept waiting status", () => {
    expect(AgentStatus.parse("waiting")).toBe("waiting");
  });
});


describe("GitStateSchema", () => {
  it("should validate a valid git state", () => {
    const git: GitState = {
      ahead: 2,
      behind: 0,
      uncommitted: 3,
      lastCommit: "feat: add v2 types",
      diffStat: "3 files changed, 120 insertions(+), 5 deletions(-)",
    };
    expect(GitStateSchema.parse(git)).toEqual(git);
  });

  it("should reject missing required fields", () => {
    expect(() => GitStateSchema.parse({ ahead: 0, behind: 0 })).toThrow();
  });
});


describe("PrStateSchema", () => {
  it("should validate a valid PR state", () => {
    const pr: PrState = {
      number: 42,
      state: "open",
      reviews: "approved",
      ci: "passing",
      mergeable: true,
    };
    expect(PrStateSchema.parse(pr)).toEqual(pr);
  });

  it("should validate a non-mergeable PR", () => {
    const pr: PrState = {
      number: 7,
      state: "open",
      reviews: "changes_requested",
      ci: "failing",
      mergeable: false,
    };
    expect(PrStateSchema.parse(pr)).toEqual(pr);
  });
});


describe("WorktreeStatusSchema", () => {
  it("should accept all valid statuses", () => {
    const validStatuses: WorktreeStatus[] = [
      "ready_to_land",
      "needs_attention",
      "in_progress",
      "idle",
      "stale",
    ];
    for (const status of validStatuses) {
      expect(WorktreeStatusSchema.parse(status)).toBe(status);
    }
  });

  it("should reject an invalid status", () => {
    expect(() => WorktreeStatusSchema.parse("unknown")).toThrow();
    expect(() => WorktreeStatusSchema.parse("done")).toThrow();
  });
});


describe("ScanResultSchema", () => {
  it("should validate a valid scan result", () => {
    const result: ScanResult = {
      worktrees: [
        {
          id: "feat-auth-a1b2",
          path: "/home/user/project/worktrees/feat-auth-a1b2",
          branch: "feat/auth",
          status: "in_progress",
          git: {
            ahead: 3,
            behind: 0,
            uncommitted: 1,
            lastCommit: "fix: auth token refresh",
            diffStat: "2 files changed, 30 insertions(+)",
          },
          markers: ["spec.md", "PLAN.md"],
          pr: {
            number: 15,
            state: "open",
            reviews: "pending",
            ci: "running",
            mergeable: false,
          },
          agent: {
            id: "feat-auth-a1b2",
            task: "Implement auth feature",
            branch: "feat/auth",
            worktree: "worktrees/feat-auth-a1b2",
            pid: 55555,
            status: "running",
            agentPersona: null,
            model: "sonnet",
            createdAt: "2026-04-08T09:00:00.000Z",
            updatedAt: "2026-04-08T09:30:00.000Z",
            exitCode: null,
            pendingQuestion: null,
          },
          flags: ["has_pr", "ci_running"],
        },
      ],
      summary: {
        ready_to_land: 0,
        needs_attention: 0,
        in_progress: 1,
        idle: 0,
        stale: 0,
        total: 1,
      },
    };
    expect(ScanResultSchema.parse(result)).toEqual(result);
  });

  it("should validate a scan result with no worktrees", () => {
    const result: ScanResult = {
      worktrees: [],
      summary: {
        ready_to_land: 0,
        needs_attention: 0,
        in_progress: 0,
        idle: 0,
        stale: 0,
        total: 0,
      },
    };
    expect(ScanResultSchema.parse(result)).toEqual(result);
  });

  it("should validate worktree entry with null pr and null agent", () => {
    const result = {
      worktrees: [
        {
          id: "idle-d5e6",
          path: "/home/user/project/worktrees/idle-d5e6",
          branch: "chore/cleanup",
          status: "idle",
          git: {
            ahead: 0,
            behind: 0,
            uncommitted: 0,
            lastCommit: "chore: cleanup old files",
            diffStat: "",
          },
          markers: [],
          pr: null,
          agent: null,
          flags: [],
        },
      ],
      summary: {
        ready_to_land: 0,
        needs_attention: 0,
        in_progress: 0,
        idle: 1,
        stale: 0,
        total: 1,
      },
    };
    const parsed = ScanResultSchema.parse(result);
    expect(parsed.worktrees[0].pr).toBeNull();
    expect(parsed.worktrees[0].agent).toBeNull();
  });
});

describe("AgentSummarySchema", () => {
  it("accepts a minimal valid summary", () => {
    const input = {
      agentId: "abc",
      summarizedAt: "2026-04-13T10:00:00.000Z",
      logMtime: "2026-04-13T09:59:00.000Z",
      schemaVersion: 1,
      oneLine: "Writing integration tests",
      needsAttentionScore: 15,
      likelyStuckReason: null,
      lastTestResult: "unknown",
      lastFileEdited: null,
      lastActivityAt: "2026-04-13T09:59:00.000Z",
      tailLines: ["running: npm test", "PASS: src/foo.test.ts"],
    };
    expect(() => AgentSummarySchema.parse(input)).not.toThrow();
  });

  it("rejects needsAttentionScore above 100", () => {
    const bad = {
      agentId: "abc",
      summarizedAt: "2026-04-13T10:00:00.000Z",
      logMtime: "2026-04-13T09:59:00.000Z",
      schemaVersion: 1,
      oneLine: "",
      needsAttentionScore: 150,
      likelyStuckReason: null,
      lastTestResult: "unknown",
      lastFileEdited: null,
      lastActivityAt: null,
      tailLines: [],
    };
    expect(() => AgentSummarySchema.parse(bad)).toThrow();
  });

  it("rejects needsAttentionScore below 0", () => {
    const bad = {
      agentId: "abc",
      summarizedAt: "2026-04-13T10:00:00.000Z",
      logMtime: "2026-04-13T09:59:00.000Z",
      schemaVersion: 1,
      oneLine: "",
      needsAttentionScore: -1,
      likelyStuckReason: null,
      lastTestResult: "unknown",
      lastFileEdited: null,
      lastActivityAt: null,
      tailLines: [],
    };
    expect(() => AgentSummarySchema.parse(bad)).toThrow();
  });

  it("allows WorktreeScanEntry to include an optional summary", () => {
    const entry = {
      id: "wt-1", path: "/tmp/wt-1", branch: "feature/x", status: "idle",
      git: { ahead: 0, behind: 0, uncommitted: 0, lastCommit: "2026-04-13T00:00:00.000Z", diffStat: "" },
      markers: [], pr: null, agent: null, flags: [],
      summary: {
        agentId: "abc",
        summarizedAt: "2026-04-13T10:00:00.000Z",
        logMtime: "2026-04-13T09:59:00.000Z",
        schemaVersion: 1,
        oneLine: "hi",
        needsAttentionScore: 0,
        likelyStuckReason: null,
        lastTestResult: "unknown",
        lastFileEdited: null,
        lastActivityAt: null,
        tailLines: [],
      },
    };
    expect(() => WorktreeScanEntrySchema.parse(entry)).not.toThrow();
  });
});

describe("ConfigSchema — headlessSpawnConcurrency", () => {
  it("accepts a positive integer", () => {
    expect(() => ConfigSchema.parse({ headlessSpawnConcurrency: 5 })).not.toThrow();
  });

  it("defaults to 3 when omitted", () => {
    const result = ConfigSchema.parse({});
    expect(result.headlessSpawnConcurrency).toBe(3);
  });

  it("accepts 0 (disables headless spawning)", () => {
    const result = ConfigSchema.parse({ headlessSpawnConcurrency: 0 });
    expect(result.headlessSpawnConcurrency).toBe(0);
  });

  it("rejects negative values", () => {
    expect(() => ConfigSchema.parse({ headlessSpawnConcurrency: -1 })).toThrow();
  });

  it("rejects non-integer values", () => {
    expect(() => ConfigSchema.parse({ headlessSpawnConcurrency: 2.5 })).toThrow();
  });
});
