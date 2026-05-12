// SKIPPED: AgentManager is being deleted in Task 7 (plan: 2026-05-12-orra-on-agents-view.md).
// These tests tested the old headless-process lifecycle (saveAgent/loadAgent/reconcile/unblock)
// which has been replaced by the Agents View daemon. Task 7 will remove agent-manager.ts
// and these tests will be deleted then.
import { describe, it } from "vitest";

describe("Agent Lifecycle (integration) — skipped, owned by Task 7", () => {
  it.skip("initialize .orra directory structure — Task 7", () => {});
  it.skip("return null for non-existent agent — Task 7", () => {});
  it.skip("throw when stopping non-existent agent — Task 7", () => {});
  it.skip("throw when unblocking non-existent agent — Task 7", () => {});
});
