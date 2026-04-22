import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { TickLogEntrySchema, type TickLogEntry } from "../types.js";

export function tickLogPath(projectRoot: string): string {
  return path.join(projectRoot, ".orra", "tick-log.jsonl");
}

export async function appendTickLog(
  projectRoot: string,
  entry: TickLogEntry,
): Promise<void> {
  const p = tickLogPath(projectRoot);
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.appendFile(p, JSON.stringify(entry) + "\n");
}

export async function readRecentTicks(
  projectRoot: string,
  limit: number,
): Promise<TickLogEntry[]> {
  let raw: string;
  try {
    raw = await fsp.readFile(tickLogPath(projectRoot), "utf8");
  } catch {
    return [];
  }
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const out: TickLogEntry[] = [];
  for (const line of lines) {
    try {
      const parsed = TickLogEntrySchema.safeParse(JSON.parse(line));
      if (parsed.success) out.push(parsed.data);
    } catch {
      // skip malformed
    }
  }
  return out.slice(-limit);
}
