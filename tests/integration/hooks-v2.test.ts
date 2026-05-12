// SKIPPED: The file-based hook communication (writeQuestion/pollForAnswer/writeTurnComplete)
// has been removed in Task 8. The PermissionRequest hook is no longer used — blocked agents
// are handled via `claude attach <shortId>` in the Agents View. The agent state file
// lifecycle is owned by the daemon, not by Orra's hook script.
// These tests are deleted as part of Task 8 (plan: 2026-05-12-orra-on-agents-view.md).
import { describe, it } from "vitest";

describe("File-based hook communication (skipped, removed in Task 8)", () => {
  it.skip("writeQuestion — removed in Task 8", () => {});
  it.skip("pollForAnswer — removed in Task 8", () => {});
  it.skip("writeTurnComplete — removed in Task 8", () => {});
  it.skip("timeout deny — removed in Task 8", () => {});
  it.skip("should update agent state to idle — removed in Task 8", () => {});
});
