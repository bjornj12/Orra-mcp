import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { atomicWriteFile } from "./atomic-write.js";
import type { NormalizedIssue } from "./types/normalized-issue.js";

export interface TicketFile {
  worktree: string;
  primary?: NormalizedIssue;
  related?: NormalizedIssue[];
  manual?: boolean;
  source: string;
  synced_at: string;
}

export interface WriteInput {
  primary?: NormalizedIssue;
  related?: NormalizedIssue[];
  manual?: boolean;
  source: string;
}

const SAFE_CHAR = /[A-Za-z0-9._-]/;

export function sanitizeWorktreeKey(id: string): string {
  return Array.from(id).map((c) => (SAFE_CHAR.test(c) ? c : "_")).join("");
}

export class TicketStore {
  constructor(private readonly projectRoot: string) {}

  private dir(): string {
    return path.join(this.projectRoot, ".orra", "tickets");
  }

  pathFor(worktreeId: string): string {
    return path.join(this.dir(), `${sanitizeWorktreeKey(worktreeId)}.json`);
  }

  async read(worktreeId: string): Promise<TicketFile | null> {
    try {
      const raw = await fsp.readFile(this.pathFor(worktreeId), "utf8");
      return JSON.parse(raw) as TicketFile;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async write(worktreeId: string, input: WriteInput): Promise<void> {
    await fsp.mkdir(this.dir(), { recursive: true });
    const file: TicketFile = {
      worktree: worktreeId,
      ...(input.primary !== undefined ? { primary: input.primary } : {}),
      ...(input.related !== undefined ? { related: input.related } : {}),
      ...(input.manual !== undefined ? { manual: input.manual } : {}),
      source: input.source,
      synced_at: new Date().toISOString(),
    };
    await atomicWriteFile(this.pathFor(worktreeId), JSON.stringify(file, null, 2));
  }

  async list(): Promise<{ worktreeId: string; file: TicketFile }[]> {
    let entries: string[];
    try {
      entries = await fsp.readdir(this.dir());
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const results: { worktreeId: string; file: TicketFile }[] = [];
    for (const entry of entries) {
      if (entry === "_archived" || !entry.endsWith(".json")) continue;
      const sanitizedId = entry.replace(/\.json$/, "");
      const file = await this.read(sanitizedId);
      if (file) results.push({ worktreeId: file.worktree, file });
    }
    return results;
  }

  async archive(worktreeId: string): Promise<void> {
    const src = this.pathFor(worktreeId);
    try {
      await fsp.access(src);
    } catch {
      return;
    }
    const archivedDir = path.join(this.dir(), "_archived");
    await fsp.mkdir(archivedDir, { recursive: true });
    const dst = path.join(archivedDir, `${sanitizeWorktreeKey(worktreeId)}.json`);
    await fsp.rename(src, dst);
  }
}
