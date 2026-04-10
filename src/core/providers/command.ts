import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import { ProviderResultSchema, type CommandProviderConfig, type StateProvider, type ProviderResult } from "./types.js";
import { expandRecord } from "./env-expand.js";

const execFileAsync = promisify(execFile);

export function createCommandProvider(config: CommandProviderConfig, projectRoot: string): StateProvider {
  const name = `command:${config.command[0]}`;

  return {
    name,
    config,
    async fetch(): Promise<ProviderResult> {
      const [program, ...args] = config.command;
      const cwd = config.cwd
        ? path.isAbsolute(config.cwd) ? config.cwd : path.join(projectRoot, config.cwd)
        : projectRoot;
      const env = { ...process.env, ...expandRecord(config.env) };

      const { stdout } = await execFileAsync(program, args, {
        cwd,
        env: env as Record<string, string>,
        timeout: config.timeout,
      });

      const json = JSON.parse(stdout);
      return ProviderResultSchema.parse(json);
    },
  };
}
