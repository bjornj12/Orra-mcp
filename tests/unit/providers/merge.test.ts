import { describe, it, expect } from "vitest";
import { mergeProviderResults, checkProtocolVersion } from "../../../src/core/providers/index.js";
import type { ProviderResult, ProviderWorktree } from "../../../src/core/providers/types.js";

function makeResult(worktrees: ProviderWorktree[], version = "1.0"): ProviderResult {
  return { orraProtocolVersion: version, worktrees };
}

describe("mergeProviderResults", () => {
  it("should return empty map for empty input", () => {
    const result = mergeProviderResults([]);
    expect(result.size).toBe(0);
  });

  it("should pass through single provider results", () => {
    const result = mergeProviderResults([
      makeResult([{ id: "a", path: "/a", branch: "feat/a" }]),
    ]);
    expect(result.size).toBe(1);
    expect(result.get("a")!.branch).toBe("feat/a");
  });

  it("should merge worktrees from multiple providers by ID", () => {
    const result = mergeProviderResults([
      makeResult([{ id: "a", path: "/a", branch: "feat/a", stage: { name: "review" } }]),
      makeResult([{ id: "a", path: "/a", branch: "feat/a", git: { ahead: 5, behind: 0, uncommitted: 0, lastCommit: "2026-01-01", diffStat: "" } }]),
    ]);
    expect(result.size).toBe(1);
    const wt = result.get("a")!;
    expect(wt.stage?.name).toBe("review");
    expect(wt.git?.ahead).toBe(5);
  });

  it("should union markers and flags", () => {
    const result = mergeProviderResults([
      makeResult([{ id: "a", path: "/a", branch: "b", markers: ["spec.md"], flags: ["drift"] }]),
      makeResult([{ id: "a", path: "/a", branch: "b", markers: ["PRD.md"], flags: ["blocked"] }]),
    ]);
    const wt = result.get("a")!;
    expect(wt.markers).toContain("spec.md");
    expect(wt.markers).toContain("PRD.md");
    expect(wt.flags).toContain("drift");
    expect(wt.flags).toContain("blocked");
  });

  it("should not override stage from later provider", () => {
    const result = mergeProviderResults([
      makeResult([{ id: "a", path: "/a", branch: "b", stage: { name: "review" } }]),
      makeResult([{ id: "a", path: "/a", branch: "b", stage: { name: "deploy" } }]),
    ]);
    expect(result.get("a")!.stage?.name).toBe("review");
  });

  it("should allow later provider to set stage when first returned null", () => {
    const result = mergeProviderResults([
      makeResult([{ id: "a", path: "/a", branch: "b", stage: null }]),
      makeResult([{ id: "a", path: "/a", branch: "b", stage: { name: "deploy" } }]),
    ]);
    expect(result.get("a")!.stage?.name).toBe("deploy");
  });

  it("should shallow-merge extras with later keys winning", () => {
    const result = mergeProviderResults([
      makeResult([{ id: "a", path: "/a", branch: "b", extras: { url: "old", owner: "alice" } }]),
      makeResult([{ id: "a", path: "/a", branch: "b", extras: { url: "new" } }]),
    ]);
    const extras = result.get("a")!.extras!;
    expect(extras.url).toBe("new");
    expect(extras.owner).toBe("alice");
  });

  it("should add worktrees only in second provider", () => {
    const result = mergeProviderResults([
      makeResult([{ id: "a", path: "/a", branch: "b" }]),
      makeResult([{ id: "b", path: "/b", branch: "c" }]),
    ]);
    expect(result.size).toBe(2);
  });

  it("should truncate oversized extras and add flag", () => {
    const bigExtras: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      bigExtras[`key_${i}`] = "a".repeat(20);
    }
    const result = mergeProviderResults([
      makeResult([{ id: "a", path: "/a", branch: "b", extras: bigExtras }]),
    ]);
    const wt = result.get("a")!;
    expect(wt.extras?._truncated).toBe(true);
    expect(wt.flags).toContain("extras_truncated");
  });
});

describe("checkProtocolVersion", () => {
  it("should accept version 1.0", () => {
    expect(checkProtocolVersion("1.0")).toBe(true);
  });

  it("should accept version 1.5 (unknown minor)", () => {
    expect(checkProtocolVersion("1.5")).toBe(true);
  });

  it("should reject version 2.0 (unknown major)", () => {
    expect(checkProtocolVersion("2.0")).toBe(false);
  });

  it("should accept missing version (default 1.0)", () => {
    expect(checkProtocolVersion(undefined)).toBe(true);
  });

  it("should respect minProtocolVersion", () => {
    expect(checkProtocolVersion("1.0", "1.2")).toBe(false);
    expect(checkProtocolVersion("1.3", "1.2")).toBe(true);
  });
});
