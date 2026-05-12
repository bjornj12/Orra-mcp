import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import { parseWorktreeList } from "../core/awareness.js";
import { SafeWorktreeIdSchema } from "../core/validation.js";
import { ok, fail, toMcpContent } from "../core/envelope.js";

const execFileAsync = promisify(execFile);

export const orraRebaseSchema = z.object({
  worktree: SafeWorktreeIdSchema.describe("Worktree ID (basename of worktree path)"),
});

/**
 * Resolve the full path of a worktree by its id (basename) using
 * `git worktree list --porcelain`.
 */
async function resolveWorktreePath(
  projectRoot: string,
  worktreeId: string,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["worktree", "list", "--porcelain"],
      { cwd: projectRoot },
    );
    const worktrees = parseWorktreeList(stdout);
    const match = worktrees.find(
      (wt) => path.basename(wt.path) === worktreeId || wt.path === worktreeId,
    );
    return match?.path ?? null;
  } catch {
    return null;
  }
}

async function getMainBranch(repoPath: string): Promise<string> {
  try {
    await execFileAsync("git", ["-C", repoPath, "rev-parse", "--verify", "main"], { timeout: 3_000 });
    return "main";
  } catch {}
  try {
    await execFileAsync("git", ["-C", repoPath, "rev-parse", "--verify", "master"], { timeout: 3_000 });
    return "master";
  } catch {}
  return "main";
}

export async function handleOrraRebase(
  projectRoot: string,
  args: z.infer<typeof orraRebaseSchema>,
) {
  try {
    const worktreePath = await resolveWorktreePath(projectRoot, args.worktree);
    if (!worktreePath) {
      return toMcpContent(fail(`worktree not found: ${args.worktree}`));
    }

    // Fetch latest from remote (best-effort — may fail without a remote)
    try {
      await execFileAsync("git", ["-C", projectRoot, "fetch"], { timeout: 30_000 });
    } catch {
      // No remote or no network — continue with local main
    }

    const mainBranch = await getMainBranch(projectRoot);

    // Attempt rebase
    try {
      await execFileAsync("git", ["-C", worktreePath, "rebase", mainBranch]);
      return toMcpContent(ok({ rebased: true, worktree: args.worktree }));
    } catch {
      // Rebase failed — collect conflict files before aborting
      const conflictFiles: string[] = [];
      try {
        const { stdout } = await execFileAsync("git", [
          "-C",
          worktreePath,
          "diff",
          "--name-only",
          "--diff-filter=U",
        ]);
        conflictFiles.push(...stdout.trim().split("\n").filter(Boolean));
      } catch {}

      // Abort the failed rebase to leave the worktree clean
      try {
        await execFileAsync("git", ["-C", worktreePath, "rebase", "--abort"]);
      } catch {}

      return toMcpContent(
        fail(`rebase conflict in ${args.worktree}`, {
          code: "rebase_conflict",
          conflictFiles,
        }),
      );
    }
  } catch (err) {
    return toMcpContent(fail(err instanceof Error ? err.message : String(err)));
  }
}
