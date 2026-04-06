import * as fs from "node:fs/promises";
import * as path from "node:path";
import { AgentStateSchema, ConfigSchema, LinkSchema, type AgentState, type Config, type Link } from "../types.js";

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
  private configPath: string;
  private linksPath: string;

  constructor(private projectRoot: string) {
    this.orraDir = path.join(projectRoot, ".orra");
    this.agentsDir = path.join(this.orraDir, "agents");
    this.configPath = path.join(this.orraDir, "config.json");
    this.linksPath = path.join(this.orraDir, "links.json");
  }

  async init(): Promise<void> {
    await fs.mkdir(this.agentsDir, { recursive: true });

    try {
      await fs.access(this.configPath);
    } catch {
      await fs.writeFile(
        this.configPath,
        JSON.stringify({ defaultModel: null, defaultAllowedTools: null }, null, 2)
      );
    }

    try {
      await fs.access(this.linksPath);
    } catch {
      await fs.writeFile(this.linksPath, JSON.stringify([], null, 2));
    }
  }

  async saveAgent(agent: AgentState): Promise<void> {
    const filePath = path.join(this.agentsDir, `${agent.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(agent, null, 2));
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

  async saveLinks(links: Link[]): Promise<void> {
    await fs.writeFile(this.linksPath, JSON.stringify(links, null, 2));
  }

  async loadLinks(): Promise<Link[]> {
    try {
      const data = await fs.readFile(this.linksPath, "utf-8");
      const parsed = JSON.parse(data);
      return (parsed as unknown[]).map((l: unknown) => LinkSchema.parse(l));
    } catch {
      return [];
    }
  }

  async loadConfig(): Promise<Config> {
    try {
      const data = await fs.readFile(this.configPath, "utf-8");
      return ConfigSchema.parse(JSON.parse(data));
    } catch {
      return { defaultModel: null, defaultAllowedTools: null };
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
