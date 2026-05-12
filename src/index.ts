#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const projectRoot = process.cwd();
  const { server } = createServer(projectRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("orra-mcp: running");
}

main().catch((err) => {
  console.error("orra-mcp: fatal error:", err);
  process.exit(1);
});
