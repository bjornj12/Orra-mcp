import * as crypto from "node:crypto";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { StateManager } from "./state.js";
import { WorktreeManager, slugify } from "./worktree.js";
import { ProcessManager, type ManagedProcess } from "./process.js";
import { StreamParser } from "./stream-parser.js";
import { Linker, expandTemplate } from "./linker.js";
import { parseAllowDeny } from "../bin/orra-hook.js";
import type { AgentState, Link, LinkTo, LinkTrigger } from "../types.js";

export interface SpawnAgentOptions {
  task: string;
  branch?: string;
  model?: string;
  allowedTools?: string[];
}

export interface SpawnResult {
  agentId: string;
  branch: string;
  worktree: string;
}

export interface StopResult {
  agentId: string;
  status: string;
  cleaned: boolean;
  warning?: string;
}

export interface LinkResult {
  linkId: string;
  from: string;
  on: LinkTrigger;
  status: string;
}

export class AgentManager {
  private state: StateManager;
  private worktrees: WorktreeManager;
  private processes: ProcessManager;
  private linker: Linker;
  private runningProcesses: Map<string, ManagedProcess> = new Map();
  private killedAgents: Set<string> = new Set();
  private pendingQuestions: Map<string, { tool: string; input: Record<string, unknown> }> = new Map();
  private logOffsets: Map<string, number> = new Map();
  private turnPreviews: Map<string, string> = new Map();

  constructor(private projectRoot: string) {
    this.state = new StateManager(projectRoot);
    this.worktrees = new WorktreeManager(projectRoot);
    this.processes = new ProcessManager();
    this.linker = new Linker();
  }

  async init(): Promise<void> {
    await this.state.init();
    const links = await this.state.loadLinks();
    this.linker.loadLinks(links);
    await this.state.reconcile();
  }

  async spawnAgent(options: SpawnAgentOptions): Promise<SpawnResult> {
    const shortId = crypto.randomBytes(2).toString("hex");
    const slug = slugify(options.task);
    const agentId = `${slug}-${shortId}`;

    const config = await this.state.loadConfig();

    // If custom spawn command is configured, use it instead of default worktree+claude
    if (config.spawnCommand) {
      return this.spawnWithCustomCommand(agentId, options, config.spawnCommand);
    }

    // Use existing worktree if branch already has one, otherwise create new
    let branch: string;
    let worktreePath: string;

    if (options.branch) {
      const existing = await this.worktrees.findByBranch(options.branch);
      if (existing) {
        branch = options.branch;
        worktreePath = existing.worktreePath;
      } else {
        const created = await this.worktrees.create(agentId, options.branch);
        branch = created.branch;
        worktreePath = created.worktreePath;
      }
    } else {
      const created = await this.worktrees.create(agentId);
      branch = created.branch;
      worktreePath = created.worktreePath;
    }

    // Write agent ID file so hooks can identify this agent
    try {
      const orraAgentsDir = path.join(worktreePath, ".orra", "agents");
      await fsp.mkdir(orraAgentsDir, { recursive: true });
      await fsp.writeFile(path.join(orraAgentsDir, "self.id"), agentId);
    } catch {
      // Non-fatal
    }

    // Install hooks in the worktree
    try {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const hookScriptPath = path.join(currentDir, "..", "bin", "orra-hook.js");
      const claudeSettingsDir = path.join(worktreePath, ".claude");
      await fsp.mkdir(claudeSettingsDir, { recursive: true });
      await fsp.writeFile(
        path.join(claudeSettingsDir, "settings.local.json"),
        JSON.stringify({
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
        }, null, 2)
      );
    } catch {
      // Hook installation is optional — don't fail the spawn
    }

    const now = new Date().toISOString();
    const agentState: AgentState = {
      id: agentId,
      type: "spawned",
      task: options.task,
      branch,
      worktree: worktreePath,
      pid: 0,
      status: "running",
      createdAt: now,
      updatedAt: now,
      exitCode: null,
      model: options.model ?? null,
      allowedTools: options.allowedTools ?? null,
    };

    const parser = new StreamParser((chunk) => {
      this.state.appendLog(agentId, chunk).catch(() => {});
    });

    const claudeArgs = this.buildClaudeArgs(options);

    const managed = this.processes.spawn({
      command: "claude",
      args: claudeArgs,
      cwd: worktreePath,
      onData: (data) => parser.feed(data),
      onExit: (exitCode) => this.handleAgentExit(agentId, exitCode),
      env: { ORRA_AGENT_ID: agentId },
    });

    // Write the task to stdin after spawn so claude starts in interactive mode
    managed.write(options.task + "\n");

    agentState.pid = managed.pid;
    await this.state.saveAgent(agentState);

    this.runningProcesses.set(agentId, managed);

    return {
      agentId,
      branch,
      worktree: worktreePath,
    };
  }

