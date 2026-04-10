import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ProviderResultSchema, type FileProviderConfig, type StateProvider, type ProviderResult } from "./types.js";

export function createFileProvider(config: FileProviderConfig, projectRoot: string): StateProvider {
  let resolvedPath: string;
  if (config.path.startsWith("~/")) {
    resolvedPath = path.join(os.homedir(), config.path.slice(2));
  } else if (path.isAbsolute(config.path)) {
    resolvedPath = config.path;
  } else {
    resolvedPath = path.join(projectRoot, config.path);
  }

  const name = `file:${config.path}`;

  return {
    name,
    config,
    async fetch(): Promise<ProviderResult> {
      const data = await fs.readFile(resolvedPath, "utf-8");
      const json = JSON.parse(data);
      return ProviderResultSchema.parse(json);
    },
  };
}
