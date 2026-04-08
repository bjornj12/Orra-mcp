import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ConfigSchema, type Config } from "../types.js";

export type { Config };

export async function loadConfig(projectRoot: string): Promise<Config> {
  const configPath = path.join(projectRoot, ".orra", "config.json");
  try {
    const data = await fs.readFile(configPath, "utf-8");
    return ConfigSchema.parse(JSON.parse(data));
  } catch {
    return ConfigSchema.parse({});
  }
}
