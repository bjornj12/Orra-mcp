import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProviderCache } from "../../../src/core/providers/cache.js";

describe("ProviderCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return null for missing keys", () => {
    const cache = new ProviderCache(5000);
    expect(cache.get("missing")).toBeNull();
  });

  it("should store and retrieve values within TTL", () => {
    const cache = new ProviderCache(5000);
    const data = { orraProtocolVersion: "1.0", worktrees: [] };
    cache.set("key1", data);
    expect(cache.get("key1")).toEqual(data);
  });

  it("should return null after TTL expires", () => {
    const cache = new ProviderCache(1000);
    cache.set("key1", { orraProtocolVersion: "1.0", worktrees: [] });
    vi.advanceTimersByTime(1500);
    expect(cache.get("key1")).toBeNull();
  });

  it("should return value before TTL expires", () => {
    const cache = new ProviderCache(5000);
    cache.set("key1", { orraProtocolVersion: "1.0", worktrees: [] });
    vi.advanceTimersByTime(3000);
    expect(cache.get("key1")).not.toBeNull();
  });

  it("should disable caching when ttl is 0", () => {
    const cache = new ProviderCache(0);
    cache.set("key1", { orraProtocolVersion: "1.0", worktrees: [] });
    expect(cache.get("key1")).toBeNull();
  });
});
