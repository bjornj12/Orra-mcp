import { describe, it, expect } from "vitest";
import { renderResumeMd } from "../../../src/core/resume-md.js";
import { initialSessionState } from "../../../src/core/session-state.js";

describe("resume-md", () => {
  it("renders a minimal fresh state", () => {
    const s = initialSessionState({ session_id: "s1", now: "2026-04-20T09:00:00Z" });
    const md = renderResumeMd(s, []);
    expect(md).toContain("# Orra Session Resume");
    expect(md).toContain("Session started 2026-04-20T09:00:00Z");
    expect(md).toContain("0 ticks");
    expect(md).toContain("No open threads");
  });

  it("renders open threads", () => {
    const s = {
      ...initialSessionState({ session_id: "s1", now: "2026-04-20T09:00:00Z" }),
      tick_count: 42,
      open_threads: [
        { id: "t1", topic: "rebase ENG-412", status: "waiting_on_user", since: "2026-04-20T13:22:00Z" },
      ],
    };
    const md = renderResumeMd(s, []);
    expect(md).toContain("42 ticks");
    expect(md).toContain("rebase ENG-412");
    expect(md).toContain("waiting_on_user");
  });

  it("lists recent digests", () => {
    const s = initialSessionState({ session_id: "s1", now: "2026-04-20T09:00:00Z" });
    const md = renderResumeMd(s, [
      { ts: "2026-04-20T14:40:00Z", directive_id: "pr-shepherd", digest: "3 PRs, 1 mergeable", cache_bytes: 100, ok: true },
    ]);
    expect(md).toContain("pr-shepherd");
    expect(md).toContain("3 PRs, 1 mergeable");
  });
});
