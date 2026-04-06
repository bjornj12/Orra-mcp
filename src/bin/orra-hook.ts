#!/usr/bin/env node
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";

// --- Exported helpers for testing ---

export function resolveAgentId(env: Record<string, string | undefined>, projectRoot: string): string | null {
  if (env.ORRA_AGENT_ID) return env.ORRA_AGENT_ID;

  const selfIdPath = path.join(projectRoot, ".orra", "agents", "self.id");
  try {
    return fs.readFileSync(selfIdPath, "utf-8").trim();
  } catch {
    return null;
  }
}

export function buildPermissionResponse(allow: boolean): object {
  return {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: { behavior: allow ? "allow" : "deny" },
    },
  };
}

export function parseAllowDeny(input: string): boolean {
  const lower = input.trim().toLowerCase();
  return ["yes", "y", "allow", "approve", "ok"].includes(lower);
}

// --- Main hook logic ---

function findProjectRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    dir = path.dirname(dir);
  }
  return startDir;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function connectToSocket(sockPath: string, timeout: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(sockPath, () => {
      clearTimeout(timer);
      resolve(socket);
    });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Connection timeout"));
    }, timeout);
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitForMessage(socket: net.Socket, timeout: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Answer timeout"));
    }, timeout);

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop()!;
      for (const line of lines) {
        if (line.trim().length > 0) {
          clearTimeout(timer);
          try {
            resolve(JSON.parse(line));
          } catch {
            reject(new Error("Invalid JSON from orchestrator"));
          }
          return;
        }
      }
    });

    socket.on("close", () => {
      clearTimeout(timer);
      reject(new Error("Socket closed before answer received"));
    });

    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function handlePermissionRequest(
  agentId: string,
  sockPath: string,
  hookInput: Record<string, unknown>
): Promise<void> {
  const toolName = (hookInput.tool_name as string) ?? "unknown";
  const toolInput = (hookInput.tool_input as Record<string, unknown>) ?? {};

  let socket: net.Socket;
  try {
    socket = await connectToSocket(sockPath, 2000);
  } catch {
    process.exit(1);
  }

  socket.write(JSON.stringify({
    type: "question",
    agentId,
    tool: toolName,
    input: toolInput,
  }) + "\n");

  try {
    const answer = await waitForMessage(socket, 300000); // 5 minute timeout
    socket.destroy();

    if (answer.allow) {
      console.log(JSON.stringify(buildPermissionResponse(true)));
      process.exit(0);
    } else {
      const reason = (answer.reason as string) ?? "Denied by orchestrator";
      console.error(reason);
      process.exit(2);
    }
  } catch {
    socket.destroy();
    process.exit(1);
  }
}

async function handleStop(agentId: string, sockPath: string): Promise<void> {
  try {
    const socket = await connectToSocket(sockPath, 2000);
    socket.write(JSON.stringify({
      type: "turn_complete",
      agentId,
    }) + "\n");
    setTimeout(() => {
      socket.destroy();
      process.exit(0);
    }, 100);
  } catch {
    process.exit(0);
  }
}

async function main(): Promise<void> {
  const input = await readStdin();
  let hookInput: Record<string, unknown>;
  try {
    hookInput = JSON.parse(input);
  } catch {
    process.exit(1);
    return;
  }

  const hookEvent = hookInput.hook_event_name as string;
  const cwd = (hookInput.cwd as string) ?? process.cwd();
  const projectRoot = findProjectRoot(cwd);
  const sockPath = path.join(projectRoot, ".orra", "orra.sock");
  const agentId = resolveAgentId(process.env, projectRoot);

  if (!agentId) {
    process.exit(1);
  }

  if (!fs.existsSync(sockPath)) {
    process.exit(1);
  }

  switch (hookEvent) {
    case "PermissionRequest":
      await handlePermissionRequest(agentId!, sockPath, hookInput);
      break;
    case "Stop":
      await handleStop(agentId!, sockPath);
      break;
    default:
      process.exit(0);
  }
}

const isMainModule = process.argv[1]?.endsWith("orra-hook.js") || process.argv[1]?.endsWith("orra-hook.ts");
if (isMainModule) {
  main().catch(() => process.exit(1));
}
