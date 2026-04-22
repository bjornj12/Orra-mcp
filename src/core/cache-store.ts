import * as fsp from "node:fs/promises";
import * as path from "node:path";
import {
  CacheFileSchema,
  CacheIndexSchema,
  type CacheFile,
  type CacheIndex,
} from "../types.js";
import { assertSafeDirectiveId } from "./validation.js";
import { atomicWriteFile } from "./atomic-write.js";

function cacheDir(projectRoot: string): string {
  return path.join(projectRoot, ".orra", "cache");
}

export function cachePath(projectRoot: string, directiveId: string): string {
  assertSafeDirectiveId(directiveId);
  return path.join(cacheDir(projectRoot), `${directiveId}.json`);
}

export function cacheIndexPath(projectRoot: string, directiveId: string): string {
  assertSafeDirectiveId(directiveId);
  return path.join(cacheDir(projectRoot), `${directiveId}.index.json`);
}

export async function writeCache(
  projectRoot: string,
  args: {
    directive_id: string;
    rows: Array<Record<string, unknown>>;
    index: CacheIndex;
    fetched_at: string;
  },
): Promise<void> {
  await fsp.mkdir(cacheDir(projectRoot), { recursive: true });
  const file: CacheFile = {
    directive_id: args.directive_id,
    fetched_at: args.fetched_at,
    rows: args.rows,
  };
  // Write index first, then rows: if the second write fails, consumers see
  // the newer index paired with an older rows file, which `queryCache` can
  // still serve from; the inverse would leave rows without a facets summary.
  await atomicWriteFile(cacheIndexPath(projectRoot, args.directive_id), JSON.stringify(args.index));
  await atomicWriteFile(cachePath(projectRoot, args.directive_id), JSON.stringify(file));
}

export async function readCache(
  projectRoot: string,
  directiveId: string,
): Promise<CacheFile | null> {
  try {
    const raw = await fsp.readFile(cachePath(projectRoot, directiveId), "utf8");
    const parsed = CacheFileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function readCacheIndex(
  projectRoot: string,
  directiveId: string,
): Promise<CacheIndex | null> {
  try {
    const raw = await fsp.readFile(cacheIndexPath(projectRoot, directiveId), "utf8");
    const parsed = CacheIndexSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type CacheQueryArgs = {
  filter?: Record<string, unknown>;
  fields?: string[];
  limit?: number;
};

export type CacheQueryResult = {
  directive_id: string;
  fetched_at: string;
  total: number;
  returned: number;
  rows: Array<Record<string, unknown>>;
  stale?: boolean;
};

export async function queryCache(
  projectRoot: string,
  directiveId: string,
  args: CacheQueryArgs,
): Promise<CacheQueryResult> {
  const cache = await readCache(projectRoot, directiveId);
  if (!cache) {
    return {
      directive_id: directiveId,
      fetched_at: "",
      total: 0,
      returned: 0,
      rows: [],
      stale: true,
    };
  }
  let rows = cache.rows;
  if (args.filter) {
    rows = rows.filter((r) => matchFilter(r, args.filter!));
  }
  if (args.fields && args.fields.length > 0) {
    rows = rows.map((r) => {
      const out: Record<string, unknown> = {};
      for (const f of args.fields!) out[f] = r[f];
      return out;
    });
  }
  if (args.limit !== undefined && args.limit >= 0) rows = rows.slice(0, args.limit);
  return {
    directive_id: directiveId,
    fetched_at: cache.fetched_at,
    total: cache.rows.length,
    returned: rows.length,
    rows,
  };
}

function matchFilter(row: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(filter)) {
    const rv = row[k];
    if (typeof v === "string" && typeof rv === "string") {
      if (rv !== v) return false;
    } else if (typeof v === "number") {
      if (rv !== v) return false;
    } else if (v !== null && typeof v === "object" && "$gt" in (v as object)) {
      const threshold = (v as { $gt: number }).$gt;
      if (typeof rv !== "number" || rv <= threshold) return false;
    } else {
      if (rv !== v) return false;
    }
  }
  return true;
}

