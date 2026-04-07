import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export class WorktreeManager {
  constructor(private projectRoot: string) {}

  async create(
    agentId: string,
    customBranch?: string
  ): Promise<{ branch: string; worktreePath: string }> {
    const branch = customBranch ?? `orra/${agentId}`;
    const worktreePath = path.join(this.projectRoot, "worktrees", agentId);

    await execFileAsync("git", ["worktree", "add", worktreePath, "-b", branch], {
      cwd: this.projectRoot,
    });

    return { branch, worktreePath };
  }

  async remove(agentId: string, branch?: string): Promise<{ branchDeleted: boolean; warning?: string }> {
    const worktreePath = path.join(this.projectRoot, "worktrees", agentId);
    await execFileAsync("git", ["worktree", "remove", worktreePath, "--force"], {
      cwd: this.projectRoot,
    });

    if (!branch) {
      return { branchDeleted: false };
    }

    // Try to delete the branch (git branch -d only works if merged)
    try {
      await execFileAsync("git", ["branch", "-d", branch], {
        cwd: this.projectRoot,
      });
      return { branchDeleted: true };
    } catch {
      return {
        branchDeleted: false,
        warning: `Branch ${branch} was not deleted (not fully merged). Use 'git branch -D ${branch}' to force delete.`,
      };
    }
  }

  async findByBranch(branch: string): Promise<{ worktreePath: string } | null> {
    try {
      const { stdout } = await execFileAsync("git", ["worktree", "list", "--porcelain"], {
        cwd: this.projectRoot,
      });

      const worktrees = stdout.split("\n\n");
      for (const wt of worktrees) {
        const lines = wt.trim().split("\n");
        const worktreeLine = lines.find((l) => l.startsWith("worktree "));
        const branchLine = lines.find((l) => l.startsWith("branch "));
        if (worktreeLine && branchLine) {
          const wtPath = worktreeLine.replace("worktree ", "");
          const wtBranch = branchLine.replace("branch refs/heads/", "");
          if (wtBranch === branch) {
            return { worktreePath: wtPath };
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async isBranchMerged(branch: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["branch", "--merged", "HEAD"],
        { cwd: this.projectRoot }
      );
      return stdout.split("\n").some((line) => line.trim() === branch);
    } catch {
      return false;
    }
  }
}
