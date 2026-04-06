import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { AgentManager } from "../../src/core/agent-manager.js";
import { StateManager } from "../../src/core/state.js";

describe("Hooks System (integration)", () => {
  let tmpDir: string;
  let manager: AgentManager;
  let sockPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-hooks-test-"));
    execSync("git init", { cwd: tmpDir });
    execSync("git commit --allow-empty -m 'init'", { cwd: tmpDir });

    manager = new AgentManager(tmpDir);
    await manager.init();
    sockPath = path.join(tmpDir, ".orra", "orra.sock");

    // Create a fake agent state so we can test hook messages
    const state = new StateManager(tmpDir);
    await state.saveAgent({
      id: "test-agent-a1b2",
      type: "spawned",
      task: "test task",
      branch: "orra/test",
      worktree: "worktrees/test",
      pid: 0,
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      exitCode: null,
      model: null,
      allowedTools: null,
    });
    await state.appendLog("test-agent-a1b2", "Working on stuff...\nDoing things...\nWhich option? A or B?\n");
  });

  afterEach(async () => {
    await manager.shutdown();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should handle permission question and block until answered", async () => {
    const hookSocket = net.createConnection(sockPath);
    await new Promise<void>((resolve) => hookSocket.on("connect", resolve));

    hookSocket.write(JSON.stringify({
      type: "question",
      agentId: "test-agent-a1b2",
      tool: "Bash",
      input: { command: "rm -rf /tmp/test" },
    }) + "\n");

    await new Promise((r) => setTimeout(r, 200));

    const status = await manager.getAgentStatus("test-agent-a1b2");
    expect(status!.agent.status).toBe("waiting");

    const question = manager.getPendingQuestion("test-agent-a1b2");
    expect(question).not.toBeNull();
    expect(question!.tool).toBe("Bash");

    const received: string[] = [];
    hookSocket.on("data", (data) => received.push(data.toString()));

    await manager.sendMessage("test-agent-a1b2", "yes");
    await new Promise((r) => setTimeout(r, 100));

    const answer = JSON.parse(received[received.length - 1].trim());
    expect(answer.type).toBe("answer");
    expect(answer.allow).toBe(true);

    const statusAfter = await manager.getAgentStatus("test-agent-a1b2");
    expect(statusAfter!.agent.status).toBe("running");

    hookSocket.destroy();
  });

  it("should handle permission denial", async () => {
    const hookSocket = net.createConnection(sockPath);
    await new Promise<void>((resolve) => hookSocket.on("connect", resolve));

    hookSocket.write(JSON.stringify({
      type: "question",
      agentId: "test-agent-a1b2",
      tool: "Bash",
      input: { command: "rm -rf /" },
    }) + "\n");

    await new Promise((r) => setTimeout(r, 200));

    const received: string[] = [];
    hookSocket.on("data", (data) => received.push(data.toString()));

    await manager.sendMessage("test-agent-a1b2", "no, that's dangerous");
    await new Promise((r) => setTimeout(r, 100));

    const answer = JSON.parse(received[received.length - 1].trim());
    expect(answer.type).toBe("answer");
    expect(answer.allow).toBe(false);
    expect(answer.reason).toBe("no, that's dangerous");

    hookSocket.destroy();
  });

  it("should handle turn_complete and set idle status with preview", async () => {
    const hookSocket = net.createConnection(sockPath);
    await new Promise<void>((resolve) => hookSocket.on("connect", resolve));

    hookSocket.write(JSON.stringify({
      type: "turn_complete",
      agentId: "test-agent-a1b2",
    }) + "\n");

    await new Promise((r) => setTimeout(r, 200));

    const status = await manager.getAgentStatus("test-agent-a1b2");
    expect(status!.agent.status).toBe("idle");

    const preview = manager.getTurnPreview("test-agent-a1b2");
    expect(preview).toContain("Which option? A or B?");

    hookSocket.destroy();
  });

  it("should resume idle agent via sendMessage", async () => {
    const hookSocket = net.createConnection(sockPath);
    await new Promise<void>((resolve) => hookSocket.on("connect", resolve));

    hookSocket.write(JSON.stringify({
      type: "turn_complete",
      agentId: "test-agent-a1b2",
    }) + "\n");

    await new Promise((r) => setTimeout(r, 200));

    // Agent is idle, message should set it back to running
    // (This will throw because there's no actual PTY, but the status change should happen)
    try {
      await manager.sendMessage("test-agent-a1b2", "option A");
    } catch {
      // Expected: no active process for this test agent
    }

    const status = await manager.getAgentStatus("test-agent-a1b2");
    expect(status!.agent.status).toBe("running");

    hookSocket.destroy();
  });
});
