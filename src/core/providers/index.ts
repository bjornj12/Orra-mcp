import type { ProviderConfig, ProviderResult, StateProvider, ProviderWorktree, ProviderStatus, ProviderCacheConfig } from "./types.js";
import { ProviderCache } from "./cache.js";
import { createHttpProvider } from "./http.js";
import { createFileProvider } from "./file.js";
import { createCommandProvider } from "./command.js";

// --- Protocol version check ---

export function checkProtocolVersion(
  version: string | undefined,
  minVersion?: string,
): boolean {
  const v = version ?? "1.0";
  const major = parseInt(v.split(".")[0], 10);
  if (major !== 1) return false;

  if (minVersion) {
    const [minMajor, minMinor] = minVersion.split(".").map(Number);
    const [curMajor, curMinor] = v.split(".").map(Number);
    if (curMajor < minMajor || (curMajor === minMajor && curMinor < minMinor)) {
      return false;
    }
  }

  return true;
}

// --- Build providers from config ---

export function buildProviders(
  configs: ProviderConfig[],
  projectRoot: string,
): StateProvider[] {
  return configs.map((config) => {
    switch (config.type) {
      case "http":
        return createHttpProvider(config);
      case "file":
        return createFileProvider(config, projectRoot);
      case "command":
        return createCommandProvider(config, projectRoot);
    }
  });
}

// --- Merge provider results ---

export function mergeProviderResults(
  results: ProviderResult[],
): Map<string, ProviderWorktree> {
  const merged = new Map<string, ProviderWorktree>();

  for (const result of results) {
    for (const wt of result.worktrees) {
      const existing = merged.get(wt.id);
      if (!existing) {
        merged.set(wt.id, { ...wt });
        continue;
      }

      // git, pr, agent: later provider wins if non-null
      if (wt.git) existing.git = wt.git;
      if (wt.pr !== undefined && wt.pr !== null) existing.pr = wt.pr;
      if (wt.agent !== undefined && wt.agent !== null) existing.agent = wt.agent;

      // stage: first non-null wins
      if (!existing.stage && wt.stage) {
        existing.stage = wt.stage;
      }

      // markers + flags: union
      if (wt.markers) {
        existing.markers = [...new Set([...(existing.markers ?? []), ...wt.markers])];
      }
      if (wt.flags) {
        existing.flags = [...new Set([...(existing.flags ?? []), ...wt.flags])];
      }

      // extras: shallow merge, later keys win
      if (wt.extras) {
        existing.extras = { ...(existing.extras ?? {}), ...wt.extras };
      }
    }
  }

  // Enforce 1KB extras limit
  for (const wt of merged.values()) {
    if (wt.extras) {
      const json = JSON.stringify(wt.extras);
      if (json.length > 1024) {
        wt.extras = { _truncated: true };
        wt.flags = [...(wt.flags ?? []), "extras_truncated"];
      }
    }
  }

  return merged;
}

// --- Fetch all providers and return merged data + status ---

let globalCache: ProviderCache | null = null;

function getCache(config: ProviderCacheConfig | undefined): ProviderCache {
  const ttl = config?.ttl ?? 5000;
  if (!globalCache || globalCache.ttlMs !== ttl) {
    globalCache = new ProviderCache(ttl);
  }
  return globalCache;
}

export async function fetchAndMergeProviders(
  providers: StateProvider[],
  cacheConfig?: ProviderCacheConfig,
): Promise<{ merged: Map<string, ProviderWorktree>; status: ProviderStatus }> {
  const cache = getCache(cacheConfig);
  const used: string[] = [];
  const failed: Array<{ provider: string; error: string }> = [];
  const cacheHits: string[] = [];
  const results: ProviderResult[] = [];

  const fetchResults = await Promise.allSettled(
    providers.map(async (p) => {
      const cached = cache.get(p.name);
      if (cached) return { name: p.name, data: cached, cached: true };
      const data = await p.fetch();
      cache.set(p.name, data);
      return { name: p.name, data, cached: false };
    }),
  );

  for (let i = 0; i < fetchResults.length; i++) {
    const result = fetchResults[i];
    const name = providers[i].name;

    if (result.status === "fulfilled") {
      const { data, cached } = result.value;
      if (!checkProtocolVersion(data.orraProtocolVersion, providers[i].config.minProtocolVersion)) {
        failed.push({ provider: name, error: `incompatible protocol version: ${data.orraProtocolVersion}` });
        continue;
      }
      results.push(data);
      used.push(name);
      if (cached) cacheHits.push(name);
    } else {
      failed.push({ provider: name, error: String(result.reason) });
    }
  }

  const merged = mergeProviderResults(results);
  return { merged, status: { used, failed, cacheHits } };
}
