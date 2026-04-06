import * as crypto from "node:crypto";
import { StateManager } from "./state.js";
import { WorktreeManager, slugify } from "./worktree.js";
import { ProcessManager, type ManagedProcess } from "./process.js";
import { StreamParser } from "./stream-parser.js";
import { Linker, expandTemplate } from "./linker.js";
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

    const { branch, worktreePath } = await this.worktrees.create(
      agentId,
      options.branch
    );

    const now = new Date().toISOString();
    const agentState: AgentState = {
      id: agentId,
      task: options.task,
      branch,
      worktree: `worktrees/${agentId}`,
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

    // Interactive mode — no --print. The agent runs as a full interactive session
    // in a PTY, enabling send_message to inject input via stdin.
    const claudeArgs = this.buildClaudeArgs(options);

    const managed = this.processes.spawn({
      command: "claude",
      args: [...claudeArgs, options.task], // -p flag is last in claudeArgs, task follows it
      cwd: worktreePath,
      onData: (data) => parser.feed(data),
      onExit: (exitCode) => this.handleAgentExit(agentId, exitCode),
    });

    agentState.pid = managed.pid;
    await this.state.saveAgent(agentState);

    this.runningProcesses.set(agentId, managed);

    return {
      agentId,
      branch,
      worktree: `worktrees/${agentId}`,
    };
  }

  async listAgents(): Promise<AgentState[]> {
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
    if (cleanup) {
      try {
        await this.worktrees.remove(agentId);
        cleaned = true;
      } catch {
        // Worktree removal may fail if branch not merged
      }
    }

    return { agentId, status: "killed", cleaned };
  }

  async sendMessage(agentId: string, message: string): Promise<void> {
    const agent = await this.state.loadAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    if (agent.status !== "running")
      throw new Error(
        `Agent ${agentId} is not running (status: ${agent.status})`
      );

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
    // Interactive mode — no --print. The agent runs as a full interactive session
    // in a PTY, enabling send_message to inject input via stdin.
    const args: string[] = [];

    if (options.model) {
      args.push("--model", options.model);
    }

    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push("--allowedTools", options.allowedTools.join(","));
    }

    // Pass the task as -p (initial prompt) so claude starts working immediately
    args.push("-p");

    return args;
  }

  private async handleAgentExit(
    agentId: string,
    exitCode: number
  ): Promise<void> {
    this.runningProcesses.delete(agentId);

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
