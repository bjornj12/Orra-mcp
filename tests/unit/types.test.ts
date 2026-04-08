import { describe, it, expect } from "vitest";
import {
  AgentStateSchema,
  LinkSchema,
  ConfigSchema,
  AgentStatus,
  AgentType,
  LinkStatus,
  LinkTrigger,
  SocketMessageSchema,
  ConfigV2Schema,
  GitStateSchema,
  PrStateSchema,
  WorktreeStatusSchema,
  AgentStateV2Schema,
  ScanResultSchema,
  type AgentState,
  type Link,
  type Config,
  type SocketMessage,
  type ConfigV2,
  type GitState,
  type PrState,
  type WorktreeStatus,
  type AgentStateV2,
  type ScanResult,
} from "../../src/types.js";

describe("AgentStateSchema", () => {
  it("should validate a complete agent state", () => {
    const state: AgentState = {
      id: "auth-refactor-a1b2",
      type: "spawned",
      task: "Refactor auth middleware",
      branch: "orra/auth-refactor-a1b2",
      worktree: "worktrees/auth-refactor-a1b2",
      pid: 12345,
      status: "running",
      createdAt: "2026-04-06T14:30:00.000Z",
      updatedAt: "2026-04-06T14:30:00.000Z",
      exitCode: null,
      model: null,
      allowedTools: null,
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
        createdAt: "2026-04-06T14:30:00.000Z",
        updatedAt: "2026-04-06T14:30:00.000Z",
        exitCode: null,
        model: null,
        allowedTools: null,
      })
    ).toThrow();
  });

  it("should accept completed state with exit code", () => {
    const state = {
      id: "test-a1b2",
      type: "spawned",
      task: "test task",
      branch: "orra/test-a1b2",
      worktree: "worktrees/test-a1b2",
      pid: 999,
      status: "completed",
      createdAt: "2026-04-06T14:30:00.000Z",
      updatedAt: "2026-04-06T14:31:00.000Z",
      exitCode: 0,
      model: "sonnet",
      allowedTools: ["Read", "Edit"],
    };
    expect(AgentStateSchema.parse(state)).toEqual(state);
  });
});

describe("LinkSchema", () => {
  it("should validate a pending link", () => {
    const link: Link = {
      id: "link-x1y2",
      from: "auth-refactor-a1b2",
      to: { task: "Review changes on branch {{from.branch}}" },
      on: "success",
      status: "pending",
      firedAgentId: null,
      createdAt: "2026-04-06T14:35:00.000Z",
    };
    expect(LinkSchema.parse(link)).toEqual(link);
  });

  it("should validate a fired link with agent ID", () => {
    const link: Link = {
      id: "link-x1y2",
      from: "auth-refactor-a1b2",
      to: { task: "Review changes", branch: "custom-branch" },
      on: "success",
      status: "fired",
      firedAgentId: "review-auth-e5f6",
      createdAt: "2026-04-06T14:35:00.000Z",
    };
    expect(LinkSchema.parse(link)).toEqual(link);
  });

  it("should reject invalid trigger", () => {
    expect(() =>
      LinkSchema.parse({
        id: "link-x1y2",
        from: "test",
        to: { task: "test" },
        on: "maybe",
        status: "pending",
        firedAgentId: null,
        createdAt: "2026-04-06T14:35:00.000Z",
      })
    ).toThrow();
  });
});

describe("ConfigSchema", () => {
  it("should validate default config", () => {
    const config: Config = {
      defaultModel: null,
      defaultAllowedTools: null,
      spawnCommand: null,
    };
    expect(ConfigSchema.parse(config)).toEqual(config);
  });

  it("should validate config with values", () => {
    const config: Config = {
      defaultModel: "opus",
      defaultAllowedTools: ["Read", "Edit", "Bash"],
      spawnCommand: "yarn sandbox {{branch}}",
    };
    expect(ConfigSchema.parse(config)).toEqual(config);
  });

  it("should default spawnCommand to null if missing", () => {
    const config = { defaultModel: null, defaultAllowedTools: null };
    const parsed = ConfigSchema.parse(config);
    expect(parsed.spawnCommand).toBeNull();
  });
});

describe("AgentType", () => {
  it("should accept spawned", () => {
    expect(AgentType.parse("spawned")).toBe("spawned");
  });
  it("should accept external", () => {
    expect(AgentType.parse("external")).toBe("external");
  });
  it("should reject unknown type", () => {
    expect(() => AgentType.parse("unknown")).toThrow();
  });
});

