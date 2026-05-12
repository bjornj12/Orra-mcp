/**
 * Regression tests ensuring that tool schemas reject path-traversal and
 * other unsafe worktree IDs *before* the handler can construct a filesystem
 * path. A prompt injection should never be able to trick a caller into
 * writing outside `.orra/agents/` via a crafted worktree parameter.
 */
import { describe, it, expect } from "vitest";
import { orraKillSchema } from "../../src/tools/orra-kill.js";
import { orraRebaseSchema } from "../../src/tools/orra-rebase.js";
import { orraInspectSchema } from "../../src/tools/orra-inspect.js";

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
