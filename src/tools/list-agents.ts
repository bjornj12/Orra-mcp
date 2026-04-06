import type { AgentManager } from "../core/agent-manager.js";

export async function handleListAgents(manager: AgentManager) {
  const agents = await manager.listAgents();
  const summary = agents.map((a) => {
    const base: Record<string, unknown> = {
      id: a.id,
      type: a.type,
      task: a.task,
      branch: a.branch,
      status: a.status,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };

    if (a.status === "idle") {
      const preview = manager.getTurnPreview(a.id);
      if (preview) base.preview = preview;
    }

    if (a.status === "waiting") {
      const question = manager.getPendingQuestion(a.id);
      if (question) base.pendingQuestion = `${question.tool}: ${JSON.stringify(question.input)}`;
    }

    return base;
  });

  return {
    content: [
      {
        type: "text" as const,
        text: agents.length === 0
          ? "No agents found."
          : JSON.stringify(summary, null, 2),
      },
    ],
  };
}
