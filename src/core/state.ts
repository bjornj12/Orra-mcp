import * as fs from "node:fs/promises";
import * as path from "node:path";
import { AgentStateSchema, type AgentState } from "../types.js";

function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class StateManager {
  private orraDir: string;
  private agentsDir: string;

  constructor(private projectRoot: string) {
    this.orraDir = path.join(projectRoot, ".orra");
    this.agentsDir = path.join(this.orraDir, "agents");
  }

  async init(): Promise<void> {
    await fs.mkdir(this.agentsDir, { recursive: true });
  }

  async saveAgent(agent: AgentState): Promise<void> {
    const filePath = path.join(this.agentsDir, `${agent.id}.json`);
    const tmpPath = filePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(agent, null, 2));
    await fs.rename(tmpPath, filePath);
  }

  async loadAgent(id: string): Promise<AgentState | null> {
    const filePath = path.join(this.agentsDir, `${id}.json`);
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return AgentStateSchema.parse(JSON.parse(data));
    } catch {
      return null;
    }
  }

  async listAgents(): Promise<AgentState[]> {
    try {
      const files = await fs.readdir(this.agentsDir);
      const jsonFiles = files.filter((f: string) => f.endsWith(".json"));
      const agents: AgentState[] = [];
      for (const file of jsonFiles) {
        const data = await fs.readFile(path.join(this.agentsDir, file), "utf-8");
        agents.push(AgentStateSchema.parse(JSON.parse(data)));
      }
      return agents;
    } catch {
      return [];
    }
  }

  async appendLog(id: string, content: string): Promise<void> {
    const filePath = path.join(this.agentsDir, `${id}.log`);
    await fs.appendFile(filePath, content);
  }

  async readLog(id: string, tail?: number): Promise<string> {
    const filePath = path.join(this.agentsDir, `${id}.log`);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      if (tail === undefined) {
        return content;
      }
      const lines = content.split("\n").filter((l) => l.length > 0);
      return lines.slice(-tail).join("\n");
    } catch {
      return "";
    }
  }

  async readLogRange(id: string, offset: number): Promise<{ content: string; newOffset: number }> {
    const filePath = path.join(this.agentsDir, `${id}.log`);
    try {
      const stat = await fs.stat(filePath);
      const fileSize = stat.size;
      if (offset >= fileSize) {
        return { content: "", newOffset: offset };
      }
      const handle = await fs.open(filePath, "r");
      try {
        const buffer = Buffer.alloc(fileSize - offset);
        await handle.read(buffer, 0, buffer.length, offset);
        return { content: buffer.toString("utf-8"), newOffset: fileSize };
      } finally {
        await handle.close();
      }
    } catch {
      return { content: "", newOffset: 0 };
    }
  }

  async reconcile(): Promise<void> {
    const agents = await this.listAgents();
    for (const agent of agents) {
      if (agent.status === "running" && !pidIsAlive(agent.pid)) {
        agent.status = "interrupted";
        agent.updatedAt = new Date().toISOString();
        await this.saveAgent(agent);
      }
    }
  }
}
