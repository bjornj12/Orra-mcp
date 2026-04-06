import { describe, it, expect } from "vitest";
import { Linker, expandTemplate } from "../../src/core/linker.js";
import type { AgentState, Link } from "../../src/types.js";

describe("expandTemplate", () => {
  const agent: AgentState = {
    id: "auth-a1b2",
    task: "Refactor auth",
    branch: "orra/auth-a1b2",
    worktree: "worktrees/auth-a1b2",
    pid: 123,
    status: "completed",
    createdAt: "2026-04-06T14:30:00.000Z",
    updatedAt: "2026-04-06T14:31:00.000Z",
    exitCode: 0,
    model: null,
    allowedTools: null,
  };

  it("should expand {{from.branch}}", () => {
    expect(expandTemplate("Review {{from.branch}}", agent)).toBe(
      "Review orra/auth-a1b2"
    );
  });

  it("should expand {{from.worktree}}", () => {
    expect(expandTemplate("Check {{from.worktree}}", agent)).toBe(
      "Check worktrees/auth-a1b2"
    );
  });

  it("should expand {{from.task}}", () => {
    expect(expandTemplate("Continue: {{from.task}}", agent)).toBe(
      "Continue: Refactor auth"
    );
  });

  it("should expand {{from.status}}", () => {
    expect(expandTemplate("Previous: {{from.status}}", agent)).toBe(
      "Previous: completed"
    );
  });

  it("should expand multiple variables", () => {
    expect(
      expandTemplate("Review {{from.branch}} after {{from.task}}", agent)
    ).toBe("Review orra/auth-a1b2 after Refactor auth");
  });

  it("should leave unknown templates untouched", () => {
    expect(expandTemplate("Hello {{unknown}}", agent)).toBe("Hello {{unknown}}");
  });
});

describe("Linker", () => {
  it("should create a pending link", () => {
    const linker = new Linker();
    const link = linker.createLink("agent-1", { task: "review" }, "success");

    expect(link.from).toBe("agent-1");
    expect(link.status).toBe("pending");
    expect(link.on).toBe("success");
    expect(link.id).toMatch(/^link-/);
  });

  it("should find matching links on success", () => {
    const linker = new Linker();
    linker.createLink("agent-1", { task: "review" }, "success");
    linker.createLink("agent-1", { task: "cleanup" }, "failure");
    linker.createLink("agent-2", { task: "other" }, "success");

    const matches = linker.findMatchingLinks("agent-1", 0);
    expect(matches).toHaveLength(1);
    expect(matches[0].to.task).toBe("review");
  });

  it("should find matching links on failure", () => {
    const linker = new Linker();
    linker.createLink("agent-1", { task: "review" }, "success");
    linker.createLink("agent-1", { task: "retry" }, "failure");

    const matches = linker.findMatchingLinks("agent-1", 1);
    expect(matches).toHaveLength(1);
    expect(matches[0].to.task).toBe("retry");
  });

  it("should match 'any' trigger on success or failure", () => {
    const linker = new Linker();
    linker.createLink("agent-1", { task: "always run" }, "any");

    expect(linker.findMatchingLinks("agent-1", 0)).toHaveLength(1);
    expect(linker.findMatchingLinks("agent-1", 1)).toHaveLength(1);
  });

  it("should mark non-matching links as expired", () => {
    const linker = new Linker();
    linker.createLink("agent-1", { task: "on fail" }, "failure");

    linker.evaluateAndExpire("agent-1", 0);
    const links = linker.getAllLinks();
    expect(links[0].status).toBe("expired");
  });

  it("should mark fired links", () => {
    const linker = new Linker();
    const link = linker.createLink("agent-1", { task: "review" }, "success");

    linker.markFired(link.id, "review-agent-x1y2");
    const updated = linker.getAllLinks();
    expect(updated[0].status).toBe("fired");
    expect(updated[0].firedAgentId).toBe("review-agent-x1y2");
  });

  it("should not match already-fired links", () => {
    const linker = new Linker();
    const link = linker.createLink("agent-1", { task: "review" }, "success");
    linker.markFired(link.id, "review-agent-x1y2");

    const matches = linker.findMatchingLinks("agent-1", 0);
    expect(matches).toHaveLength(0);
  });

  it("should load links from existing array", () => {
    const linker = new Linker();
    const existingLinks: Link[] = [
      {
        id: "link-abc",
        from: "agent-1",
        to: { task: "review" },
        on: "success",
        status: "pending",
        firedAgentId: null,
        createdAt: "2026-04-06T14:35:00.000Z",
      },
    ];
    linker.loadLinks(existingLinks);
    expect(linker.getAllLinks()).toHaveLength(1);
    expect(linker.getAllLinks()[0].id).toBe("link-abc");
  });
});
