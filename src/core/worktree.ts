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

  async rebase(agentId: string): Promise<{ success: boolean; conflicts: string[] }> {
    const worktreePath = path.join(this.projectRoot, "worktrees", agentId);

    // Fetch latest main (may fail if no remote — that's OK)
    try {
      await execFileAsync("git", ["-C", this.projectRoot, "fetch", "origin", "main"], { timeout: 30000 });
    } catch {
      // Fetch may fail if no remote — continue with local main
    }

    // Attempt rebase
    try {
      const mainBranch = await this.getMainBranch();
      await execFileAsync("git", ["-C", worktreePath, "rebase", mainBranch]);
      return { success: true, conflicts: [] };
    } catch {
      // Rebase failed — check for conflicts
      const conflicts: string[] = [];
      try {
        const { stdout } = await execFileAsync("git", ["-C", worktreePath, "diff", "--name-only", "--diff-filter=U"]);
        conflicts.push(...stdout.trim().split("\n").filter(Boolean));
      } catch {}

      // Abort the failed rebase
      try {
        await execFileAsync("git", ["-C", worktreePath, "rebase", "--abort"]);
      } catch {}

      return { success: false, conflicts };
    }
  }

  private async getMainBranch(): Promise<string> {
    try {
      await execFileAsync("git", ["-C", this.projectRoot, "rev-parse", "--verify", "main"], { timeout: 3000 });
      return "main";
    } catch {}
    try {
      await execFileAsync("git", ["-C", this.projectRoot, "rev-parse", "--verify", "master"], { timeout: 3000 });
      return "master";
    } catch {}
    return "main";
  }
}
