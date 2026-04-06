import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SocketServer } from "../../src/core/socket-server.js";

describe("SocketServer", () => {
  let tmpDir: string;
  let server: SocketServer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-sock-test-"));
    fs.mkdirSync(path.join(tmpDir, ".orra"), { recursive: true });
  });

  afterEach(async () => {
    if (server) await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should start and create socket file", async () => {
    server = new SocketServer(tmpDir);
    await server.start();
    expect(fs.existsSync(path.join(tmpDir, ".orra", "orra.sock"))).toBe(true);
  });

  it("should accept a connection", async () => {
    server = new SocketServer(tmpDir);
    await server.start();
    const client = net.createConnection(path.join(tmpDir, ".orra", "orra.sock"));
    await new Promise<void>((resolve) => client.on("connect", resolve));
    client.destroy();
  });

  it("should parse register message and call onRegister", async () => {
    let registered: { task: string; branch?: string } | null = null;
    server = new SocketServer(tmpDir);
    server.onRegister = (_socket, msg) => { registered = { task: msg.task, branch: msg.branch }; return "test-agent-id"; };
    await server.start();

    const client = net.createConnection(path.join(tmpDir, ".orra", "orra.sock"));
    await new Promise<void>((resolve) => client.on("connect", resolve));
    client.write(JSON.stringify({ type: "register", task: "test task", branch: "main" }) + "\n");
    await new Promise((r) => setTimeout(r, 100));
    expect(registered).toEqual({ task: "test task", branch: "main" });
    client.destroy();
  });

  it("should forward output messages via onOutput callback", async () => {
    const outputs: string[] = [];
    server = new SocketServer(tmpDir);
    server.onRegister = () => "test-id";
    server.onOutput = (_agentId, data) => { outputs.push(data); };
    await server.start();

    const client = net.createConnection(path.join(tmpDir, ".orra", "orra.sock"));
    await new Promise<void>((resolve) => client.on("connect", resolve));
    client.write(JSON.stringify({ type: "register", task: "test" }) + "\n");
    await new Promise((r) => setTimeout(r, 50));
    client.write(JSON.stringify({ type: "output", data: "hello\n" }) + "\n");
    await new Promise((r) => setTimeout(r, 50));
    expect(outputs).toEqual(["hello\n"]);
    client.destroy();
  });

  it("should send message to a connected agent", async () => {
    server = new SocketServer(tmpDir);
    server.onRegister = () => "test-id";
    await server.start();

    const received: string[] = [];
    const client = net.createConnection(path.join(tmpDir, ".orra", "orra.sock"));
    await new Promise<void>((resolve) => client.on("connect", resolve));
    client.on("data", (data) => received.push(data.toString()));
    client.write(JSON.stringify({ type: "register", task: "test" }) + "\n");
    await new Promise((r) => setTimeout(r, 50));

    server.sendToAgent("test-id", { type: "message", content: "hey there" });
    await new Promise((r) => setTimeout(r, 50));
    const parsed = JSON.parse(received[received.length - 1].trim());
    expect(parsed).toEqual({ type: "message", content: "hey there" });
    client.destroy();
  });

  it("should call onDisconnect when client drops", async () => {
    let disconnectedId: string | null = null;
    server = new SocketServer(tmpDir);
    server.onRegister = () => "disc-test-id";
    server.onDisconnect = (agentId) => { disconnectedId = agentId; };
    await server.start();

    const client = net.createConnection(path.join(tmpDir, ".orra", "orra.sock"));
    await new Promise<void>((resolve) => client.on("connect", resolve));
    client.write(JSON.stringify({ type: "register", task: "test" }) + "\n");
    await new Promise((r) => setTimeout(r, 50));
    client.destroy();
    await new Promise((r) => setTimeout(r, 100));
    expect(disconnectedId).toBe("disc-test-id");
  });

  it("should call onStatus when agent sends status", async () => {
    let statusInfo: { agentId: string; status: string; exitCode: number } | null = null;
    server = new SocketServer(tmpDir);
    server.onRegister = () => "status-test-id";
    server.onStatus = (agentId, status, exitCode) => { statusInfo = { agentId, status, exitCode }; };
    await server.start();

    const client = net.createConnection(path.join(tmpDir, ".orra", "orra.sock"));
    await new Promise<void>((resolve) => client.on("connect", resolve));
    client.write(JSON.stringify({ type: "register", task: "test" }) + "\n");
    await new Promise((r) => setTimeout(r, 50));
    client.write(JSON.stringify({ type: "status", status: "completed", exitCode: 0 }) + "\n");
    await new Promise((r) => setTimeout(r, 50));
    expect(statusInfo).toEqual({ agentId: "status-test-id", status: "completed", exitCode: 0 });
    client.destroy();
  });

  it("should remove socket file on stop", async () => {
    server = new SocketServer(tmpDir);
    await server.start();
    const sockPath = path.join(tmpDir, ".orra", "orra.sock");
    expect(fs.existsSync(sockPath)).toBe(true);
    await server.stop();
    expect(fs.existsSync(sockPath)).toBe(false);
  });

  it("should remove stale socket and start fresh", async () => {
    const sockPath = path.join(tmpDir, ".orra", "orra.sock");
    fs.writeFileSync(sockPath, "stale");
    server = new SocketServer(tmpDir);
    await server.start();
    expect(fs.existsSync(sockPath)).toBe(true);
  });

  it("should report if agent is connected", async () => {
    server = new SocketServer(tmpDir);
    server.onRegister = () => "conn-test-id";
    await server.start();

    expect(server.isAgentConnected("conn-test-id")).toBe(false);
    const client = net.createConnection(path.join(tmpDir, ".orra", "orra.sock"));
    await new Promise<void>((resolve) => client.on("connect", resolve));
    client.write(JSON.stringify({ type: "register", task: "test" }) + "\n");
    await new Promise((r) => setTimeout(r, 50));
    expect(server.isAgentConnected("conn-test-id")).toBe(true);
    client.destroy();
    await new Promise((r) => setTimeout(r, 100));
    expect(server.isAgentConnected("conn-test-id")).toBe(false);
  });
});
