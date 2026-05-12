// tests/unit/core/claude-cli.test.ts
import { describe, it, expect } from "vitest";
import { buildBgArgs, parseBackgroundedId, buildResumeArgs } from "../../../src/core/claude-cli.js";

describe("claude-cli arg building", () => {
  it("buildBgArgs minimal", () => {
    expect(buildBgArgs({ name: "fix-tests", task: "fix the failing tests" })).toEqual([
      "--bg",
      "--name",
      "fix-tests",
      "--",
      "fix the failing tests",
    ]);
  });

  it("buildBgArgs full (without disallowedTools)", () => {
    expect(
      buildBgArgs({
        name: "rb",
        task: "rebase",
        model: "haiku",
        agent: "orchestrator",
        allowedTools: ["Bash", "Read"],
        worktree: true,
      })
    ).toEqual([
      "--bg",
      "--name",
      "rb",
      "--model",
      "haiku",
      "--agent",
      "orchestrator",
      "--allowed-tools",
      "Bash,Read",
      "--worktree",
      "rb",
      "--",
      "rebase",
    ]);
  });

  it("buildBgArgs with disallowedTools", () => {
    expect(
      buildBgArgs({
        name: "locked-agent",
        task: "do something safe",
        disallowedTools: ["Bash", "Edit"],
      })
    ).toEqual([
      "--bg",
      "--name",
      "locked-agent",
      "--disallowed-tools",
      "Bash,Edit",
      "--",
      "do something safe",
    ]);
  });

  it("buildBgArgs with all options including disallowedTools", () => {
    expect(
      buildBgArgs({
        name: "full",
        task: "run checks",
        model: "sonnet",
        agent: "checker",
        allowedTools: ["Read"],
        disallowedTools: ["Bash"],
        worktree: true,
      })
    ).toEqual([
      "--bg",
      "--name",
      "full",
      "--model",
      "sonnet",
      "--agent",
      "checker",
      "--allowed-tools",
      "Read",
      "--disallowed-tools",
      "Bash",
      "--worktree",
      "full",
      "--",
      "run checks",
    ]);
  });

  it("buildBgArgs omits model when not provided", () => {
    const args = buildBgArgs({ name: "no-model", task: "task" });
    expect(args).not.toContain("--model");
  });

  it("buildBgArgs omits agent when not provided", () => {
    const args = buildBgArgs({ name: "no-agent", task: "task" });
    expect(args).not.toContain("--agent");
  });

  it("buildBgArgs omits allowed-tools when empty array", () => {
    const args = buildBgArgs({ name: "n", task: "t", allowedTools: [] });
    expect(args).not.toContain("--allowed-tools");
  });

  it("buildBgArgs omits disallowed-tools when empty array", () => {
    const args = buildBgArgs({ name: "n", task: "t", disallowedTools: [] });
    expect(args).not.toContain("--disallowed-tools");
  });

  it("buildBgArgs omits worktree when false", () => {
    const args = buildBgArgs({ name: "n", task: "t", worktree: false });
    expect(args).not.toContain("--worktree");
  });

  it("parseBackgroundedId extracts 8-char hex short id from multiline output", () => {
    const stdout =
      "Starting background service…\nbackgrounded · 192c325c\n  claude agents             list sessions\n";
    expect(parseBackgroundedId(stdout)).toBe("192c325c");
  });

  it("parseBackgroundedId extracts from single-line output", () => {
    expect(parseBackgroundedId("backgrounded · abcd1234")).toBe("abcd1234");
  });

  it("parseBackgroundedId returns null when no match", () => {
    expect(parseBackgroundedId("some error happened")).toBeNull();
  });

  it("parseBackgroundedId returns null for empty string", () => {
    expect(parseBackgroundedId("")).toBeNull();
  });

  it("buildResumeArgs minimal", () => {
    expect(buildResumeArgs("192c325c", "now do step two")).toEqual([
      "--bg",
      "--resume",
      "192c325c",
      "--",
      "now do step two",
    ]);
  });

  it("buildResumeArgs with model", () => {
    expect(buildResumeArgs("192c325c", "now do step two", { model: "haiku" })).toEqual([
      "--bg",
      "--resume",
      "192c325c",
      "--model",
      "haiku",
      "--",
      "now do step two",
    ]);
  });

  it("buildResumeArgs omits model when not provided in opts", () => {
    const args = buildResumeArgs("abc12345", "prompt", {});
    expect(args).not.toContain("--model");
  });
});