  private async spawnWithCustomCommand(
    agentId: string,
    options: SpawnAgentOptions,
    spawnCommand: string
  ): Promise<SpawnResult> {
    const branch = options.branch ?? `orra/${agentId}`;

    // Expand template variables in the spawn command
    const expandedCommand = spawnCommand
      .replace(/\{\{branch\}\}/g, branch)
      .replace(/\{\{task\}\}/g, options.task)
      .replace(/\{\{agentId\}\}/g, agentId);

    const now = new Date().toISOString();
    const agentState: AgentState = {
      id: agentId,
      type: "spawned",
      task: options.task,
      branch,
      worktree: "",
      pid: 0,
      status: "running",
      createdAt: now,
      updatedAt: now,
      exitCode: null,
      model: options.model ?? null,
      allowedTools: options.allowedTools ?? null,
    };

    const parser = new StreamParser((chunk) => {
      this.state.appendLog(agentId, chunk).catch(() => {});
    });

    // Split command into shell execution — the custom command handles
    // worktree creation, env setup, and starting claude
    const managed = this.processes.spawn({
      command: "/bin/sh",
      args: ["-c", expandedCommand],
      cwd: this.projectRoot,
      onData: (data) => parser.feed(data),
      onExit: (exitCode) => this.handleAgentExit(agentId, exitCode),
      env: { ORRA_AGENT_ID: agentId },
    });

    agentState.pid = managed.pid;
    await this.state.saveAgent(agentState);

    this.runningProcesses.set(agentId, managed);

    return { agentId, branch, worktree: "" };
  }

  async listAgents(): Promise<AgentState[]> {
    await this.state.reconcile();
    return this.state.listAgents();
  }

  async getAgentStatus(
    agentId: string
  ): Promise<{ agent: AgentState; recentOutput: string } | null> {
    const agent = await this.state.loadAgent(agentId);
    if (!agent) return null;

    const recentOutput = await this.state.readLog(agentId, 50);
    return { agent, recentOutput };
  }

  async getAgentOutput(
    agentId: string,
    tail?: number
  ): Promise<string | null> {
    const agent = await this.state.loadAgent(agentId);
    if (!agent) return null;
    return this.state.readLog(agentId, tail);
  }

  async stopAgent(agentId: string, cleanup = false): Promise<StopResult> {
    const agent = await this.state.loadAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    this.killedAgents.add(agentId);

    const proc = this.runningProcesses.get(agentId);
    if (proc && agent.status === "running") {
      proc.kill("SIGTERM");

      // Wait up to 5s for graceful shutdown, then force kill
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {
            // Process may already be dead
          }
          resolve();
        }, 5000);

