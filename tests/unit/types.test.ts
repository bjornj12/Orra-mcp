import { describe, it, expect } from "vitest";
import {
  AgentStateSchema,
  LinkSchema,
  ConfigSchema,
  AgentStatus,
  LinkStatus,
  LinkTrigger,
  type AgentState,
  type Link,
  type Config,
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
