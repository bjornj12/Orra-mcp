/**
 * Regression tests ensuring that tool schemas reject path-traversal and
 * other unsafe worktree / agent IDs *before* the handler can construct a
 * filesystem path. A prompt injection should never be able to trick a caller
 * into writing outside safe directories via crafted parameters.
 *
 * Notes on orra_kill:
 *   The `agent` field accepts hex short ids (e.g. "abcd1234") and slugs from
 *   the spawn ledger. The handler resolves these via a lookup table rather
 *   than direct path construction, so path-traversal via the `agent` field
 *   does not give filesystem access. Only empty strings are rejected at
 *   the schema level; the handler returns agent_not_found for unknown ids.
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

// orra_kill: agent field is z.string().min(1) — only empty string is rejected at schema.
// Path-traversal strings are handled at handler level (unknown id → agent_not_found).
describe("orra_kill schema — agent field", () => {
  it("rejects empty string", () => {
    expect(() => orraKillSchema.parse({ agent: "" })).toThrow();
  });

  it("accepts a hex short id", () => {
    expect(() => orraKillSchema.parse({ agent: "abcd1234" })).not.toThrow();
  });

  it("accepts a normal slug", () => {
    expect(() =>
      orraKillSchema.parse({ agent: "feat-auth-a1b2" }),
    ).not.toThrow();
  });
});

// orra_rebase: worktree field uses SafeWorktreeIdSchema — full path-traversal rejection.
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
