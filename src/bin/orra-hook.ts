#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { isSafeWorktreeId } from "../core/validation.js";

// --- Exported helpers for testing ---

export function resolveAgentId(env: Record<string, string | undefined>, projectRoot: string): string | null {
  const raw = env.ORRA_AGENT_ID ?? (() => {
    const selfIdPath = path.join(projectRoot, ".orra", "agents", "self.id");
    try {
      return fs.readFileSync(selfIdPath, "utf-8").trim();
    } catch {
      return null;
    }
  })();

  // Defense-in-depth: the agent ID flows into filesystem paths.
  // Reject anything that doesn't look like a safe ID.
  if (!raw || !isSafeWorktreeId(raw)) return null;
  return raw;
}

// --- Main hook logic ---

function findProjectRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    dir = path.dirname(dir);
  }
  return startDir;
}

function findMainRepoRoot(worktreeRoot: string): string {
  // In a worktree, .git is a file containing "gitdir: /path/to/main/.git/worktrees/name"
  // In the main repo, .git is a directory
  const gitPath = path.join(worktreeRoot, ".git");
  try {
    const stat = fs.statSync(gitPath);
    if (stat.isDirectory()) {
      return worktreeRoot; // Already in main repo
    }
    // It's a file — parse the gitdir path to find main repo
    const content = fs.readFileSync(gitPath, "utf-8").trim();
    // Format: "gitdir: /path/to/main-repo/.git/worktrees/worktree-name"
    const match = content.match(/^gitdir:\s*(.+)$/);
    if (match) {
      const gitdir = match[1];
      // Walk up from .git/worktrees/name to .git to repo root
      const dotGit = path.resolve(worktreeRoot, gitdir, "..", "..");
      return path.dirname(dotGit);
    }
  } catch {}
  return worktreeRoot;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function resolveStateDir(env: Record<string, string | undefined>, worktreeRoot: string): string {
  if (env.ORRA_STATE_DIR) return env.ORRA_STATE_DIR;
  const mainRoot = findMainRepoRoot(worktreeRoot);
  return path.join(mainRoot, ".orra");
}

async function handleStop(_agentId: string, _projectRoot: string): Promise<void> {
  // Stop hook: signal that the session ended. Previously wrote idle status to
  // the agent file, but agent lifecycle state is now owned by the daemon.
  // Nothing to do here; exit cleanly.
  process.exit(0);
}

async function main(): Promise<void> {
  const input = await readStdin();
  let hookInput: Record<string, unknown>;
  try {
    hookInput = JSON.parse(input);
  } catch {
    process.exit(1);
    return;
  }

  const hookEvent = hookInput.hook_event_name as string;
  const cwd = (hookInput.cwd as string) ?? process.cwd();
  const worktreeRoot = findProjectRoot(cwd);
  const stateDir = resolveStateDir(process.env, worktreeRoot);
  const projectRoot = path.dirname(stateDir);
  const agentId = resolveAgentId(process.env, worktreeRoot);

  if (!agentId) {
    // No agent ID = not a tracked worktree (e.g., main repo orchestrator session). Exit silently.
    process.exit(0);
  }

  switch (hookEvent) {
    case "Stop":
      await handleStop(agentId, projectRoot);
      break;
    default:
      // PermissionRequest and other hook events are no longer handled here.
      // Use `claude attach <shortId>` to interact with a waiting agent.
      process.exit(0);
  }
}

const isMainModule = process.argv[1]?.endsWith("orra-hook.js") || process.argv[1]?.endsWith("orra-hook.ts");
if (isMainModule) {
  main().catch(() => process.exit(1));
}
