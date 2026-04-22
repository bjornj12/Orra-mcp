import { describe, it, expect } from "vitest";
import { filterScanEntries } from "../../../src/core/awareness.js";

describe("filterScanEntries", () => {
  const entries = [
    { id: "a", status: "ready_to_land", attention_score: 0.1 },
    { id: "b", status: "needs_attention", attention_score: 0.9 },
    { id: "c", status: "idle", attention_score: 0.0 },
  ];

  it("filters by status equality", () => {
    const out = filterScanEntries(entries as any, { filter: { status: "needs_attention" } });
    expect(out).toHaveLength(1);
    expect((out[0] as any).id).toBe("b");
  });

  it("projects fields", () => {
    const out = filterScanEntries(entries as any, { fields: ["id"] });
    expect(out[0]).toEqual({ id: "a" });
  });

  it("combines filter + fields", () => {
    const out = filterScanEntries(entries as any, {
      filter: { status: "needs_attention" },
      fields: ["id", "attention_score"],
    });
    expect(out).toEqual([{ id: "b", attention_score: 0.9 }]);
  });

  it("passes through with no args", () => {
    const out = filterScanEntries(entries as any, {});
    expect(out).toHaveLength(3);
  });
});
