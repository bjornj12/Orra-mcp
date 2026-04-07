import type { AgentManager } from "../core/agent-manager.js";

export async function handleListAgents(manager: AgentManager) {
  const agents = await manager.listAgents();
  const summary = await Promise.all(agents.map(async (a) => {
    const base: Record<string, unknown> = {
      id: a.id,
      type: a.type,
      task: a.task,
      branch: a.branch,
      status: a.status,
    };

    // Always show last line of output for every agent
    const lastOutput = await manager.getAgentOutput(a.id, 3);
    if (lastOutput) {
      const lines = lastOutput.split("\n").filter(l => l.trim().length > 0);
      if (lines.length > 0) {
        base.lastOutput = lines[lines.length - 1];
      }
    }

    if (a.status === "idle") {
      const preview = manager.getTurnPreview(a.id);
      if (preview) base.preview = preview;
    }

    if (a.status === "waiting") {
      const question = manager.getPendingQuestion(a.id);
      if (question) base.pendingQuestion = `${question.tool}: ${JSON.stringify(question.input)}`;
    }

    return base;
  }));

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
