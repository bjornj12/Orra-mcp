import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentManager } from "./core/agent-manager.js";
import { orraScanSchema, handleOrraScan } from "./tools/orra-scan.js";
import { orraInspectSchema, handleOrraInspect } from "./tools/orra-inspect.js";
import { orraSpawnSchema, handleOrraSpawn } from "./tools/orra-spawn.js";
import { orraKillSchema, handleOrraKill } from "./tools/orra-kill.js";
import { orraMessageSchema, handleOrraMessage } from "./tools/orra-message.js";
import { orraUnblockSchema, handleOrraUnblock } from "./tools/orra-unblock.js";
import { orraRebaseSchema, handleOrraRebase } from "./tools/orra-rebase.js";
import { orraRegisterSchema, handleOrraRegister } from "./tools/orra-register.js";

export function createServer(projectRoot: string): { server: McpServer; manager: AgentManager } {
  const server = new McpServer({ name: "orra-mcp", version: "0.2.0" });
  const manager = new AgentManager(projectRoot);

  server.tool("orra_scan", "Scan all worktrees — returns status summary (ready_to_land, needs_attention, in_progress, idle, stale) with git state, file markers, PRs, and agent status.", orraScanSchema.shape, async () => handleOrraScan(projectRoot));
  server.tool("orra_inspect", "Deep dive on one worktree — full git state, commit log, markers, PR reviews, agent output, conflict prediction.", orraInspectSchema.shape, async (args) => handleOrraInspect(projectRoot, orraInspectSchema.parse(args)));
  server.tool("orra_spawn", "Create a worktree and launch a Claude agent with a task.", orraSpawnSchema.shape, async (args) => handleOrraSpawn(manager, orraSpawnSchema.parse(args)));
  server.tool("orra_kill", "Stop agent + remove worktree + clean branch. Optionally close PR.", orraKillSchema.shape, async (args) => handleOrraKill(manager, orraKillSchema.parse(args)));
  server.tool("orra_message", "Send a message to a running agent. Resumes idle agents.", orraMessageSchema.shape, async (args) => handleOrraMessage(manager, orraMessageSchema.parse(args)));
  server.tool("orra_unblock", "Answer a pending permission prompt for an agent.", orraUnblockSchema.shape, async (args) => handleOrraUnblock(projectRoot, orraUnblockSchema.parse(args)));
  server.tool("orra_rebase", "Rebase a worktree branch on latest main. Stops agent if running.", orraRebaseSchema.shape, async (args) => handleOrraRebase(manager, projectRoot, orraRebaseSchema.parse(args)));
  server.tool("orra_register", "Register an existing worktree with Orra — installs hooks for agent state tracking and creates initial state file. Use this for worktrees created by other tools (e.g., Superset).", orraRegisterSchema.shape, async (args) => handleOrraRegister(projectRoot, orraRegisterSchema.parse(args)));

  return { server, manager };
}
