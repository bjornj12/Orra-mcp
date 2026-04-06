import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SocketClient } from "../../src/core/socket-client.js";

describe("SocketClient", () => {
  let tmpDir: string;
  let sockPath: string;
  let mockServer: net.Server;
  let serverSocket: net.Socket | null = null;
  let client: SocketClient;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-client-test-"));
    fs.mkdirSync(path.join(tmpDir, ".orra"), { recursive: true });
    sockPath = path.join(tmpDir, ".orra", "orra.sock");

    mockServer = net.createServer((socket) => { serverSocket = socket; });
    await new Promise<void>((resolve) => mockServer.listen(sockPath, resolve));
  });

  afterEach(async () => {
    if (client) client.disconnect();
    if (serverSocket) serverSocket.destroy();
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should connect to socket", async () => {
    client = new SocketClient(tmpDir);
    await client.connect();
    expect(client.isConnected()).toBe(true);
  });

  it("should send register message", async () => {
    client = new SocketClient(tmpDir);
    await client.connect();
    const received: string[] = [];
    serverSocket!.on("data", (data) => received.push(data.toString()));
    client.sendRegister("my task", "my-branch");
    await new Promise((r) => setTimeout(r, 50));
    const parsed = JSON.parse(received[0].trim());
    expect(parsed).toEqual({ type: "register", task: "my task", branch: "my-branch" });
  });

  it("should send output message", async () => {
    client = new SocketClient(tmpDir);
    await client.connect();
    const received: string[] = [];
    serverSocket!.on("data", (data) => received.push(data.toString()));
    client.sendOutput("doing stuff\n");
    await new Promise((r) => setTimeout(r, 50));
    const parsed = JSON.parse(received[0].trim());
    expect(parsed).toEqual({ type: "output", data: "doing stuff\n" });
  });

  it("should send status message", async () => {
    client = new SocketClient(tmpDir);
    await client.connect();
    const received: string[] = [];
    serverSocket!.on("data", (data) => received.push(data.toString()));
    client.sendStatus("completed", 0);
    await new Promise((r) => setTimeout(r, 50));
    const parsed = JSON.parse(received[0].trim());
    expect(parsed).toEqual({ type: "status", status: "completed", exitCode: 0 });
  });

  it("should receive messages via onMessage callback", async () => {
    const messages: Array<{ type: string }> = [];
    client = new SocketClient(tmpDir);
    client.onMessage = (msg) => messages.push(msg);
    await client.connect();
    serverSocket!.write(JSON.stringify({ type: "registered", agentId: "test-id" }) + "\n");
    await new Promise((r) => setTimeout(r, 50));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ type: "registered", agentId: "test-id" });
  });

  it("should detect disconnection", async () => {
    let disconnected = false;
    client = new SocketClient(tmpDir);
    client.onDisconnect = () => { disconnected = true; };
    await client.connect();
    serverSocket!.destroy();
    await new Promise((r) => setTimeout(r, 100));
    expect(disconnected).toBe(true);
    expect(client.isConnected()).toBe(false);
  });

  it("should throw if socket does not exist", async () => {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    try { fs.unlinkSync(sockPath); } catch {}
    client = new SocketClient(tmpDir);
    await expect(client.connect()).rejects.toThrow();
  });
});
