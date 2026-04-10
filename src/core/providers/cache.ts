import type { ProviderResult } from "./types.js";

interface CacheEntry {
  data: ProviderResult;
  expiresAt: number;
}

export class ProviderCache {
  private entries = new Map<string, CacheEntry>();
  public readonly ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  get(key: string): ProviderResult | null {
    if (this.ttlMs <= 0) return null;
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: ProviderResult): void {
    if (this.ttlMs <= 0) return;
    this.entries.set(key, { data, expiresAt: Date.now() + this.ttlMs });
  }
}
