// SKIPPED: AgentManager.spawnAgent is being replaced in Task 11 (plan: 2026-05-12-orra-on-agents-view.md).
// The old detached `claude --print` spawn path is replaced by `claude --bg` via claude-cli.ts.
// Task 11 rewrites orra-spawn.ts and replaces these tests with integration tests
// that use the daemon (gated on `claude` being on PATH).
import { describe, it } from "vitest";

describe("AgentManager.spawnAgent — existing worktree (skipped, owned by Task 11)", () => {
  it.skip("spawns a process and writes initial state — Task 11", () => {});
  it.skip("captures stdout to the log file — Task 11", () => {});
  it.skip("updates state to completed on exit code 0 — Task 11", () => {});
  it.skip("updates state to failed on non-zero exit — Task 11", () => {});
});

describe("AgentManager.spawnAgent — new worktree (skipped, owned by Task 11)", () => {
  it.skip("creates a new worktree when worktreeId is omitted — Task 11", () => {});
  it.skip("respects a custom branch name — Task 11", () => {});
});

describe("AgentManager.spawnAgent — concurrency limit (skipped, owned by Task 11)", () => {
  it.skip("throws ConcurrencyLimitError when at limit — Task 11", () => {});
  it.skip("allows spawning again once a slot frees up — Task 11", () => {});
});