        const checkInterval = setInterval(() => {
          if (!this.runningProcesses.has(agentId)) {
            clearTimeout(timeout);
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
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

  getTurnPreview(agentId: string): string | null {
    return this.turnPreviews.get(agentId) ?? null;
  }

  getPendingQuestion(agentId: string): { tool: string; input: Record<string, unknown> } | null {
    const pending = this.pendingQuestions.get(agentId);
    if (!pending) return null;
    return { tool: pending.tool, input: pending.input };
  }

  async sendMessage(agentId: string, message: string): Promise<void> {
    const agent = await this.state.loadAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    // Handle waiting agent (pending permission question)
    if (agent.status === "waiting") {
      const pending = this.pendingQuestions.get(agentId);
      if (!pending) throw new Error(`Agent ${agentId} has no pending question`);

      const allow = parseAllowDeny(message);

      // Write answer file for the hook to pick up
      const answerPath = path.join(this.projectRoot, ".orra", "agents", `${agentId}.answer.json`);
      const tmpPath = answerPath + ".tmp";
      await fsp.writeFile(tmpPath, JSON.stringify({ allow, reason: allow ? undefined : message }));
      await fsp.rename(tmpPath, answerPath);

      this.pendingQuestions.delete(agentId);

      agent.status = "running";
      agent.updatedAt = new Date().toISOString();
      await this.state.saveAgent(agent);
      return;
    }

    // Handle idle agent (finished a turn, needs follow-up input)
    if (agent.status === "idle") {
      agent.status = "running";
      agent.updatedAt = new Date().toISOString();
      await this.state.saveAgent(agent);
      // Fall through to send the message normally
    }

    if (agent.status !== "running")
      throw new Error(`Agent ${agentId} is not running (status: ${agent.status})`);

    const proc = this.runningProcesses.get(agentId);
    if (!proc) throw new Error(`Agent ${agentId} has no active process`);
    proc.write(message + "\n");
  }

  async linkAgents(
    from: string,
    to: LinkTo,
    on: LinkTrigger
  ): Promise<LinkResult> {
    const fromAgent = await this.state.loadAgent(from);
    if (!fromAgent) throw new Error(`Agent ${from} not found`);

    const link = this.linker.createLink(from, to, on);
    await this.state.saveLinks(this.linker.getAllLinks());

    // Check if the agent already completed and the condition matches
    if (fromAgent.status === "completed" || fromAgent.status === "failed") {
      const exitCode =
        fromAgent.exitCode ?? (fromAgent.status === "completed" ? 0 : 1);
      const matches = this.linker.findMatchingLinks(from, exitCode);
      if (matches.some((m) => m.id === link.id)) {
        await this.fireLink(link, fromAgent);
        return { linkId: link.id, from, on, status: "fired" };
      }
    }

    return { linkId: link.id, from, on, status: "pending" };
  }

  private buildClaudeArgs(options: SpawnAgentOptions): string[] {
    // Interactive mode — no flags that would make claude non-interactive.
    // The task is written to stdin after spawn so claude runs as a full
    // interactive session, enabling send_message to inject further input.
    const args: string[] = [];

    if (options.model) {
      args.push("--model", options.model);
    }

    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push("--allowedTools", options.allowedTools.join(","));
    }

    return args;
  }

  private async handleAgentExit(
    agentId: string,
    exitCode: number
  ): Promise<void> {
    this.runningProcesses.delete(agentId);

    // If agent was intentionally killed, let stopAgent handle the state update.
    // Don't evaluate links for killed agents.
    if (this.killedAgents.has(agentId)) {
      return;
    }

    const agent = await this.state.loadAgent(agentId);
    if (!agent) return;

    agent.status = exitCode === 0 ? "completed" : "failed";
    agent.exitCode = exitCode;
    agent.updatedAt = new Date().toISOString();
    await this.state.saveAgent(agent);

    // Check for matching links
    const matchingLinks = this.linker.findMatchingLinks(agentId, exitCode);
    this.linker.evaluateAndExpire(agentId, exitCode);
    await this.state.saveLinks(this.linker.getAllLinks());

    for (const link of matchingLinks) {
      await this.fireLink(link, agent);
    }
  }

  async shutdown(): Promise<void> {
    // No-op for now
  }

  private async fireLink(link: Link, fromAgent: AgentState): Promise<void> {
    const expandedTask = expandTemplate(link.to.task, fromAgent);
    const expandedBranch = link.to.branch
      ? expandTemplate(link.to.branch, fromAgent)
      : undefined;

    try {
      const result = await this.spawnAgent({
        task: expandedTask,
        branch: expandedBranch,
        model: link.to.model,
      });
      this.linker.markFired(link.id, result.agentId);
      await this.state.saveLinks(this.linker.getAllLinks());
    } catch (err) {
      // Log but don't throw — the link failing shouldn't crash the exit handler
      console.error(`Failed to fire link ${link.id}:`, err);
    }
  }
}
