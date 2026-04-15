/**
 * Regression tests ensuring that tool schemas reject path-traversal and
 * other unsafe worktree IDs *before* the handler can construct a filesystem
 * path. A prompt injection should never be able to trick a caller into
 * writing outside `.orra/agents/` via a crafted worktree parameter.
 */
import { describe, it, expect } from "vitest";
import { orraUnblockSchema } from "../../src/tools/orra-unblock.js";
import { orraKillSchema } from "../../src/tools/orra-kill.js";
import { orraRebaseSchema } from "../../src/tools/orra-rebase.js";
import { orraInspectSchema } from "../../src/tools/orra-inspect.js";
import { orraRegisterSchema } from "../../src/tools/orra-register.js";

const TRAVERSAL_ATTEMPTS = [
  "../etc/passwd",
  "../../home/user/.bashrc",
  "../..",
  "foo/../../etc",
  "foo/bar",
  "foo\\bar",
  "",
  " ",
  "foo bar",
  "-rf",
  "--help",
  ".hidden",
  "$(whoami)",
  "`id`",
];

describe("orra_unblock rejects path-traversal worktree values", () => {
  for (const attempt of TRAVERSAL_ATTEMPTS) {
    it(`rejects ${JSON.stringify(attempt)}`, () => {
      expect(() =>
        orraUnblockSchema.parse({ worktree: attempt, allow: true }),
      ).toThrow();
    });
  }

  it("accepts a normal worktree ID", () => {
    expect(() =>
      orraUnblockSchema.parse({ worktree: "feat-auth-a1b2", allow: true }),
    ).not.toThrow();
  });
});

describe("orra_kill rejects path-traversal worktree values", () => {
  for (const attempt of TRAVERSAL_ATTEMPTS) {
    it(`rejects ${JSON.stringify(attempt)}`, () => {
      expect(() => orraKillSchema.parse({ worktree: attempt })).toThrow();
    });
  }

  it("accepts a normal worktree ID", () => {
    expect(() =>
      orraKillSchema.parse({ worktree: "feat-auth-a1b2" }),
    ).not.toThrow();
  });
});

describe("orra_rebase rejects path-traversal worktree values", () => {
  for (const attempt of TRAVERSAL_ATTEMPTS) {
    it(`rejects ${JSON.stringify(attempt)}`, () => {
      expect(() => orraRebaseSchema.parse({ worktree: attempt })).toThrow();
    });
  }
});

describe("orra_inspect rejects path-traversal worktree values", () => {
  for (const attempt of TRAVERSAL_ATTEMPTS) {
    it(`rejects ${JSON.stringify(attempt)}`, () => {
      expect(() => orraInspectSchema.parse({ worktree: attempt })).toThrow();
    });
  }
});

describe("orra_register accepts absolute paths but rejects unsafe IDs", () => {
  it("accepts an absolute path", () => {
    expect(() =>
      orraRegisterSchema.parse({ worktree: "/tmp/some/worktree" }),
    ).not.toThrow();
  });

  it("accepts a normal worktree ID", () => {
    expect(() =>
      orraRegisterSchema.parse({ worktree: "feat-auth" }),
    ).not.toThrow();
  });

  it("rejects path-traversal IDs", () => {
    expect(() =>
      orraRegisterSchema.parse({ worktree: "../etc/passwd" }),
    ).toThrow();
    expect(() => orraRegisterSchema.parse({ worktree: "foo/bar" })).toThrow();
    expect(() => orraRegisterSchema.parse({ worktree: "" })).toThrow();
  });
});
