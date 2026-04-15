import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { open } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { StateManager } from "./state.js";
import { WorktreeManager } from "./worktree.js";
import { slugify } from "./worktree.js";
import { DEFAULT_HEADLESS_ALLOWED_TOOLS, ConcurrencyLimitError } from "./spawn-defaults.js";
import { loadConfig } from "./config.js";
import { isSafeWorktreeId } from "./validation.js";
import type { AgentState } from "../types.js";

const execFileAsync = promisify(execFile);

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

export interface SpawnOpts {
  task: string;
  reason: string;
  worktreeId?: string;
  branch?: string;
  allowedTools?: string[];
  model?: string;
  // Test-only escape hatch — when present, used instead of [claude, --print, ...].
  // Production callers should never pass this.
  _spawnCommand?: string[];
}

export interface SpawnResult {
  agentId: string;
  worktreePath: string;
  branch: string;
  pid: number;
  logPath: string;
}

export interface StopResult {
  agentId: string;
  status: string;
  cleaned: boolean;
  warning?: string;
}

export class AgentManager {
  private state: StateManager;
  private worktrees: WorktreeManager;

  constructor(private projectRoot: string) {
    this.state = new StateManager(projectRoot);
    this.worktrees = new WorktreeManager(projectRoot);
  }

  async init(): Promise<void> {
    await this.state.init();
    await this.state.reconcile();
  }

  async getAgent(agentId: string): Promise<AgentState | null> {
    return this.state.loadAgent(agentId);
  }

  async spawnAgent(opts: SpawnOpts): Promise<SpawnResult> {
    // 0. Concurrency check
    const config = await loadConfig(this.projectRoot);
    const limit = config.headlessSpawnConcurrency;
    const allAgents = await this.state.listAgents();
    const runningHeadless = allAgents.filter(
      (a) => a.agentPersona === "headless-spawn" && a.status === "running"
    ).length;
    if (runningHeadless >= limit) {
      throw new ConcurrencyLimitError(runningHeadless, limit);
    }

    // 1. Generate agent ID
    const slug = slugify(opts.task) || "headless";
    const agentId = `${slug}-${randomSuffix()}`;

    // 2. Resolve worktree
    let worktreePath: string;
    let branch: string;
    if (opts.worktreeId) {
      // Look up the worktree path via git worktree list
      const { stdout } = await execFileAsync("git", ["worktree", "list", "--porcelain"], {
        cwd: this.projectRoot,
      });
      let resolvedPath: string | null = null;
      let resolvedBranch: string | null = null;
      for (const block of stdout.split("\n\n")) {
        const lines = block.trim().split("\n");
        const pathLine = lines.find((l) => l.startsWith("worktree "));
        const branchLine = lines.find((l) => l.startsWith("branch "));
        if (pathLine && branchLine) {
          const wtPath = pathLine.replace("worktree ", "").trim();
          if (path.basename(wtPath) === opts.worktreeId) {
            resolvedPath = wtPath;
            resolvedBranch = branchLine.replace("branch refs/heads/", "").trim();
            break;
          }
        }
      }
      if (!resolvedPath || !resolvedBranch) {
        throw new Error(`Worktree not found: ${opts.worktreeId}`);
      }
      worktreePath = resolvedPath;
      branch = resolvedBranch;
    } else {
      const created = await this.worktrees.create(agentId, opts.branch);
      worktreePath = created.worktreePath;
      branch = created.branch;
    }

    // 3. Open log file
    const logPath = path.join(this.projectRoot, ".orra", "agents", `${agentId}.log`);
    const logHandle = await open(logPath, "w");
    const logFd = logHandle.fd;

    // 4. Build command (config already loaded above for the concurrency check)
    const allowedTools = opts.allowedTools ?? DEFAULT_HEADLESS_ALLOWED_TOOLS;
    const model = opts.model ?? config.defaultModel ?? null;

    let argv: string[];
    if (opts._spawnCommand) {
      argv = opts._spawnCommand;
    } else {
      const claudeArgs: string[] = [
        "--print",
        "--allowed-tools", allowedTools.join(","),
      ];
      if (model) claudeArgs.push("--model", model);
      claudeArgs.push(opts.task);
      argv = ["claude", ...claudeArgs];
    }

    // 5. Spawn detached
    const child = spawn(argv[0], argv.slice(1), {
      cwd: worktreePath,
      stdio: ["ignore", logFd, logFd],
      detached: true,
      env: { ...process.env, ORRA_AGENT_ID: agentId },
    });

    // Close our handle to the log fd — the child holds its own.
    await logHandle.close();

    if (!child.pid) {
      throw new Error(`Failed to spawn process: ${argv.join(" ")}`);
    }

    // 6. Write initial state
    const now = new Date().toISOString();
    const state: AgentState = {
      id: agentId,
      task: opts.task,
      branch,
      worktree: worktreePath,
      pid: child.pid,
      status: "running",
      agentPersona: "headless-spawn",
      model,
      createdAt: now,
      updatedAt: now,
      exitCode: null,
      pendingQuestion: null,
    };
    await this.state.saveAgent(state);

    // 7. Register exit handler
    child.on("exit", async (code) => {
      try {
        const current = await this.state.loadAgent(agentId);
        if (!current) return;
        current.status = code === 0 ? "completed" : "failed";
        current.exitCode = code;
        current.updatedAt = new Date().toISOString();
        await this.state.saveAgent(current);
      } catch {
        // Best-effort: if state write fails, the reconciler will catch it later.
      }
    });

    // 8. Detach so the MCP server can exit independently
    child.unref();

    return {
      agentId,
      worktreePath,
      branch,
      pid: child.pid,
      logPath,
    };
  }

  async stopAgent(agentId: string, cleanup = false): Promise<StopResult> {
    const agent = await this.state.loadAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    // Send SIGTERM to the tracked PID if we have one and it's alive
    if (agent.pid > 0 && agent.status === "running") {
      try {
        process.kill(agent.pid, "SIGTERM");
      } catch {
        // Process may already be dead
      }
    }

    agent.status = "killed";
    agent.updatedAt = new Date().toISOString();
    await this.state.saveAgent(agent);

    let cleaned = false;
    let warning: string | undefined;
    if (cleanup) {
      try {
        const result = await this.worktrees.remove(agentId, agent.branch);
        cleaned = true;
        warning = result.warning;
      } catch {
        // Worktree removal may fail
      }
    }

    return { agentId, status: "killed", cleaned, warning };
  }

  async unblock(
    agentId: string,
    allow: boolean,
    reason?: string,
  ): Promise<void> {
    if (!isSafeWorktreeId(agentId)) {
      throw new Error(`Invalid agent ID: ${agentId}`);
    }
    const agent = await this.state.loadAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const answerPath = path.join(
      this.projectRoot,
      ".orra",
      "agents",
      `${agentId}.answer.json`,
    );
    const tmpPath = answerPath + ".tmp";
    await fsp.writeFile(tmpPath, JSON.stringify({ allow, reason }));
    await fsp.rename(tmpPath, answerPath);
  }

  async shutdown(): Promise<void> {
    // No-op
  }
}
