import { describe, it, expect } from "vitest";
import { NormalizedIssueSchema } from "../../src/core/types/normalized-issue.js";

describe("NormalizedIssueSchema", () => {
  it("accepts a minimal valid issue", () => {
    const result = NormalizedIssueSchema.safeParse({
      id: "uuid-1",
      identifier: "AUTH-142",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a full Symphony-shaped issue", () => {
    const result = NormalizedIssueSchema.safeParse({
      id: "uuid-1",
      identifier: "AUTH-142",
      title: "Refresh JWT on tab focus",
      description: "...",
      priority: 2,
      state: "in progress",
      branch_name: "bjorn/auth-142-jwt-refresh",
      url: "https://linear.app/x/issue/AUTH-142",
      labels: ["auth", "p2"],
      blocked_by: [{ id: "uuid-2", identifier: "AUTH-100", state: "todo" }],
      created_at: "2026-04-30T12:00:00Z",
      updated_at: "2026-05-07T09:14:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an issue missing id", () => {
    const result = NormalizedIssueSchema.safeParse({ identifier: "AUTH-142" });
    expect(result.success).toBe(false);
  });

  it("rejects an issue missing identifier", () => {
    const result = NormalizedIssueSchema.safeParse({ id: "uuid-1" });
    expect(result.success).toBe(false);
  });

  it("rejects empty id or identifier", () => {
    expect(NormalizedIssueSchema.safeParse({ id: "", identifier: "X-1" }).success).toBe(false);
    expect(NormalizedIssueSchema.safeParse({ id: "uuid-1", identifier: "" }).success).toBe(false);
  });

  it("normalizes labels and state to lowercase", () => {
    const result = NormalizedIssueSchema.safeParse({
      id: "uuid-1",
      identifier: "AUTH-142",
      state: "In Progress",
      labels: ["AUTH", "P2"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.state).toBe("in progress");
      expect(result.data.labels).toEqual(["auth", "p2"]);
    }
  });
});
