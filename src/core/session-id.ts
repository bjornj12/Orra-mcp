import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { CurrentSessionSchema, type CurrentSession } from "../types.js";
import { atomicWriteFile } from "./atomic-write.js";

export function currentSessionPath(projectRoot: string): string {
  return path.join(projectRoot, ".orra", "current-session.json");
}

export async function writeCurrentSession(
  projectRoot: string,
  value: CurrentSession,
): Promise<void> {
  const p = currentSessionPath(projectRoot);
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await atomicWriteFile(p, JSON.stringify(value));
}

export async function readCurrentSession(
  projectRoot: string,
): Promise<CurrentSession | null> {
  try {
    const raw = await fsp.readFile(currentSessionPath(projectRoot), "utf8");
    const parsed = CurrentSessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
