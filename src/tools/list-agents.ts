import type { AgentManager } from "../core/agent-manager.js";

export async function handleListAgents(manager: AgentManager) {
  const agents = await manager.listAgents();
  const summary = agents.map((a) => ({
    id: a.id,
    task: a.task,
    branch: a.branch,
    status: a.status,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));

  return {
    content: [
      {
        type: "text" as const,
        text:
          agents.length === 0
            ? "No agents found."
            : JSON.stringify(summary, null, 2),
      },
    ],
  };
}
