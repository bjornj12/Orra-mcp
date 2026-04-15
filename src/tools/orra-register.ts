import { z } from "zod";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isSafeWorktreeId } from "../core/validation.js";

const execFileAsync = promisify(execFile);
const currentDir = path.dirname(fileURLToPath(import.meta.url));

// orra_register accepts either a worktree ID OR an absolute path, so we
// can't use SafeWorktreeIdSchema directly. Validate explicitly below.
export const orraRegisterSchema = z.object({
  worktree: z
    .string()
    .min(1)
    .refine(
      (v) => path.isAbsolute(v) || isSafeWorktreeId(v),
      {
        message:
          "Worktree must be an absolute path or a safe ID (alphanumerics, underscores, hyphens, 1-100 chars)",
      },
    )
    .describe("Worktree ID (directory name under worktrees/) or absolute path"),
});

export async function handleOrraRegister(
  projectRoot: string,
  args: z.infer<typeof orraRegisterSchema>,
) {
  // Always resolve against `git worktree list` so we never trust a raw
  // path or ID to end up in the filesystem. The final `worktreeId` is
  // derived from the real resolved path, and validated as a safe ID
  // before any file operations use it.
  const resolved = await resolveWorktree(projectRoot, args.worktree);
  if (!resolved) {
    return {
      content: [{
        type: "text" as const,
        text: `Error: Worktree "${args.worktree}" is not a registered git worktree. Run 'git worktree list' to see available worktrees.`,
      }],
      isError: true,
    };
  }
  const worktreePath = resolved;
  const worktreeId = path.basename(worktreePath);
  if (!isSafeWorktreeId(worktreeId)) {
    return {
      content: [{
        type: "text" as const,
        text: `Error: Worktree directory name "${worktreeId}" is not a safe identifier (must be alphanumerics, underscores, or hyphens).`,
      }],
      isError: true,
    };
  }

  // 1. Install hooks in the worktree's .claude/settings.local.json
  const hookScriptPath = path.join(currentDir, "..", "bin", "orra-hook.js");
  const claudeSettingsDir = path.join(worktreePath, ".claude");
  const settingsPath = path.join(claudeSettingsDir, "settings.local.json");

  await fsp.mkdir(claudeSettingsDir, { recursive: true });

  let existing: Record<string, unknown> = {};
  try {
    const raw = await fsp.readFile(settingsPath, "utf-8");
    existing = JSON.parse(raw);
  } catch {}

  const hookConfig = {
    hooks: {
      PermissionRequest: [{
        matcher: "",
        hooks: [{ type: "command", command: `node ${hookScriptPath}`, timeout: 300 }],
      }],
      Stop: [{
        matcher: "",
        hooks: [{ type: "command", command: `node ${hookScriptPath}`, timeout: 5 }],
      }],
    },
  };

  const merged = { ...existing, ...hookConfig };
  await fsp.writeFile(settingsPath, JSON.stringify(merged, null, 2));

  // 2. Write agent ID file so hooks can identify this agent
  const orraAgentsDir = path.join(worktreePath, ".orra", "agents");
  await fsp.mkdir(orraAgentsDir, { recursive: true });
  await fsp.writeFile(path.join(orraAgentsDir, "self.id"), worktreeId);

  // 3. Create initial agent state file in the main repo's .orra/
  const agentFile = path.join(projectRoot, ".orra", "agents", `${worktreeId}.json`);
  let branch = "";
  try {
    const { stdout } = await execFileAsync("git", ["-C", worktreePath, "rev-parse", "--abbrev-ref", "HEAD"]);
    branch = stdout.trim();
  } catch {}

  // Try to detect a running Claude process in the worktree
  let pid = 0;
  let status: "running" | "idle" = "idle";
  try {
    const { stdout } = await execFileAsync("pgrep", ["-f", `claude.*${worktreePath}`]);
    const pids = stdout.trim().split("\n").filter(Boolean);
    if (pids.length > 0) {
      pid = parseInt(pids[0], 10);
      status = "running";
    }
  } catch {}

  const now = new Date().toISOString();
  const agentState = {
    id: worktreeId,
    task: "",
    branch,
    worktree: worktreePath,
    pid,
    status,
    agentPersona: null,
    model: null,
    createdAt: now,
    updatedAt: now,
    exitCode: null,
    pendingQuestion: null,
  };

  await fsp.mkdir(path.join(projectRoot, ".orra", "agents"), { recursive: true });
  const tmpPath = agentFile + ".tmp";
  await fsp.writeFile(tmpPath, JSON.stringify(agentState, null, 2));
  await fsp.rename(tmpPath, agentFile);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        registered: true,
        worktreeId,
        worktreePath,
        branch,
        hooksInstalled: true,
        agentDetected: pid > 0,
      }, null, 2),
    }],
  };
}

async function resolveWorktree(projectRoot: string, input: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["worktree", "list", "--porcelain"], { cwd: projectRoot });
    const blocks = stdout.split("\n\n");
    for (const block of blocks) {
      const lines = block.trim().split("\n");
      const worktreeLine = lines.find(l => l.startsWith("worktree "));
      if (!worktreeLine) continue;
      const wtPath = worktreeLine.replace("worktree ", "");
      // Match by exact absolute path OR by basename (legacy ID form).
      if (path.isAbsolute(input)) {
        if (path.resolve(wtPath) === path.resolve(input)) {
          return wtPath;
        }
      } else if (path.basename(wtPath) === input) {
        return wtPath;
      }
    }
  } catch {}
  return null;
}
