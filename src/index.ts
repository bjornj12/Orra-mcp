#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const projectRoot = process.cwd();
  const { server, manager } = createServer(projectRoot);
  await manager.init();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("orra-mcp: running");

  process.on("SIGTERM", async () => {
    await manager.shutdown();
    process.exit(0);
  });
  process.on("SIGINT", async () => {
    await manager.shutdown();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("orra-mcp: fatal error:", err);
  process.exit(1);
});
