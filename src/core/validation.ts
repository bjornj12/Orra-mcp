import { z } from "zod";

/**
 * Worktree IDs become filesystem paths inside `.orra/agents/<id>.json`,
 * `.orra/agents/<id>.log`, and `.orra/agents/<id>.answer.json`. Without
 * validation, a prompt-injected tool call like
 *   orra_unblock({ worktree: "../../home/user/.bashrc", ... })
 * would escape the state directory.
 *
 * Safe IDs must:
 *   - start with an alphanumeric character
 *   - contain only alphanumerics, underscores, and hyphens
 *   - be 1–100 characters long (reasonable upper bound, no empty strings)
 *
 * This matches the format produced by `slugify` in `core/worktree.ts`
 * plus the `-<4-char-suffix>` appended by `agent-manager.randomSuffix`,
 * so no legitimate Orra-generated ID is rejected.
 */
const WORKTREE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;

export function isSafeWorktreeId(value: string): boolean {
  return WORKTREE_ID_PATTERN.test(value);
}

export const SafeWorktreeIdSchema = z
  .string()
  .refine(isSafeWorktreeId, {
    message:
      "Worktree ID must be 1–100 characters, start with alphanumeric, and contain only letters, digits, underscores, and hyphens",
  });

/**
 * Branch names flow into `gh pr close <branch>` and similar subprocess
 * calls. Even though `execFile` prevents shell injection, a branch name
 * starting with `--` can be interpreted as a CLI flag. Always pass branch
 * names after a `--` positional separator when calling gh/git, AND validate
 * the stored value looks like a legitimate git ref.
 *
 * Git ref rules are complex (see `git check-ref-format`); this pattern
 * covers the safe subset: alphanumerics, underscore, hyphen, slash, dot,
 * must not start with `-` or `.`, must not contain `..`.
 */
const BRANCH_NAME_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9_/.-]*$/;

export function isSafeBranchName(value: string): boolean {
  if (!BRANCH_NAME_PATTERN.test(value)) return false;
  if (value.includes("..")) return false;
  if (value.endsWith(".") || value.endsWith("/")) return false;
  return true;
}
