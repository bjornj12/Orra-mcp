import * as fs from "node:fs/promises";
import * as path from "node:path";
import { atomicWriteFile } from "./atomic-write.js";
import { SpawnLedgerEntrySchema, type SpawnLedgerEntry } from "../types.js";
import { isSafeWorktreeId } from "./validation.js";

function assertSafeId(id: string): string {
  if (!isSafeWorktreeId(id)) {
    throw new Error(`Invalid identifier: ${JSON.stringify(id)}`);
  }
  return id;
}

export class StateManager {
  private orraDir: string;

  constructor(private projectRoot: string) {
    this.orraDir = path.join(projectRoot, ".orra");
  }

  async init(): Promise<void> {
    await fs.mkdir(this.orraDir, { recursive: true });
  }

  async appendLog(id: string, content: string): Promise<void> {
    const agentsDir = path.join(this.orraDir, "agents");
    await fs.mkdir(agentsDir, { recursive: true });
    const filePath = path.join(agentsDir, `${assertSafeId(id)}.log`);
    await fs.appendFile(filePath, content);
  }

  async readLog(id: string, tail?: number): Promise<string> {
    const filePath = path.join(this.orraDir, "agents", `${assertSafeId(id)}.log`);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      if (tail === undefined) {
        return content;
      }
      const lines = content.split("\n").filter((l) => l.length > 0);
      return lines.slice(-tail).join("\n");
    } catch {
      return "";
    }
  }

  async readLogRange(id: string, offset: number): Promise<{ content: string; newOffset: number }> {
    const filePath = path.join(this.orraDir, "agents", `${assertSafeId(id)}.log`);
    try {
      const stat = await fs.stat(filePath);
      const fileSize = stat.size;
      if (offset >= fileSize) {
        return { content: "", newOffset: offset };
      }
      const handle = await fs.open(filePath, "r");
      try {
        const buffer = Buffer.alloc(fileSize - offset);
        await handle.read(buffer, 0, buffer.length, offset);
        return { content: buffer.toString("utf-8"), newOffset: fileSize };
      } finally {
        await handle.close();
      }
    } catch {
      return { content: "", newOffset: 0 };
    }
  }
}

// ─── Spawn Ledger ─────────────────────────────────────────────────────────────
// Writes provenance records to .orra/spawns/<shortId>.json.
// These are thin "who spawned what and why" entries — the daemon's own
// jobs/<short>/state.json is the authoritative lifecycle record.

function spawnsDir(projectRoot: string): string {
  return path.join(projectRoot, ".orra", "spawns");
}

export async function recordSpawn(
  projectRoot: string,
  entry: Omit<SpawnLedgerEntry, "spawnedAt">,
): Promise<void> {
  const dir = spawnsDir(projectRoot);
  await fs.mkdir(dir, { recursive: true });
  const full: SpawnLedgerEntry = {
    ...entry,
    spawnedAt: new Date().toISOString(),
  };
  const filePath = path.join(dir, `${assertSafeId(entry.shortId)}.json`);
  await atomicWriteFile(filePath, JSON.stringify(full, null, 2));
}

export async function readSpawnLedger(projectRoot: string): Promise<SpawnLedgerEntry[]> {
  const dir = spawnsDir(projectRoot);
  try {
    const files = await fs.readdir(dir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    const entries: SpawnLedgerEntry[] = [];
    for (const file of jsonFiles) {
      try {
        const raw = await fs.readFile(path.join(dir, file), "utf-8");
        const parsed = SpawnLedgerEntrySchema.parse(JSON.parse(raw));
        entries.push(parsed);
      } catch {
        // Skip malformed entries
      }
    }
    return entries;
  } catch {
    return [];
  }
}

export async function readSpawn(
  projectRoot: string,
  shortId: string,
): Promise<SpawnLedgerEntry | null> {
  const filePath = path.join(spawnsDir(projectRoot), `${assertSafeId(shortId)}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return SpawnLedgerEntrySchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
