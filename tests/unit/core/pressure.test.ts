import { describe, it, expect } from "vitest";
import { computePressure } from "../../../src/core/pressure.js";

describe("pressure", () => {
  it("returns 0 for fresh session", () => {
    const p = computePressure({
      session_started_at: "2026-04-20T09:00:00Z",
      tick_count: 0,
      now: "2026-04-20T09:00:01Z",
    });
    expect(p.score).toBeLessThan(0.01);
    expect(p.recommend_compact).toBe(false);
  });

  it("recommends compact at tick_count >= 40", () => {
    const p = computePressure({
      session_started_at: "2026-04-20T09:00:00Z",
      tick_count: 40,
      now: "2026-04-20T09:30:00Z",
    });
    expect(p.score).toBeGreaterThanOrEqual(0.6);
    expect(p.recommend_compact).toBe(true);
    expect(p.reason).toContain("tick_count");
  });

  it("recommends compact at 2.5h elapsed even with low tick count", () => {
    const p = computePressure({
      session_started_at: "2026-04-20T09:00:00Z",
      tick_count: 3,
      now: "2026-04-20T11:30:00Z",
    });
    expect(p.score).toBeGreaterThanOrEqual(0.6);
    expect(p.recommend_compact).toBe(true);
    expect(p.reason).toContain("minutes");
  });
});
