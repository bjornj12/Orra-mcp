#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

// --- Exported helpers for testing ---

export function resolveAgentId(env: Record<string, string | undefined>, projectRoot: string): string | null {
  if (env.ORRA_AGENT_ID) return env.ORRA_AGENT_ID;

  const selfIdPath = path.join(projectRoot, ".orra", "agents", "self.id");
  try {
    return fs.readFileSync(selfIdPath, "utf-8").trim();
  } catch {
    return null;
  }
}

export function buildPermissionResponse(allow: boolean): object {
  return {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: { behavior: allow ? "allow" : "deny" },
    },
  };
}

export function parseAllowDeny(input: string): boolean {
  const lower = input.trim().toLowerCase();
  return ["yes", "y", "allow", "approve", "ok"].includes(lower);
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

function ensureAgentFile(projectRoot: string, agentId: string): void {
  const agentFile = path.join(projectRoot, ".orra", "agents", `${agentId}.json`);
  if (fs.existsSync(agentFile)) return;

  // Auto-create agent state file on first hook fire
  const agentsDir = path.join(projectRoot, ".orra", "agents");
  fs.mkdirSync(agentsDir, { recursive: true });
  const now = new Date().toISOString();
  const state = {
    id: agentId,
    task: "",
    branch: "",
    worktree: "",
    pid: process.ppid || 0,
    status: "running",
    agentPersona: null,
    model: null,
    createdAt: now,
    updatedAt: now,
    exitCode: null,
    pendingQuestion: null,
  };
  fs.writeFileSync(agentFile, JSON.stringify(state, null, 2));
}

export async function writeQuestion(
  projectRoot: string, agentId: string, tool: string, input: Record<string, unknown>
): Promise<void> {
  ensureAgentFile(projectRoot, agentId);
  const agentFile = path.join(projectRoot, ".orra", "agents", `${agentId}.json`);
  const data = JSON.parse(fs.readFileSync(agentFile, "utf-8"));
  data.status = "waiting";
  data.updatedAt = new Date().toISOString();
  data.pendingQuestion = { tool, input };
  // Atomic write
  const tmpFile = agentFile + ".tmp";
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  fs.renameSync(tmpFile, agentFile);
}

export async function pollForAnswer(
  projectRoot: string, agentId: string, timeoutMs = 300000, intervalMs = 100
): Promise<{ allow: boolean; reason?: string }> {
  const answerPath = path.join(projectRoot, ".orra", "agents", `${agentId}.answer.json`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const data = fs.readFileSync(answerPath, "utf-8");
      const answer = JSON.parse(data);
      try { fs.unlinkSync(answerPath); } catch {}
      return { allow: !!answer.allow, reason: answer.reason };
    } catch {
      // File doesn't exist yet
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return { allow: false }; // Timeout → deny
}

export async function writeTurnComplete(projectRoot: string, agentId: string): Promise<void> {
  ensureAgentFile(projectRoot, agentId);
  const agentFile = path.join(projectRoot, ".orra", "agents", `${agentId}.json`);
  try {
    const data = JSON.parse(fs.readFileSync(agentFile, "utf-8"));
    data.status = "idle";
    data.updatedAt = new Date().toISOString();
    data.pendingQuestion = null;
    const tmpFile = agentFile + ".tmp";
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
    fs.renameSync(tmpFile, agentFile);
  } catch {}
}

async function handlePermissionRequest(
  agentId: string,
  projectRoot: string,
  hookInput: Record<string, unknown>
): Promise<void> {
  const toolName = (hookInput.tool_name as string) ?? "unknown";
  const toolInput = (hookInput.tool_input as Record<string, unknown>) ?? {};

  try {
    await writeQuestion(projectRoot, agentId, toolName, toolInput);
  } catch {
    process.exit(1);
  }

  const answer = await pollForAnswer(projectRoot, agentId, 300000, 100);

  if (answer.allow) {
    console.log(JSON.stringify(buildPermissionResponse(true)));
    process.exit(0);
  } else {
    const reason = answer.reason ?? "Denied by orchestrator";
    console.error(reason);
    process.exit(2);
  }
}

async function handleStop(agentId: string, projectRoot: string): Promise<void> {
  await writeTurnComplete(projectRoot, agentId);
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
    process.exit(1);
  }

  switch (hookEvent) {
    case "PermissionRequest":
      await handlePermissionRequest(agentId!, projectRoot, hookInput);
      break;
    case "Stop":
      await handleStop(agentId!, projectRoot);
      break;
    default:
      process.exit(0);
  }
}

const isMainModule = process.argv[1]?.endsWith("orra-hook.js") || process.argv[1]?.endsWith("orra-hook.ts");
if (isMainModule) {
  main().catch(() => process.exit(1));
}
