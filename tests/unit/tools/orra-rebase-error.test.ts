// SKIPPED: orra-rebase.ts still depends on AgentManager/WorktreeManager which are
// being deleted/rewritten in Tasks 7 and 13 (plan: 2026-05-12-orra-on-agents-view.md).
// Task 13 will rewrite orra-rebase.ts to resolve the worktree path from `git worktree list`
// directly, and update these tests accordingly.
import { describe, it } from "vitest";

describe("orra_rebase error envelope (skipped, owned by Task 13)", () => {
  it.skip("returns {ok:false,error} with isError:true when rebase throws — Task 13", () => {});
});
