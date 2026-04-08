import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ConfigV2Schema, type ConfigV2 } from "../types.js";

export type { ConfigV2 };

export async function loadConfig(projectRoot: string): Promise<ConfigV2> {
  const configPath = path.join(projectRoot, ".orra", "config.json");
  try {
    const data = await fs.readFile(configPath, "utf-8");
    return ConfigV2Schema.parse(JSON.parse(data));
  } catch {
    return ConfigV2Schema.parse({});
  }
}
