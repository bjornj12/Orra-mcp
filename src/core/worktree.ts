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

  async remove(agentId: string): Promise<void> {
    const worktreePath = path.join(this.projectRoot, "worktrees", agentId);
    await execFileAsync("git", ["worktree", "remove", worktreePath, "--force"], {
      cwd: this.projectRoot,
    });
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
