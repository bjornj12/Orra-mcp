#!/usr/bin/env node
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import type { OrraMode } from "./types.js";

async function detectMode(projectRoot: string): Promise<OrraMode> {
  const sockPath = path.join(projectRoot, ".orra", "orra.sock");

  try {
    fs.accessSync(sockPath);
  } catch {
    return "orchestrator";
  }

  return new Promise<OrraMode>((resolve) => {
    const socket = net.createConnection(sockPath);
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve("orchestrator");
    }, 500);

    socket.on("connect", () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve("agent");
    });

    socket.on("error", () => {
      clearTimeout(timeout);
      resolve("orchestrator");
    });
  });
}

async function main() {
  const projectRoot = process.cwd();
  const mode = await detectMode(projectRoot);

  const { server, manager } = createServer(projectRoot, mode);

  if (mode === "orchestrator") {
    await manager.init();
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`orra-mcp: running in ${mode} mode`);

  process.on("SIGTERM", async () => {
    if (manager) await manager.shutdown();
    process.exit(0);
  });
  process.on("SIGINT", async () => {
    if (manager) await manager.shutdown();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("orra-mcp: fatal error:", err);
  process.exit(1);
});
