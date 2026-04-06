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
  type AgentState,
  type Link,
  type Config,
  type SocketMessage,
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
    };
    expect(ConfigSchema.parse(config)).toEqual(config);
  });

  it("should validate config with values", () => {
    const config: Config = {
      defaultModel: "opus",
      defaultAllowedTools: ["Read", "Edit", "Bash"],
    };
    expect(ConfigSchema.parse(config)).toEqual(config);
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