describe("AgentStateSchema with type field", () => {
  it("should validate spawned agent", () => {
    const state = {
      id: "test-a1b2", type: "spawned", task: "test", branch: "orra/test",
      worktree: "worktrees/test", pid: 123, status: "running",
      createdAt: "2026-04-06T14:30:00.000Z", updatedAt: "2026-04-06T14:30:00.000Z",
      exitCode: null, model: null, allowedTools: null,
    };
    expect(AgentStateSchema.parse(state)).toEqual(state);
  });

  it("should validate external agent with pid 0", () => {
    const state = {
      id: "auth-a1b2", type: "external", task: "Working on auth", branch: "feat/auth",
      worktree: "", pid: 0, status: "running",
      createdAt: "2026-04-06T14:30:00.000Z", updatedAt: "2026-04-06T14:30:00.000Z",
      exitCode: null, model: null, allowedTools: null,
    };
    expect(AgentStateSchema.parse(state)).toEqual(state);
  });

  it("should default type to spawned for backward compatibility", () => {
    const state = {
      id: "old-a1b2", task: "old task", branch: "orra/old",
      worktree: "worktrees/old", pid: 123, status: "completed",
      createdAt: "2026-04-06T14:30:00.000Z", updatedAt: "2026-04-06T14:30:00.000Z",
      exitCode: 0, model: null, allowedTools: null,
    };
    const parsed = AgentStateSchema.parse(state);
    expect(parsed.type).toBe("spawned");
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

describe("SocketMessageSchema — hook messages", () => {
  it("should validate question message", () => {
    const msg = { type: "question", agentId: "test-a1b2", tool: "Bash", input: { command: "npm install" } };
    expect(SocketMessageSchema.parse(msg).type).toBe("question");
  });
  it("should validate turn_complete message", () => {
    const msg = { type: "turn_complete", agentId: "test-a1b2" };
    expect(SocketMessageSchema.parse(msg).type).toBe("turn_complete");
  });
  it("should validate answer message", () => {
    const msg = { type: "answer", allow: true };
    expect(SocketMessageSchema.parse(msg).type).toBe("answer");
  });
  it("should validate answer with deny and reason", () => {
    const msg = { type: "answer", allow: false, reason: "too dangerous" };
    expect(SocketMessageSchema.parse(msg).type).toBe("answer");
  });
});

describe("SocketMessageSchema", () => {
  it("should validate register message", () => {
    const msg = { type: "register", task: "auth refactor", branch: "feat/auth" };
    expect(SocketMessageSchema.parse(msg).type).toBe("register");
  });
  it("should validate output message", () => {
    const msg = { type: "output", data: "Reading file...\n" };
    expect(SocketMessageSchema.parse(msg).type).toBe("output");
  });
  it("should validate status message", () => {
    const msg = { type: "status", status: "completed", exitCode: 0 };
    expect(SocketMessageSchema.parse(msg).type).toBe("status");
  });
  it("should validate registered message", () => {
    const msg = { type: "registered", agentId: "auth-a1b2" };
    expect(SocketMessageSchema.parse(msg).type).toBe("registered");
  });
  it("should validate message message", () => {
    const msg = { type: "message", content: "check the auth" };
    expect(SocketMessageSchema.parse(msg).type).toBe("message");
  });
  it("should validate stop message", () => {
    const msg = { type: "stop", reason: "user requested" };
    expect(SocketMessageSchema.parse(msg).type).toBe("stop");
  });
});

describe("v2 types", () => {
  describe("ConfigV2Schema", () => {
    it("should validate a full config", () => {
      const config: ConfigV2 = {
        markers: ["spec.md", "PLAN.md"],
        staleDays: 7,
        worktreeDir: "worktrees",
        driftThreshold: 50,
        defaultModel: "sonnet",
        defaultAgent: "my-agent",
      };
      expect(ConfigV2Schema.parse(config)).toEqual(config);
    });

    it("should apply defaults when fields are omitted", () => {
      const parsed = ConfigV2Schema.parse({});
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
      const parsed = ConfigV2Schema.parse(config);
      expect(parsed.defaultModel).toBeNull();
      expect(parsed.defaultAgent).toBeNull();
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

  describe("AgentStateV2Schema", () => {
    it("should validate with pendingQuestion null", () => {
      const agent: AgentStateV2 = {
        id: "test-a1b2",
        task: "Refactor cache layer",
        branch: "orra/refactor-cache-a1b2",
        worktree: "worktrees/refactor-cache-a1b2",
        pid: 12345,
        status: "running",
        agentPersona: null,
        model: "sonnet",
        createdAt: "2026-04-08T10:00:00.000Z",
        updatedAt: "2026-04-08T10:05:00.000Z",
        exitCode: null,
        pendingQuestion: null,
      };
      expect(AgentStateV2Schema.parse(agent)).toEqual(agent);
    });

    it("should validate with a pendingQuestion object", () => {
      const agent: AgentStateV2 = {
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
      const parsed = AgentStateV2Schema.parse(agent);
      expect(parsed.pendingQuestion).toEqual({ tool: "Bash", input: { command: "npm test" } });
    });

    it("should reject invalid status", () => {
      expect(() =>
        AgentStateV2Schema.parse({
          id: "x",
          task: "t",
          branch: "b",
          worktree: "w",
          pid: 1,
          status: "invalid_status",
          agentPersona: null,
          model: null,
          createdAt: "2026-04-08T10:00:00.000Z",
          updatedAt: "2026-04-08T10:00:00.000Z",
          exitCode: null,
          pendingQuestion: null,
        })
      ).toThrow();
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
});
