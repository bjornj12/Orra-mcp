import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { AgentManager } from "../../src/core/agent-manager.js";
import { SocketClient } from "../../src/core/socket-client.js";

describe("External Agent Registration (integration)", () => {
  let tmpDir: string;
  let manager: AgentManager;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-ext-test-"));
    execSync("git init", { cwd: tmpDir });
    execSync("git commit --allow-empty -m 'init'", { cwd: tmpDir });

    manager = new AgentManager(tmpDir);
    await manager.init();
  });

  afterEach(async () => {
    await manager.shutdown();
    try {
      execSync("git worktree prune", { cwd: tmpDir });
    } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should accept external agent registration via socket", async () => {
    const client = new SocketClient(tmpDir);
    await client.connect();

    const agentId = await new Promise<string>((resolve) => {
      client.onMessage = (msg) => {
        if (msg.type === "registered") resolve(msg.agentId);
      };
      client.sendRegister("test task", "main");
    });

    expect(agentId).toBeTruthy();

    // Give state time to save
    await new Promise((r) => setTimeout(r, 100));

    const agents = await manager.listAgents();
    const external = agents.find((a) => a.id === agentId);
    expect(external).toBeTruthy();
    expect(external!.type).toBe("external");
    expect(external!.task).toBe("test task");
    expect(external!.status).toBe("running");

    client.disconnect();
  });

  it("should capture output from external agent", async () => {
    const client = new SocketClient(tmpDir);
    await client.connect();

    const agentId = await new Promise<string>((resolve) => {
      client.onMessage = (msg) => {
        if (msg.type === "registered") resolve(msg.agentId);
      };
      client.sendRegister("output test", "main");
    });

    await new Promise((r) => setTimeout(r, 50));

    client.sendOutput("Working on auth\n");
    client.sendOutput("Reading files\n");
    await new Promise((r) => setTimeout(r, 200));

    const output = await manager.getAgentOutput(agentId);
    expect(output).toContain("Working on auth");
    expect(output).toContain("Reading files");

    client.disconnect();
  });

  it("should send message to external agent", async () => {
    const client = new SocketClient(tmpDir);
    await client.connect();

    const received: Array<{ type: string; content?: string }> = [];
    const agentId = await new Promise<string>((resolve) => {
      client.onMessage = (msg) => {
        if (msg.type === "registered") resolve(msg.agentId);
        else received.push(msg as any);
      };
      client.sendRegister("msg test", "main");
    });

    await new Promise((r) => setTimeout(r, 50));

    await manager.sendMessage(agentId, "check the tests");
    await new Promise((r) => setTimeout(r, 100));

    expect(received.some((m) => m.type === "message" && m.content === "check the tests")).toBe(true);

    client.disconnect();
  });

  it("should mark agent as interrupted on disconnect without status", async () => {
    const client = new SocketClient(tmpDir);
    await client.connect();

    const agentId = await new Promise<string>((resolve) => {
      client.onMessage = (msg) => {
        if (msg.type === "registered") resolve(msg.agentId);
      };
      client.sendRegister("disc test", "main");
    });

    await new Promise((r) => setTimeout(r, 100));

    client.disconnect();
    await new Promise((r) => setTimeout(r, 200));

    const status = await manager.getAgentStatus(agentId);
    expect(status!.agent.status).toBe("interrupted");
  });

  it("should mark agent as completed when status message sent", async () => {
    const client = new SocketClient(tmpDir);
    await client.connect();

    const agentId = await new Promise<string>((resolve) => {
      client.onMessage = (msg) => {
        if (msg.type === "registered") resolve(msg.agentId);
      };
      client.sendRegister("complete test", "main");
    });

    await new Promise((r) => setTimeout(r, 100));

    client.sendStatus("completed", 0);
    await new Promise((r) => setTimeout(r, 200));

    const status = await manager.getAgentStatus(agentId);
    expect(status!.agent.status).toBe("completed");
    expect(status!.agent.exitCode).toBe(0);

    client.disconnect();
  });
});
