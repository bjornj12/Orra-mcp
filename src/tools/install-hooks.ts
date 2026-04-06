import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

function getHookConfig(): { hooks: Record<string, unknown> } {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const hookScriptPath = path.join(currentDir, "..", "bin", "orra-hook.js");

  return {
    hooks: {
      PermissionRequest: [{
        matcher: "",
        hooks: [{ type: "command", command: `node ${hookScriptPath}`, timeout: 300 }],
      }],
      Stop: [{
        matcher: "",
        hooks: [{ type: "command", command: `node ${hookScriptPath}`, timeout: 5 }],
      }],
    },
  };
}

export async function handleInstallHooks() {
  const projectRoot = process.cwd();
  const settingsDir = path.join(projectRoot, ".claude");
  const settingsPath = path.join(settingsDir, "settings.local.json");

  await fs.mkdir(settingsDir, { recursive: true });

  // Read existing settings if present
  let existing: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(settingsPath, "utf-8");
    existing = JSON.parse(raw);
  } catch {
    // No existing file or invalid JSON — start fresh
  }

  const hookConfig = getHookConfig();

  // Merge: overwrite hooks section, preserve everything else
  const merged = { ...existing, ...hookConfig };

  await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2));

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        installed: true,
        path: settingsPath,
        hooks: ["PermissionRequest", "Stop"],
      }, null, 2),
    }],
  };
}
