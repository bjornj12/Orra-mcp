import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { StateManager } from "./state.js";
import { WorktreeManager } from "./worktree.js";
import type { AgentState } from "../types.js";

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
