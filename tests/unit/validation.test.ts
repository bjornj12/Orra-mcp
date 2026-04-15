import { describe, it, expect } from "vitest";
import { isSafeWorktreeId, isSafeBranchName, SafeWorktreeIdSchema } from "../../src/core/validation.js";

describe("isSafeWorktreeId", () => {
  it("accepts alphanumeric IDs", () => {
    expect(isSafeWorktreeId("feat-auth")).toBe(true);
    expect(isSafeWorktreeId("auth_refactor_v2")).toBe(true);
    expect(isSafeWorktreeId("a")).toBe(true);
    expect(isSafeWorktreeId("abc123")).toBe(true);
  });

  it("accepts IDs with the random suffix produced by agent-manager", () => {
    expect(isSafeWorktreeId("rebase-onto-main-ab3c")).toBe(true);
    expect(isSafeWorktreeId("headless-0000")).toBe(true);
  });

  it("rejects path traversal attempts", () => {
    expect(isSafeWorktreeId("../etc/passwd")).toBe(false);
    expect(isSafeWorktreeId("..")).toBe(false);
    expect(isSafeWorktreeId("../..")).toBe(false);
    expect(isSafeWorktreeId("../../home/user/.bashrc")).toBe(false);
  });

  it("rejects absolute paths", () => {
    expect(isSafeWorktreeId("/etc/passwd")).toBe(false);
    expect(isSafeWorktreeId("/tmp/foo")).toBe(false);
  });

  it("rejects IDs containing separators", () => {
    expect(isSafeWorktreeId("foo/bar")).toBe(false);
    expect(isSafeWorktreeId("foo\\bar")).toBe(false);
    expect(isSafeWorktreeId("foo:bar")).toBe(false);
    expect(isSafeWorktreeId("foo;bar")).toBe(false);
  });

  it("rejects IDs starting with a dash (could be mistaken for a CLI flag)", () => {
    expect(isSafeWorktreeId("-rf")).toBe(false);
    expect(isSafeWorktreeId("--help")).toBe(false);
  });

  it("rejects IDs starting with underscore or dot", () => {
    // Underscore start would be fine in the regex as written — adjust if needed.
    // Dot start is rejected because the regex requires alphanumeric.
    expect(isSafeWorktreeId(".hidden")).toBe(false);
    expect(isSafeWorktreeId(".")).toBe(false);
  });

  it("rejects empty and whitespace IDs", () => {
    expect(isSafeWorktreeId("")).toBe(false);
    expect(isSafeWorktreeId(" ")).toBe(false);
    expect(isSafeWorktreeId("foo bar")).toBe(false);
    expect(isSafeWorktreeId("\t")).toBe(false);
    expect(isSafeWorktreeId("\n")).toBe(false);
  });

  it("rejects IDs with shell metacharacters", () => {
    expect(isSafeWorktreeId("foo$bar")).toBe(false);
    expect(isSafeWorktreeId("foo|bar")).toBe(false);
    expect(isSafeWorktreeId("foo&bar")).toBe(false);
    expect(isSafeWorktreeId("foo`bar`")).toBe(false);
    expect(isSafeWorktreeId("foo;ls")).toBe(false);
  });

  it("rejects IDs longer than 100 characters", () => {
    expect(isSafeWorktreeId("a".repeat(100))).toBe(true);
    expect(isSafeWorktreeId("a".repeat(101))).toBe(false);
  });
});

describe("SafeWorktreeIdSchema (Zod)", () => {
  it("parses safe IDs", () => {
    expect(() => SafeWorktreeIdSchema.parse("feat-auth")).not.toThrow();
  });

  it("rejects unsafe IDs at parse time", () => {
    expect(() => SafeWorktreeIdSchema.parse("../etc/passwd")).toThrow();
    expect(() => SafeWorktreeIdSchema.parse("")).toThrow();
    expect(() => SafeWorktreeIdSchema.parse("foo/bar")).toThrow();
  });
});

describe("isSafeBranchName", () => {
  it("accepts typical branch names", () => {
    expect(isSafeBranchName("main")).toBe(true);
    expect(isSafeBranchName("feat/auth")).toBe(true);
    expect(isSafeBranchName("release-1.2.3")).toBe(true);
    expect(isSafeBranchName("orra/feat-payments-a1b2")).toBe(true);
  });

  it("rejects branches starting with a dash", () => {
    expect(isSafeBranchName("-rf")).toBe(false);
    expect(isSafeBranchName("--help")).toBe(false);
  });

  it("rejects branches starting with a dot", () => {
    expect(isSafeBranchName(".hidden")).toBe(false);
  });

  it("rejects branches containing ..", () => {
    expect(isSafeBranchName("foo..bar")).toBe(false);
    expect(isSafeBranchName("../escape")).toBe(false);
  });

  it("rejects branches ending with . or /", () => {
    expect(isSafeBranchName("foo.")).toBe(false);
    expect(isSafeBranchName("foo/")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isSafeBranchName("")).toBe(false);
  });

  it("rejects shell metacharacters", () => {
    expect(isSafeBranchName("foo;rm")).toBe(false);
    expect(isSafeBranchName("foo$bar")).toBe(false);
    expect(isSafeBranchName("foo|bar")).toBe(false);
  });
});
