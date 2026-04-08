# Orra MCP v2 Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surgically refactor Orra MCP v1 into v2 — replacing sockets/linker/agent-mode with an awareness engine, file-based hooks, and 7 individual MCP tools.

**Architecture:** The MCP is always the orchestrator. Claude is the decision engine. The MCP provides awareness (scan worktrees via git/filesystem/GitHub) and actions (spawn, kill, message, unblock, rebase). Agents are plain Claude Code sessions that report state via hooks writing to `.orra/` files. No sockets, no registration, no chaining DSL.

**Tech Stack:** TypeScript, Node.js 20+, `@modelcontextprotocol/sdk`, `node-pty`, `zod`, vitest

---

## File Structure

### New Files
- `src/core/config.ts` — Config reader for `.orra/config.json`
- `src/core/awareness.ts` — Awareness engine: scanAll, inspectOne, enrichWithGitHub, classify
- `src/tools/orra-scan.ts` — MCP tool handler for orra_scan
- `src/tools/orra-inspect.ts` — MCP tool handler for orra_inspect
- `src/tools/orra-spawn.ts` — MCP tool handler for orra_spawn
- `src/tools/orra-kill.ts` — MCP tool handler for orra_kill
- `src/tools/orra-message.ts` — MCP tool handler for orra_message
- `src/tools/orra-unblock.ts` — MCP tool handler for orra_unblock
- `src/tools/orra-rebase.ts` — MCP tool handler for orra_rebase
- `tests/unit/config.test.ts` — Config tests
- `tests/unit/awareness.test.ts` — Awareness engine tests
- `tests/integration/scan.test.ts` — Integration test for scan pipeline
- `tests/integration/hooks-v2.test.ts` — File-based hook communication tests

### Modified Files
- `src/types.ts` — Add v2 types, eventually remove v1 types
- `src/core/state.ts` — Update schema, remove links, add config support
- `src/core/agent-manager.ts` — Slim to action engine (~300 lines)
- `src/core/worktree.ts` — Add rebase method
- `src/core/process.ts` — Add `--agent` persona flag support
- `src/bin/orra-hook.ts` — Rewrite to file-based (no socket)
- `src/index.ts` — Remove mode detection
- `src/server.ts` — Register 7 individual tools

### Deleted Files
- `src/core/socket-server.ts`
- `src/core/socket-client.ts`
- `src/core/linker.ts`
- `src/tools/orra.ts` (consolidated router)
- `src/tools/orra-agent.ts` (agent router)
- `src/tools/register.ts`
- `src/tools/unregister.ts`
- `src/tools/heartbeat.ts`
- `src/tools/link-agents.ts`
- `src/tools/takeover.ts`
- `src/tools/get-agent-status.ts` (replaced by orra_inspect)
- `src/tools/get-agent-output.ts` (replaced by orra_inspect)
- `tests/unit/socket-server.test.ts`
- `tests/unit/socket-client.test.ts`
- `tests/unit/linker.test.ts`
- `tests/integration/external-agent.test.ts`
- `tests/integration/linking.test.ts`
- `tests/integration/hooks.test.ts` (replaced by hooks-v2.test.ts)

---

## Phase 1: Add New (No Old Code Touched)

### Task 1: Add v2 Types

**Files:**
- Modify: `src/types.ts`
- Test: `tests/unit/types.test.ts`

- [ ] **Step 1: Write failing tests for new types**

Add to `tests/unit/types.test.ts`:

```typescript
import { WorktreeStatusSchema, ScanResultSchema, ConfigV2Schema, GitStateSchema, PrStateSchema, AgentStateV2Schema } from "../../src/types.js";

describe("v2 types", () => {
  describe("ConfigV2Schema", () => {
    it("should accept full config", () => {
      const config = ConfigV2Schema.parse({
        markers: ["spec.md", "PRD.md"],
        staleDays: 3,
        worktreeDir: "worktrees",
        driftThreshold: 20,
        defaultModel: "sonnet",
        defaultAgent: "executor",
      });
      expect(config.markers).toEqual(["spec.md", "PRD.md"]);
      expect(config.staleDays).toBe(3);
    });

    it("should apply defaults", () => {
      const config = ConfigV2Schema.parse({});
      expect(config.markers).toEqual(["spec.md", "PRD.md", "PLAN.md", "CHANGELOG.md"]);
      expect(config.staleDays).toBe(3);
      expect(config.worktreeDir).toBe("worktrees");
      expect(config.driftThreshold).toBe(20);
      expect(config.defaultModel).toBeNull();
      expect(config.defaultAgent).toBeNull();
    });
  });

  describe("GitStateSchema", () => {
    it("should accept valid git state", () => {
      const git = GitStateSchema.parse({
        ahead: 8,
        behind: 0,
        uncommitted: 0,
        lastCommit: "2026-04-07T10:00:00Z",
        diffStat: "+120 -34 (4 files)",
      });
      expect(git.ahead).toBe(8);
    });
  });

  describe("PrStateSchema", () => {
    it("should accept valid PR state", () => {
      const pr = PrStateSchema.parse({
        number: 42,
        state: "open",
        reviews: "approved",
        ci: "passing",
        mergeable: true,
      });
      expect(pr.number).toBe(42);
    });
  });

  describe("WorktreeStatusSchema", () => {
    it("should accept valid status", () => {
      expect(WorktreeStatusSchema.parse("ready_to_land")).toBe("ready_to_land");
      expect(WorktreeStatusSchema.parse("needs_attention")).toBe("needs_attention");
      expect(WorktreeStatusSchema.parse("in_progress")).toBe("in_progress");
      expect(WorktreeStatusSchema.parse("idle")).toBe("idle");
      expect(WorktreeStatusSchema.parse("stale")).toBe("stale");
    });

    it("should reject invalid status", () => {
      expect(() => WorktreeStatusSchema.parse("unknown")).toThrow();
    });
  });

  describe("AgentStateV2Schema", () => {
    it("should accept agent state with pendingQuestion and agentPersona", () => {
      const agent = AgentStateV2Schema.parse({
        id: "billing-refac",
        task: "Refactor billing",
        branch: "feat/billing-refactor",
        worktree: "worktrees/billing-refac",
        pid: 48291,
        status: "running",
        agentPersona: "executor",
        model: "sonnet",
        createdAt: "2026-04-06T14:30:00.000Z",
        updatedAt: "2026-04-07T09:15:00.000Z",
        exitCode: null,
        pendingQuestion: null,
      });
      expect(agent.agentPersona).toBe("executor");
      expect(agent.pendingQuestion).toBeNull();
    });

    it("should accept agent state with pending question object", () => {
      const agent = AgentStateV2Schema.parse({
        id: "ui-rewrite",
        task: "Rewrite UI",
        branch: "feat/ui-rewrite",
        worktree: "worktrees/ui-rewrite",
        pid: 12345,
        status: "waiting",
        agentPersona: null,
        model: null,
        createdAt: "2026-04-06T14:30:00.000Z",
        updatedAt: "2026-04-06T14:35:00.000Z",
        exitCode: null,
        pendingQuestion: { tool: "Bash", input: { command: "git push" } },
      });
      expect(agent.pendingQuestion).toEqual({ tool: "Bash", input: { command: "git push" } });
    });
  });

  describe("ScanResultSchema", () => {
    it("should accept valid scan result", () => {
      const result = ScanResultSchema.parse({
        worktrees: [{
          id: "auth-fix",
          path: "worktrees/auth-fix",
          branch: "feat/auth-fix",
          status: "ready_to_land",
          git: { ahead: 8, behind: 0, uncommitted: 0, lastCommit: "2026-04-07T10:00:00Z", diffStat: "+120 -34 (4 files)" },
          markers: ["spec.md"],
          pr: { number: 42, state: "open", reviews: "approved", ci: "passing", mergeable: true },
          agent: null,
          flags: [],
        }],
        summary: { ready_to_land: 1, needs_attention: 0, in_progress: 0, idle: 0, stale: 0, total: 1 },
      });
      expect(result.worktrees).toHaveLength(1);
      expect(result.summary.total).toBe(1);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/types.test.ts`
Expected: FAIL — imports don't exist yet

- [ ] **Step 3: Add v2 types to src/types.ts**

Append to `src/types.ts` (keep all existing v1 types for now):

```typescript
// === v2 Types ===

export const ConfigV2Schema = z.object({
  markers: z.array(z.string()).default(["spec.md", "PRD.md", "PLAN.md", "CHANGELOG.md"]),
  staleDays: z.number().default(3),
  worktreeDir: z.string().default("worktrees"),
  driftThreshold: z.number().default(20),
  defaultModel: z.string().nullable().default(null),
  defaultAgent: z.string().nullable().default(null),
});
export type ConfigV2 = z.infer<typeof ConfigV2Schema>;

export const GitStateSchema = z.object({
  ahead: z.number(),
  behind: z.number(),
  uncommitted: z.number(),
  lastCommit: z.string(),
  diffStat: z.string(),
});
export type GitState = z.infer<typeof GitStateSchema>;

export const PrStateSchema = z.object({
  number: z.number(),
  state: z.string(),
  reviews: z.string(),
  ci: z.string(),
  mergeable: z.boolean(),
});
export type PrState = z.infer<typeof PrStateSchema>;

export const WorktreeStatusSchema = z.enum([
  "ready_to_land",
  "needs_attention",
  "in_progress",
  "idle",
  "stale",
]);
export type WorktreeStatus = z.infer<typeof WorktreeStatusSchema>;

export const PendingQuestionSchema = z.object({
  tool: z.string(),
  input: z.record(z.string(), z.unknown()),
});
export type PendingQuestion = z.infer<typeof PendingQuestionSchema>;

export const AgentStateV2Schema = z.object({
  id: z.string(),
  task: z.string(),
  branch: z.string(),
  worktree: z.string(),
  pid: z.number(),
  status: AgentStatus,
  agentPersona: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  exitCode: z.number().nullable(),
  pendingQuestion: PendingQuestionSchema.nullable(),
});
export type AgentStateV2 = z.infer<typeof AgentStateV2Schema>;

export const WorktreeScanEntrySchema = z.object({
  id: z.string(),
  path: z.string(),
  branch: z.string(),
  status: WorktreeStatusSchema,
  git: GitStateSchema,
  markers: z.array(z.string()),
  pr: PrStateSchema.nullable(),
  agent: AgentStateV2Schema.nullable(),
  flags: z.array(z.string()),
});
export type WorktreeScanEntry = z.infer<typeof WorktreeScanEntrySchema>;

export const ScanSummarySchema = z.object({
  ready_to_land: z.number(),
  needs_attention: z.number(),
  in_progress: z.number(),
  idle: z.number(),
  stale: z.number(),
  total: z.number(),
});
export type ScanSummary = z.infer<typeof ScanSummarySchema>;

export const ScanResultSchema = z.object({
  worktrees: z.array(WorktreeScanEntrySchema),
  summary: ScanSummarySchema,
});
export type ScanResult = z.infer<typeof ScanResultSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/types.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite to verify nothing broke**

Run: `npm test`
Expected: All 132 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/types.ts tests/unit/types.test.ts
git commit -m "feat: add v2 types (ConfigV2, GitState, PrState, WorktreeStatus, ScanResult, AgentStateV2)"
```

---

### Task 2: Config System

**Files:**
- Create: `src/core/config.ts`
- Create: `tests/unit/config.test.ts`

- [ ] **Step 1: Write failing tests for config**

Create `tests/unit/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig, type ConfigV2 } from "../../src/core/config.js";

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-config-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return defaults when no config file exists", async () => {
    const config = await loadConfig(tmpDir);
    expect(config.markers).toEqual(["spec.md", "PRD.md", "PLAN.md", "CHANGELOG.md"]);
    expect(config.staleDays).toBe(3);
    expect(config.worktreeDir).toBe("worktrees");
    expect(config.driftThreshold).toBe(20);
    expect(config.defaultModel).toBeNull();
    expect(config.defaultAgent).toBeNull();
  });

  it("should read config from .orra/config.json", async () => {
    const orraDir = path.join(tmpDir, ".orra");
    fs.mkdirSync(orraDir, { recursive: true });
    fs.writeFileSync(path.join(orraDir, "config.json"), JSON.stringify({
      markers: ["spec.md", "README.md"],
      staleDays: 7,
      driftThreshold: 50,
      defaultModel: "opus",
    }));

    const config = await loadConfig(tmpDir);
    expect(config.markers).toEqual(["spec.md", "README.md"]);
    expect(config.staleDays).toBe(7);
    expect(config.driftThreshold).toBe(50);
    expect(config.defaultModel).toBe("opus");
    // Defaults for unset fields
    expect(config.worktreeDir).toBe("worktrees");
    expect(config.defaultAgent).toBeNull();
  });

  it("should handle invalid JSON gracefully", async () => {
    const orraDir = path.join(tmpDir, ".orra");
    fs.mkdirSync(orraDir, { recursive: true });
    fs.writeFileSync(path.join(orraDir, "config.json"), "not json");

    const config = await loadConfig(tmpDir);
    expect(config.markers).toEqual(["spec.md", "PRD.md", "PLAN.md", "CHANGELOG.md"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/config.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement config module**

Create `src/core/config.ts`:

```typescript
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ConfigV2Schema, type ConfigV2 } from "../types.js";

export type { ConfigV2 };

export async function loadConfig(projectRoot: string): Promise<ConfigV2> {
  const configPath = path.join(projectRoot, ".orra", "config.json");
  try {
    const data = await fs.readFile(configPath, "utf-8");
    return ConfigV2Schema.parse(JSON.parse(data));
  } catch {
    return ConfigV2Schema.parse({});
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/config.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/config.ts tests/unit/config.test.ts
git commit -m "feat: add v2 config system (loadConfig from .orra/config.json with defaults)"
```

---

### Task 3: Awareness Engine — Status Classification

**Files:**
- Create: `src/core/awareness.ts`
- Create: `tests/unit/awareness.test.ts`

This task builds the classification logic and git/filesystem reading. The awareness engine is the largest new module so we build it in two tasks: classification + git reading first, then GitHub enrichment.

- [ ] **Step 1: Write failing tests for classify and git state reading**

Create `tests/unit/awareness.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { classify, readGitState, scanMarkers, readAgentState, scanAll } from "../../src/core/awareness.js";
import type { WorktreeStatus, GitState, AgentStateV2, PrState } from "../../src/types.js";

describe("classify", () => {
  it("should classify as ready_to_land with approved PR + CI green + low drift", () => {
    const git: GitState = { ahead: 5, behind: 2, uncommitted: 0, lastCommit: new Date().toISOString(), diffStat: "+50 -10 (3 files)" };
    const pr: PrState = { number: 42, state: "open", reviews: "approved", ci: "passing", mergeable: true };
    const result = classify(git, null, pr, { staleDays: 3, driftThreshold: 20 });
    expect(result.status).toBe("ready_to_land");
  });

  it("should classify as needs_attention with pending question", () => {
    const git: GitState = { ahead: 3, behind: 0, uncommitted: 0, lastCommit: new Date().toISOString(), diffStat: "+20 -5 (2 files)" };
    const agent: AgentStateV2 = {
      id: "test", task: "test", branch: "test", worktree: "test", pid: 123,
      status: "waiting", agentPersona: null, model: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      exitCode: null, pendingQuestion: { tool: "Bash", input: { command: "git push" } },
    };
    const result = classify(git, agent, null, { staleDays: 3, driftThreshold: 20 });
    expect(result.status).toBe("needs_attention");
  });

  it("should classify as needs_attention with CI failing", () => {
    const git: GitState = { ahead: 3, behind: 0, uncommitted: 0, lastCommit: new Date().toISOString(), diffStat: "+20 -5 (2 files)" };
    const pr: PrState = { number: 42, state: "open", reviews: "approved", ci: "failure", mergeable: true };
    const result = classify(git, null, pr, { staleDays: 3, driftThreshold: 20 });
    expect(result.status).toBe("needs_attention");
  });

  it("should classify as needs_attention with change requests", () => {
    const git: GitState = { ahead: 3, behind: 0, uncommitted: 0, lastCommit: new Date().toISOString(), diffStat: "+20 -5 (2 files)" };
    const pr: PrState = { number: 42, state: "open", reviews: "changes_requested", ci: "passing", mergeable: true };
    const result = classify(git, null, pr, { staleDays: 3, driftThreshold: 20 });
    expect(result.status).toBe("needs_attention");
  });

  it("should classify as in_progress with running agent", () => {
    const git: GitState = { ahead: 3, behind: 0, uncommitted: 1, lastCommit: new Date().toISOString(), diffStat: "+20 -5 (2 files)" };
    const agent: AgentStateV2 = {
      id: "test", task: "test", branch: "test", worktree: "test", pid: 123,
      status: "running", agentPersona: null, model: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      exitCode: null, pendingQuestion: null,
    };
    const result = classify(git, agent, null, { staleDays: 3, driftThreshold: 20 });
    expect(result.status).toBe("in_progress");
  });

  it("should classify as idle with no agent and recent activity", () => {
    const git: GitState = { ahead: 3, behind: 0, uncommitted: 0, lastCommit: new Date().toISOString(), diffStat: "+20 -5 (2 files)" };
    const result = classify(git, null, null, { staleDays: 3, driftThreshold: 20 });
    expect(result.status).toBe("idle");
  });

  it("should classify as stale with no agent and old activity", () => {
    const oldDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days ago
    const git: GitState = { ahead: 3, behind: 0, uncommitted: 0, lastCommit: oldDate, diffStat: "+20 -5 (2 files)" };
    const result = classify(git, null, null, { staleDays: 3, driftThreshold: 20 });
    expect(result.status).toBe("stale");
  });

  it("should add high_drift flag when behind exceeds threshold", () => {
    const git: GitState = { ahead: 3, behind: 25, uncommitted: 0, lastCommit: new Date().toISOString(), diffStat: "+20 -5 (2 files)" };
    const result = classify(git, null, null, { staleDays: 3, driftThreshold: 20 });
    expect(result.flags).toContain("high_drift");
  });
});

describe("readGitState", () => {
  let tmpDir: string;
  let worktreePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-awareness-test-"));
    execSync("git init", { cwd: tmpDir });
    execSync("git commit --allow-empty -m 'init'", { cwd: tmpDir });

    // Create a worktree with a commit
    worktreePath = path.join(tmpDir, "worktrees", "test-wt");
    execSync(`git worktree add ${worktreePath} -b test-branch`, { cwd: tmpDir });
    fs.writeFileSync(path.join(worktreePath, "file.txt"), "hello");
    execSync("git add file.txt && git commit -m 'add file'", { cwd: worktreePath });
  });

  afterEach(() => {
    try { execSync("git worktree prune", { cwd: tmpDir }); } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should read git state for a worktree", async () => {
    const state = await readGitState(worktreePath, tmpDir);
    expect(state.ahead).toBe(1);
    expect(state.behind).toBe(0);
    expect(state.uncommitted).toBe(0);
    expect(state.lastCommit).toBeTruthy();
    expect(state.diffStat).toContain("file.txt");
  });

  it("should count uncommitted changes", async () => {
    fs.writeFileSync(path.join(worktreePath, "dirty.txt"), "dirty");
    const state = await readGitState(worktreePath, tmpDir);
    expect(state.uncommitted).toBe(1);
  });
});

describe("scanMarkers", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-markers-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should find matching marker files", async () => {
    fs.writeFileSync(path.join(tmpDir, "spec.md"), "# Spec");
    fs.writeFileSync(path.join(tmpDir, "PRD.md"), "# PRD");
    const markers = await scanMarkers(tmpDir, ["spec.md", "PRD.md", "PLAN.md"]);
    expect(markers).toEqual(["spec.md", "PRD.md"]);
  });

  it("should return empty array when no markers found", async () => {
    const markers = await scanMarkers(tmpDir, ["spec.md", "PRD.md"]);
    expect(markers).toEqual([]);
  });
});

describe("readAgentState", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-agent-state-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return null when no agent state file exists", async () => {
    const agent = await readAgentState(tmpDir, "nonexistent");
    expect(agent).toBeNull();
  });

  it("should read agent state and check PID liveness", async () => {
    const agentsDir = path.join(tmpDir, ".orra", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    const agentState = {
      id: "test-agent",
      task: "test",
      branch: "test-branch",
      worktree: "worktrees/test-agent",
      pid: 99999999, // dead PID
      status: "running",
      agentPersona: null,
      model: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      exitCode: null,
      pendingQuestion: null,
    };
    fs.writeFileSync(path.join(agentsDir, "test-agent.json"), JSON.stringify(agentState));

    const agent = await readAgentState(tmpDir, "test-agent");
    // Agent has dead PID, so status should be corrected to interrupted
    expect(agent).not.toBeNull();
    expect(agent!.status).toBe("interrupted");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/awareness.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement awareness engine**

Create `src/core/awareness.ts`:

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  AgentStateV2Schema,
  type AgentStateV2,
  type GitState,
  type PrState,
  type WorktreeStatus,
  type WorktreeScanEntry,
  type ScanResult,
  type ConfigV2,
} from "../types.js";
import { loadConfig } from "./config.js";

const execFileAsync = promisify(execFile);

function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function classify(
  git: GitState,
  agent: AgentStateV2 | null,
  pr: PrState | null,
  opts: { staleDays: number; driftThreshold: number },
): { status: WorktreeStatus; flags: string[] } {
  const flags: string[] = [];

  if (git.behind > opts.driftThreshold) {
    flags.push("high_drift");
  }

  // needs_attention: agent blocked or PR has issues
  if (agent?.status === "waiting" && agent.pendingQuestion) {
    return { status: "needs_attention", flags };
  }
  if (pr && (pr.reviews === "changes_requested" || pr.ci === "failure")) {
    return { status: "needs_attention", flags };
  }

  // ready_to_land: PR approved + CI green + mergeable + low drift
  if (pr && pr.reviews === "approved" && pr.ci === "passing" && pr.mergeable && git.behind <= 5) {
    return { status: "ready_to_land", flags };
  }

  // in_progress: agent running + not blocked
  if (agent && (agent.status === "running" || agent.status === "idle")) {
    return { status: "in_progress", flags };
  }

  // stale vs idle: based on last commit age
  const lastCommitDate = new Date(git.lastCommit);
  const daysSinceCommit = (Date.now() - lastCommitDate.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceCommit >= opts.staleDays && !agent) {
    return { status: "stale", flags };
  }

  return { status: "idle", flags };
}

export async function readGitState(worktreePath: string, mainRepoPath: string): Promise<GitState> {
  const branch = await execFileAsync("git", ["-C", worktreePath, "rev-parse", "--abbrev-ref", "HEAD"]).then(r => r.stdout.trim());
  const mainBranch = await getMainBranch(mainRepoPath);

  const [aheadResult, behindResult, statusResult, logResult, diffResult] = await Promise.all([
    execFileAsync("git", ["-C", worktreePath, "rev-list", "--count", `${mainBranch}..${branch}`]).catch(() => ({ stdout: "0" })),
    execFileAsync("git", ["-C", worktreePath, "rev-list", "--count", `${branch}..${mainBranch}`]).catch(() => ({ stdout: "0" })),
    execFileAsync("git", ["-C", worktreePath, "status", "--porcelain"]).catch(() => ({ stdout: "" })),
    execFileAsync("git", ["-C", worktreePath, "log", "-1", "--format=%cI"]).catch(() => ({ stdout: new Date().toISOString() })),
    execFileAsync("git", ["-C", worktreePath, "diff", "--stat", `${mainBranch}...${branch}`]).catch(() => ({ stdout: "" })),
  ]);

  const uncommittedLines = statusResult.stdout.trim().split("\n").filter(l => l.length > 0);

  return {
    ahead: parseInt(aheadResult.stdout.trim(), 10) || 0,
    behind: parseInt(behindResult.stdout.trim(), 10) || 0,
    uncommitted: uncommittedLines.length,
    lastCommit: logResult.stdout.trim(),
    diffStat: diffResult.stdout.trim().split("\n").pop()?.trim() || "",
  };
}

async function getMainBranch(repoPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "rev-parse", "--verify", "main"], { timeout: 3000 });
    if (stdout.trim()) return "main";
  } catch {}
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "rev-parse", "--verify", "master"], { timeout: 3000 });
    if (stdout.trim()) return "master";
  } catch {}
  return "main";
}

export async function scanMarkers(worktreePath: string, markers: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const marker of markers) {
    try {
      await fs.access(path.join(worktreePath, marker));
      found.push(marker);
    } catch {}
  }
  return found;
}

export async function readAgentState(projectRoot: string, agentId: string): Promise<AgentStateV2 | null> {
  const filePath = path.join(projectRoot, ".orra", "agents", `${agentId}.json`);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    const agent = AgentStateV2Schema.parse(JSON.parse(data));

    // Check PID liveness — correct status if process is dead
    if (agent.status === "running" && !pidIsAlive(agent.pid)) {
      agent.status = "interrupted";
    }

    return agent;
  } catch {
    return null;
  }
}

interface ParsedWorktree {
  path: string;
  branch: string;
}

async function listWorktrees(projectRoot: string): Promise<ParsedWorktree[]> {
  const { stdout } = await execFileAsync("git", ["worktree", "list", "--porcelain"], {
    cwd: projectRoot,
  });

  const entries: ParsedWorktree[] = [];
  const blocks = stdout.split("\n\n");

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const worktreeLine = lines.find(l => l.startsWith("worktree "));
    const branchLine = lines.find(l => l.startsWith("branch "));

    if (worktreeLine && branchLine) {
      const wtPath = worktreeLine.replace("worktree ", "");
      const branch = branchLine.replace("branch refs/heads/", "");

      // Filter out the main repo worktree
      if (path.resolve(wtPath) !== path.resolve(projectRoot)) {
        entries.push({ path: wtPath, branch });
      }
    }
  }

  return entries;
}

function worktreeIdFromPath(wtPath: string): string {
  return path.basename(wtPath);
}

export async function enrichWithGitHub(
  worktrees: { branch: string }[],
): Promise<Map<string, PrState>> {
  const prMap = new Map<string, PrState>();

  for (const wt of worktrees) {
    try {
      const { stdout } = await execFileAsync("gh", [
        "pr", "list",
        "--head", wt.branch,
        "--json", "number,state,reviews,statusCheckRollup,mergeable",
        "--limit", "1",
      ], { timeout: 10000 });

      const prs = JSON.parse(stdout);
      if (prs.length > 0) {
        const pr = prs[0];
        const reviews = pr.reviews?.length > 0
          ? (pr.reviews.some((r: { state: string }) => r.state === "CHANGES_REQUESTED") ? "changes_requested"
            : pr.reviews.some((r: { state: string }) => r.state === "APPROVED") ? "approved" : "pending")
          : "none";
        const ci = pr.statusCheckRollup?.length > 0
          ? (pr.statusCheckRollup.every((c: { conclusion: string }) => c.conclusion === "SUCCESS") ? "passing" : "failure")
          : "unknown";

        prMap.set(wt.branch, {
          number: pr.number,
          state: pr.state?.toLowerCase() ?? "open",
          reviews,
          ci,
          mergeable: pr.mergeable === "MERGEABLE",
        });
      }
    } catch {
      // gh CLI not available or not authenticated — skip silently
    }
  }

  return prMap;
}

export async function scanAll(projectRoot: string): Promise<ScanResult> {
  const config = await loadConfig(projectRoot);
  const worktrees = await listWorktrees(projectRoot);

  // Fetch GitHub PR data for all branches in parallel
  let prMap: Map<string, PrState>;
  try {
    prMap = await enrichWithGitHub(worktrees);
  } catch {
    prMap = new Map();
  }

  // Scan each worktree in parallel
  const entries: WorktreeScanEntry[] = await Promise.all(
    worktrees.map(async (wt) => {
      const id = worktreeIdFromPath(wt.path);
      const [git, markers, agent] = await Promise.all([
        readGitState(wt.path, projectRoot),
        scanMarkers(wt.path, config.markers),
        readAgentState(projectRoot, id),
      ]);

      const pr = prMap.get(wt.branch) ?? null;
      const { status, flags } = classify(git, agent, pr, {
        staleDays: config.staleDays,
        driftThreshold: config.driftThreshold,
      });

      return {
        id,
        path: wt.path,
        branch: wt.branch,
        status,
        git,
        markers,
        pr,
        agent,
        flags,
      };
    }),
  );

  const summary = {
    ready_to_land: entries.filter(e => e.status === "ready_to_land").length,
    needs_attention: entries.filter(e => e.status === "needs_attention").length,
    in_progress: entries.filter(e => e.status === "in_progress").length,
    idle: entries.filter(e => e.status === "idle").length,
    stale: entries.filter(e => e.status === "stale").length,
    total: entries.length,
  };

  return { worktrees: entries, summary };
}

export async function inspectOne(
  projectRoot: string,
  worktreeId: string,
): Promise<WorktreeScanEntry & { commitLog: string; markerContents: Record<string, string>; agentOutputTail: string; conflictFiles: string[] }> {
  const config = await loadConfig(projectRoot);
  const worktrees = await listWorktrees(projectRoot);
  const wt = worktrees.find(w => worktreeIdFromPath(w.path) === worktreeId);

  if (!wt) {
    throw new Error(`Worktree ${worktreeId} not found`);
  }

  const mainBranch = await getMainBranch(projectRoot);

  const [git, markers, agent] = await Promise.all([
    readGitState(wt.path, projectRoot),
    scanMarkers(wt.path, config.markers),
    readAgentState(projectRoot, worktreeId),
  ]);

  // GitHub enrichment for single branch
  let pr: PrState | null = null;
  try {
    const prMap = await enrichWithGitHub([wt]);
    pr = prMap.get(wt.branch) ?? null;
  } catch {}

  const { status, flags } = classify(git, agent, pr, {
    staleDays: config.staleDays,
    driftThreshold: config.driftThreshold,
  });

  // Full commit log vs main
  let commitLog = "";
  try {
    const { stdout } = await execFileAsync("git", ["-C", wt.path, "log", "--oneline", `${mainBranch}..${wt.branch}`]);
    commitLog = stdout.trim();
  } catch {}

  // Marker file contents (first 50 lines each)
  const markerContents: Record<string, string> = {};
  for (const marker of markers) {
    try {
      const content = await fs.readFile(path.join(wt.path, marker), "utf-8");
      const lines = content.split("\n").slice(0, 50);
      markerContents[marker] = lines.join("\n");
    } catch {}
  }

  // Agent output tail
  let agentOutputTail = "";
  try {
    const logPath = path.join(projectRoot, ".orra", "agents", `${worktreeId}.log`);
    const content = await fs.readFile(logPath, "utf-8");
    const lines = content.split("\n").filter(l => l.length > 0);
    agentOutputTail = lines.slice(-50).join("\n");
  } catch {}

  // Conflict prediction: files modified in both branch and main since diverge point
  const conflictFiles: string[] = [];
  try {
    const mergeBase = await execFileAsync("git", ["-C", wt.path, "merge-base", mainBranch, wt.branch]).then(r => r.stdout.trim());
    const [branchFiles, mainFiles] = await Promise.all([
      execFileAsync("git", ["-C", wt.path, "diff", "--name-only", `${mergeBase}..${wt.branch}`]).then(r => r.stdout.trim().split("\n").filter(Boolean)),
      execFileAsync("git", ["-C", wt.path, "diff", "--name-only", `${mergeBase}..${mainBranch}`]).then(r => r.stdout.trim().split("\n").filter(Boolean)),
    ]);
    const mainSet = new Set(mainFiles);
    for (const f of branchFiles) {
      if (mainSet.has(f)) conflictFiles.push(f);
    }
  } catch {}

  return {
    id: worktreeId,
    path: wt.path,
    branch: wt.branch,
    status,
    git,
    markers,
    pr,
    agent,
    flags,
    commitLog,
    markerContents,
    agentOutputTail,
    conflictFiles,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/awareness.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/awareness.ts tests/unit/awareness.test.ts
git commit -m "feat: add awareness engine (classify, readGitState, scanMarkers, scanAll, inspectOne)"
```

---

### Task 4: Rebase Logic

**Files:**
- Modify: `src/core/worktree.ts`
- Modify: `tests/unit/worktree.test.ts`

- [ ] **Step 1: Write failing test for rebase**

Add to `tests/unit/worktree.test.ts`:

```typescript
describe("rebase", () => {
  it("should rebase worktree branch on main", async () => {
    // Create a worktree with a commit
    const result = await wt.create("rebase-test");

    // Make a commit on main so there's something to rebase onto
    fs.writeFileSync(path.join(tmpDir, "main-file.txt"), "from main");
    execSync("git add main-file.txt && git commit -m 'main commit'", { cwd: tmpDir });

    // Make a commit on the worktree branch
    fs.writeFileSync(path.join(result.worktreePath, "branch-file.txt"), "from branch");
    execSync("git add branch-file.txt && git commit -m 'branch commit'", { cwd: result.worktreePath });

    const rebaseResult = await wt.rebase("rebase-test");
    expect(rebaseResult.success).toBe(true);
    expect(rebaseResult.conflicts).toEqual([]);

    // Verify the main commit is now in the worktree branch history
    const log = execSync("git log --oneline", { cwd: result.worktreePath }).toString();
    expect(log).toContain("main commit");
    expect(log).toContain("branch commit");
  });

  it("should report conflicts on rebase failure", async () => {
    // Create a worktree
    const result = await wt.create("conflict-test");

    // Both main and branch modify the same file
    fs.writeFileSync(path.join(tmpDir, "shared.txt"), "main version");
    execSync("git add shared.txt && git commit -m 'main change'", { cwd: tmpDir });

    fs.writeFileSync(path.join(result.worktreePath, "shared.txt"), "branch version");
    execSync("git add shared.txt && git commit -m 'branch change'", { cwd: result.worktreePath });

    const rebaseResult = await wt.rebase("conflict-test");
    expect(rebaseResult.success).toBe(false);
    expect(rebaseResult.conflicts.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/worktree.test.ts`
Expected: FAIL — `wt.rebase` doesn't exist

- [ ] **Step 3: Implement rebase method**

Add to `src/core/worktree.ts` inside the `WorktreeManager` class:

```typescript
async rebase(agentId: string): Promise<{ success: boolean; conflicts: string[] }> {
  const worktreePath = path.join(this.projectRoot, "worktrees", agentId);

  // Fetch latest main
  try {
    await execFileAsync("git", ["-C", this.projectRoot, "fetch", "origin", "main"], { timeout: 30000 });
  } catch {
    // Fetch may fail if no remote — continue with local main
  }

  // Attempt rebase
  try {
    const branch = await execFileAsync("git", ["-C", worktreePath, "rev-parse", "--abbrev-ref", "HEAD"]).then(r => r.stdout.trim());
    const mainBranch = await this.getMainBranch();
    await execFileAsync("git", ["-C", worktreePath, "rebase", mainBranch]);
    return { success: true, conflicts: [] };
  } catch (err) {
    // Rebase failed — check for conflicts
    const conflicts: string[] = [];
    try {
      const { stdout } = await execFileAsync("git", ["-C", worktreePath, "diff", "--name-only", "--diff-filter=U"]);
      conflicts.push(...stdout.trim().split("\n").filter(Boolean));
    } catch {}

    // Abort the failed rebase
    try {
      await execFileAsync("git", ["-C", worktreePath, "rebase", "--abort"]);
    } catch {}

    return { success: false, conflicts };
  }
}

private async getMainBranch(): Promise<string> {
  try {
    await execFileAsync("git", ["-C", this.projectRoot, "rev-parse", "--verify", "main"], { timeout: 3000 });
    return "main";
  } catch {}
  try {
    await execFileAsync("git", ["-C", this.projectRoot, "rev-parse", "--verify", "master"], { timeout: 3000 });
    return "master";
  } catch {}
  return "main";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/worktree.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/worktree.ts tests/unit/worktree.test.ts
git commit -m "feat: add rebase method to WorktreeManager (fetch main, rebase, report conflicts)"
```

---

## Phase 2: Switch Hooks (Critical Migration)

### Task 5: Rewrite Hook to File-Based Communication

**Files:**
- Modify: `src/bin/orra-hook.ts`
- Create: `tests/integration/hooks-v2.test.ts`
- Modify: `tests/unit/orra-hook.test.ts`

- [ ] **Step 1: Write failing tests for file-based hook**

Create `tests/integration/hooks-v2.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { writeQuestion, pollForAnswer, writeTurnComplete } from "../../src/bin/orra-hook.js";

describe("File-based hook communication", () => {
  let tmpDir: string;
  let agentsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-hook-v2-test-"));
    agentsDir = path.join(tmpDir, ".orra", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });

    // Create initial agent state file
    const agentState = {
      id: "test-agent",
      task: "test task",
      branch: "test-branch",
      worktree: "worktrees/test-agent",
      pid: process.pid,
      status: "running",
      agentPersona: null,
      model: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      exitCode: null,
      pendingQuestion: null,
    };
    fs.writeFileSync(path.join(agentsDir, "test-agent.json"), JSON.stringify(agentState));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("writeQuestion", () => {
    it("should write pendingQuestion to agent state file", async () => {
      await writeQuestion(tmpDir, "test-agent", "Bash", { command: "git push" });

      const data = JSON.parse(fs.readFileSync(path.join(agentsDir, "test-agent.json"), "utf-8"));
      expect(data.status).toBe("waiting");
      expect(data.pendingQuestion).toEqual({ tool: "Bash", input: { command: "git push" } });
    });
  });

  describe("pollForAnswer", () => {
    it("should resolve when answer file appears with allow", async () => {
      // Write the answer file after a short delay
      setTimeout(() => {
        const answerPath = path.join(agentsDir, "test-agent.answer.json");
        const tmpPath = answerPath + ".tmp";
        fs.writeFileSync(tmpPath, JSON.stringify({ allow: true }));
        fs.renameSync(tmpPath, answerPath);
      }, 50);

      const answer = await pollForAnswer(tmpDir, "test-agent", 2000, 20);
      expect(answer.allow).toBe(true);

      // Answer file should be cleaned up
      expect(fs.existsSync(path.join(agentsDir, "test-agent.answer.json"))).toBe(false);
    });

    it("should resolve with deny when answer file has allow: false", async () => {
      setTimeout(() => {
        const answerPath = path.join(agentsDir, "test-agent.answer.json");
        const tmpPath = answerPath + ".tmp";
        fs.writeFileSync(tmpPath, JSON.stringify({ allow: false, reason: "Not safe" }));
        fs.renameSync(tmpPath, answerPath);
      }, 50);

      const answer = await pollForAnswer(tmpDir, "test-agent", 2000, 20);
      expect(answer.allow).toBe(false);
      expect(answer.reason).toBe("Not safe");
    });

    it("should timeout and return deny if no answer file appears", async () => {
      const answer = await pollForAnswer(tmpDir, "test-agent", 100, 20);
      expect(answer.allow).toBe(false);
    });
  });

  describe("writeTurnComplete", () => {
    it("should update agent state to idle", async () => {
      await writeTurnComplete(tmpDir, "test-agent");

      const data = JSON.parse(fs.readFileSync(path.join(agentsDir, "test-agent.json"), "utf-8"));
      expect(data.status).toBe("idle");
      expect(data.pendingQuestion).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/integration/hooks-v2.test.ts`
Expected: FAIL — functions don't exist

- [ ] **Step 3: Rewrite hook to file-based**

Replace `src/bin/orra-hook.ts` entirely:

```typescript
#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

// --- Exported helpers for testing ---

export function resolveAgentId(env: Record<string, string | undefined>, projectRoot: string): string | null {
  if (env.ORRA_AGENT_ID) return env.ORRA_AGENT_ID;

  const selfIdPath = path.join(projectRoot, ".orra", "agents", "self.id");
  try {
    return fs.readFileSync(selfIdPath, "utf-8").trim();
  } catch {
    return null;
  }
}

export function buildPermissionResponse(allow: boolean): object {
  return {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: { behavior: allow ? "allow" : "deny" },
    },
  };
}

export function parseAllowDeny(input: string): boolean {
  const lower = input.trim().toLowerCase();
  return ["yes", "y", "allow", "approve", "ok"].includes(lower);
}

function resolveStateDir(env: Record<string, string | undefined>, worktreeRoot: string): string {
  if (env.ORRA_STATE_DIR) return env.ORRA_STATE_DIR;
  const mainRoot = findMainRepoRoot(worktreeRoot);
  return path.join(mainRoot, ".orra");
}

// --- File-based communication ---

export async function writeQuestion(
  projectRoot: string,
  agentId: string,
  tool: string,
  input: Record<string, unknown>,
): Promise<void> {
  const agentFile = path.join(projectRoot, ".orra", "agents", `${agentId}.json`);
  const data = JSON.parse(fs.readFileSync(agentFile, "utf-8"));
  data.status = "waiting";
  data.updatedAt = new Date().toISOString();
  data.pendingQuestion = { tool, input };

  // Atomic write
  const tmpFile = agentFile + ".tmp";
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  fs.renameSync(tmpFile, agentFile);
}

export async function pollForAnswer(
  projectRoot: string,
  agentId: string,
  timeoutMs: number = 300000,
  intervalMs: number = 100,
): Promise<{ allow: boolean; reason?: string }> {
  const answerPath = path.join(projectRoot, ".orra", "agents", `${agentId}.answer.json`);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const data = fs.readFileSync(answerPath, "utf-8");
      const answer = JSON.parse(data);

      // Clean up answer file
      try { fs.unlinkSync(answerPath); } catch {}

      return { allow: !!answer.allow, reason: answer.reason };
    } catch {
      // File doesn't exist yet — wait
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  // Timeout — deny by default
  return { allow: false };
}

export async function writeTurnComplete(
  projectRoot: string,
  agentId: string,
): Promise<void> {
  const agentFile = path.join(projectRoot, ".orra", "agents", `${agentId}.json`);
  try {
    const data = JSON.parse(fs.readFileSync(agentFile, "utf-8"));
    data.status = "idle";
    data.updatedAt = new Date().toISOString();
    data.pendingQuestion = null;

    const tmpFile = agentFile + ".tmp";
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
    fs.renameSync(tmpFile, agentFile);
  } catch {
    // Agent file may not exist — non-fatal
  }
}

// --- Path resolution ---

function findProjectRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    dir = path.dirname(dir);
  }
  return startDir;
}

function findMainRepoRoot(worktreeRoot: string): string {
  const gitPath = path.join(worktreeRoot, ".git");
  try {
    const stat = fs.statSync(gitPath);
    if (stat.isDirectory()) return worktreeRoot;
    const content = fs.readFileSync(gitPath, "utf-8").trim();
    const match = content.match(/^gitdir:\s*(.+)$/);
    if (match) {
      const gitdir = match[1];
      const dotGit = path.resolve(worktreeRoot, gitdir, "..", "..");
      return path.dirname(dotGit);
    }
  } catch {}
  return worktreeRoot;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// --- Hook handlers ---

async function handlePermissionRequest(
  stateDir: string,
  agentId: string,
  hookInput: Record<string, unknown>,
): Promise<void> {
  const toolName = (hookInput.tool_name as string) ?? "unknown";
  const toolInput = (hookInput.tool_input as Record<string, unknown>) ?? {};

  // Write question to agent state file
  const projectRoot = path.dirname(stateDir); // stateDir is .orra, projectRoot is parent
  try {
    await writeQuestion(projectRoot, agentId, toolName, toolInput);
  } catch {
    process.exit(1);
  }

  // Poll for answer file
  const answer = await pollForAnswer(projectRoot, agentId, 300000, 100);

  if (answer.allow) {
    console.log(JSON.stringify(buildPermissionResponse(true)));
    process.exit(0);
  } else {
    const reason = answer.reason ?? "Denied by orchestrator";
    console.error(reason);
    process.exit(2);
  }
}

async function handleStop(stateDir: string, agentId: string): Promise<void> {
  const projectRoot = path.dirname(stateDir);
  try {
    await writeTurnComplete(projectRoot, agentId);
  } catch {}
  process.exit(0);
}

// --- Main ---

async function main(): Promise<void> {
  const input = await readStdin();
  let hookInput: Record<string, unknown>;
  try {
    hookInput = JSON.parse(input);
  } catch {
    process.exit(1);
    return;
  }

  const hookEvent = hookInput.hook_event_name as string;
  const cwd = (hookInput.cwd as string) ?? process.cwd();
  const worktreeRoot = findProjectRoot(cwd);
  const stateDir = resolveStateDir(process.env, worktreeRoot);
  const agentId = resolveAgentId(process.env, worktreeRoot);

  if (!agentId) {
    process.exit(1);
  }

  switch (hookEvent) {
    case "PermissionRequest":
      await handlePermissionRequest(stateDir, agentId!, hookInput);
      break;
    case "Stop":
      await handleStop(stateDir, agentId!);
      break;
    default:
      process.exit(0);
  }
}

const isMainModule = process.argv[1]?.endsWith("orra-hook.js") || process.argv[1]?.endsWith("orra-hook.ts");
if (isMainModule) {
  main().catch(() => process.exit(1));
}
```

- [ ] **Step 4: Update existing hook unit tests**

The `tests/unit/orra-hook.test.ts` tests for `resolveAgentId`, `buildPermissionResponse`, and `parseAllowDeny` should still pass since those functions have the same signatures.

Run: `npm test -- tests/unit/orra-hook.test.ts`
Expected: PASS

- [ ] **Step 5: Run the new hook integration tests**

Run: `npm test -- tests/integration/hooks-v2.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: Socket-based hook integration tests (`tests/integration/hooks.test.ts`) will now FAIL because they depend on the socket-based hook. We handle this in the next step.

- [ ] **Step 7: Delete old socket-based hook tests**

Delete `tests/integration/hooks.test.ts` (will be replaced by `hooks-v2.test.ts`).

- [ ] **Step 8: Run full test suite**

Run: `npm test`
Expected: All tests PASS (minus any socket tests still referencing the old hook — those get deleted in Task 6)

- [ ] **Step 9: Commit**

```bash
git add src/bin/orra-hook.ts tests/integration/hooks-v2.test.ts
git rm tests/integration/hooks.test.ts
git commit -m "feat: rewrite hook to file-based communication (no sockets)"
```

---

### Task 6: Remove Socket Server and Client

**Files:**
- Delete: `src/core/socket-server.ts`
- Delete: `src/core/socket-client.ts`
- Delete: `tests/unit/socket-server.test.ts`
- Delete: `tests/unit/socket-client.test.ts`
- Delete: `tests/integration/external-agent.test.ts`
- Modify: `src/core/agent-manager.ts` — remove socket initialization and external agent handling

- [ ] **Step 1: Remove socket imports and initialization from agent-manager.ts**

In `src/core/agent-manager.ts`:
- Remove `import { SocketServer } from "./socket-server.js"`
- Remove `import * as net from "node:net"`
- Remove `private socketServer: SocketServer | null = null`
- Remove `private pendingQuestions: Map<string, { hookSocket: net.Socket; ... }>`
- Replace with `private pendingQuestions: Map<string, { tool: string; input: Record<string, unknown> }>`
- In `init()`: remove entire socketServer setup block (lines 67-95) and `await this.socketServer.start()`
- Remove `handleExternalRegister`, `handleExternalStatus`, `handleExternalDisconnect` methods
- Remove `handleQuestion` method (will be replaced by file-based reading in a later task)
- Remove `handleTurnComplete` method (now handled by hook writing directly to state file)
- In `stopAgent()`: remove the `if (agent.type === "external")` block that sends via socket
- In `sendMessage()`: remove the `if (agent.type === "external")` block that sends via socket
- In `sendMessage()` for waiting agents: replace socket answer with file-based answer (write answer file)
- In `shutdown()`: remove `this.socketServer.stop()`

- [ ] **Step 2: Update sendMessage for file-based unblock**

In the `sendMessage` method, replace the waiting agent handler:

```typescript
// Handle waiting agent (pending permission question)
if (agent.status === "waiting") {
  const pending = this.pendingQuestions.get(agentId);
  if (!pending) throw new Error(`Agent ${agentId} has no pending question`);

  const allow = parseAllowDeny(message);
  
  // Write answer file for the hook to pick up
  const answerPath = path.join(this.projectRoot, ".orra", "agents", `${agentId}.answer.json`);
  const tmpPath = answerPath + ".tmp";
  await fsp.writeFile(tmpPath, JSON.stringify({ allow, reason: allow ? undefined : message }));
  await fsp.rename(tmpPath, answerPath);

  this.pendingQuestions.delete(agentId);

  agent.status = "running";
  agent.updatedAt = new Date().toISOString();
  await this.state.saveAgent(agent);
  return;
}
```

- [ ] **Step 3: Delete socket files and tests**

```bash
git rm src/core/socket-server.ts src/core/socket-client.ts
git rm tests/unit/socket-server.test.ts tests/unit/socket-client.test.ts
git rm tests/integration/external-agent.test.ts
```

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All remaining tests PASS. Some integration tests (agent-lifecycle.test.ts) may need adjustments since `manager.init()` no longer starts a socket server. If they fail, fix the test.

- [ ] **Step 5: Commit**

```bash
git add src/core/agent-manager.ts
git commit -m "feat: remove socket server/client, switch to file-based hook communication"
```

---

## Phase 3: Remove Old, Wire New

### Task 7: Remove Linker

**Files:**
- Delete: `src/core/linker.ts`
- Delete: `tests/unit/linker.test.ts`
- Delete: `tests/integration/linking.test.ts`
- Modify: `src/core/agent-manager.ts` — remove linker import and usage
- Modify: `src/types.ts` — remove Link types

- [ ] **Step 1: Remove linker from agent-manager**

In `src/core/agent-manager.ts`:
- Remove `import { Linker, expandTemplate } from "./linker.js"`
- Remove `private linker: Linker`
- Remove `this.linker = new Linker()` from constructor
- In `init()`: remove `const links = await this.state.loadLinks()` and `this.linker.loadLinks(links)`
- Remove `linkAgents()` method entirely
- Remove `fireLink()` method entirely
- In `handleAgentExit()`: remove all link evaluation logic (matching, expire, fire). Keep just the status update:

```typescript
private async handleAgentExit(agentId: string, exitCode: number): Promise<void> {
  this.runningProcesses.delete(agentId);

  if (this.killedAgents.has(agentId)) return;

  const agent = await this.state.loadAgent(agentId);
  if (!agent) return;

  agent.status = exitCode === 0 ? "completed" : "failed";
  agent.exitCode = exitCode;
  agent.updatedAt = new Date().toISOString();
  await this.state.saveAgent(agent);
}
```

- Remove `LinkResult` interface and related imports of `Link`, `LinkTo`, `LinkTrigger`

- [ ] **Step 2: Delete linker files and tests**

```bash
git rm src/core/linker.ts tests/unit/linker.test.ts tests/integration/linking.test.ts
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: PASS (agent-lifecycle test has a `linkAgents` test that must be removed)

- [ ] **Step 4: Remove link test from agent-lifecycle**

In `tests/integration/agent-lifecycle.test.ts`, remove the test:
```typescript
it("should throw when linking from non-existent agent", ...
```

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/agent-manager.ts tests/integration/agent-lifecycle.test.ts
git commit -m "feat: remove linker (chaining DSL) — Claude decides what to chain"
```

---

### Task 8: Remove Agent Mode

**Files:**
- Modify: `src/index.ts` — remove mode detection
- Modify: `src/server.ts` — remove conditional tool registration, remove SocketClient import
- Delete: `src/tools/orra-agent.ts`
- Delete: `src/tools/register.ts`
- Delete: `src/tools/unregister.ts`
- Delete: `src/tools/heartbeat.ts`
- Modify: `src/types.ts` — remove OrraMode, socket message types, AgentType

- [ ] **Step 1: Simplify index.ts**

Replace `src/index.ts`:

```typescript
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const projectRoot = process.cwd();
  const { server, manager } = createServer(projectRoot);

  await manager.init();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("orra-mcp: running");

  process.on("SIGTERM", async () => {
    await manager.shutdown();
    process.exit(0);
  });
  process.on("SIGINT", async () => {
    await manager.shutdown();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("orra-mcp: fatal error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Simplify server.ts (temporarily keep old orra tool, will replace in Task 9)**

Replace `src/server.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentManager } from "./core/agent-manager.js";
import { orraSchema, handleOrra } from "./tools/orra.js";
import { handleInstallHooks } from "./tools/install-hooks.js";

export function createServer(projectRoot: string): {
  server: McpServer;
  manager: AgentManager;
} {
  const server = new McpServer({
    name: "orra-mcp",
    version: "0.2.0",
  });

  const manager = new AgentManager(projectRoot);

  server.tool(
    "orra",
    "Orra: multi-agent orchestrator for git worktrees. Actions: spawn, list, status, output, stop, message, takeover.",
    orraSchema.shape,
    async (args) => handleOrra(manager, projectRoot, orraSchema.parse(args)),
  );

  server.tool(
    "orra_setup",
    "Install Orra hooks into .claude/settings.local.json for automatic input detection",
    {},
    async () => handleInstallHooks(),
  );

  return { server, manager };
}
```

- [ ] **Step 3: Delete agent-mode files**

```bash
git rm src/tools/orra-agent.ts src/tools/register.ts src/tools/unregister.ts src/tools/heartbeat.ts
```

- [ ] **Step 4: Clean up types.ts — remove v1-only types**

In `src/types.ts`:
- Remove `export type OrraMode = "orchestrator" | "agent"`
- Remove `export const AgentType = z.enum(["spawned", "external"])` and its type
- Remove the `type` field from `AgentStateSchema` (or mark it optional with default "spawned" for backward compat during migration)
- Remove all `SocketMessage` types (`RegisterMessage`, `OutputMessage`, `StatusMessage`, `RegisteredMessage`, `MessageMessage`, `StopMessage`, `QuestionMessage`, `TurnCompleteMessage`, `AnswerMessage`)
- Remove `export const SocketMessageSchema` and its type
- Remove `LinkToSchema`, `LinkSchema`, `LinkTrigger`, `LinkStatus` and their types

- [ ] **Step 5: Update agent-manager.ts to not reference removed types**

In `src/core/agent-manager.ts`:
- Remove `type AgentType` from imports if present
- In `spawnAgent()`: the `agentState` object no longer needs `type: "spawned"` field
- Make sure the `AgentStateSchema` (v1) is still used for backward compat until Task 10 migrates to v2

- [ ] **Step 6: Update state.ts if needed**

The state manager may reference `LinkSchema` — remove link-related methods:
- Remove `saveLinks` and `loadLinks` methods
- Remove `this.linksPath` field and its initialization in the constructor
- Remove the link file creation in `init()`

- [ ] **Step 7: Fix types tests**

In `tests/unit/types.test.ts`, remove tests for:
- Link schema validation
- Socket message types
- AgentType schema

Keep tests for AgentState, AgentStatus, Config, and the new v2 types.

- [ ] **Step 8: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/index.ts src/server.ts src/types.ts src/core/agent-manager.ts src/core/state.ts tests/unit/types.test.ts
git commit -m "feat: remove agent mode, socket types, link types — MCP is always orchestrator"
```

---

### Task 9: Replace Tool Surface with 7 Individual Tools

**Files:**
- Create: `src/tools/orra-scan.ts`
- Create: `src/tools/orra-inspect.ts`
- Create: `src/tools/orra-spawn.ts`
- Create: `src/tools/orra-kill.ts`
- Create: `src/tools/orra-message.ts`
- Create: `src/tools/orra-unblock.ts`
- Create: `src/tools/orra-rebase.ts`
- Modify: `src/server.ts` — register 7 tools
- Delete: `src/tools/orra.ts` (consolidated router)
- Delete: `src/tools/spawn-agent.ts`, `list-agents.ts`, `get-agent-status.ts`, `get-agent-output.ts`, `stop-agent.ts`, `send-message.ts`, `link-agents.ts`, `takeover.ts`

- [ ] **Step 1: Create orra_scan tool**

Create `src/tools/orra-scan.ts`:

```typescript
import { z } from "zod";
import { scanAll } from "../core/awareness.js";

export const orraScanSchema = z.object({});

export async function handleOrraScan(projectRoot: string) {
  const result = await scanAll(projectRoot);
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify(result, null, 2),
    }],
  };
}
```

- [ ] **Step 2: Create orra_inspect tool**

Create `src/tools/orra-inspect.ts`:

```typescript
import { z } from "zod";
import { inspectOne } from "../core/awareness.js";

export const orraInspectSchema = z.object({
  worktree: z.string().describe("Worktree ID or path"),
});

export async function handleOrraInspect(
  projectRoot: string,
  args: z.infer<typeof orraInspectSchema>,
) {
  try {
    const result = await inspectOne(projectRoot, args.worktree);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{
        type: "text" as const,
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      }],
      isError: true,
    };
  }
}
```

- [ ] **Step 3: Create orra_spawn tool**

Create `src/tools/orra-spawn.ts`:

```typescript
import { z } from "zod";
import type { AgentManager } from "../core/agent-manager.js";

export const orraSpawnSchema = z.object({
  task: z.string().describe("What the agent should do"),
  worktree: z.string().optional().describe("Existing worktree to spawn into (skip creation)"),
  branch: z.string().optional().describe("Branch name (auto-generated if omitted)"),
  model: z.string().optional().describe("Model override (e.g., 'sonnet', 'opus')"),
  agent: z.string().optional().describe("Agent persona from .claude/agents/ (e.g., 'executor')"),
  allowedTools: z.array(z.string()).optional().describe("Tool restrictions"),
});

export async function handleOrraSpawn(
  manager: AgentManager,
  args: z.infer<typeof orraSpawnSchema>,
) {
  const result = await manager.spawnAgent({
    task: args.task,
    branch: args.branch,
    model: args.model,
    agent: args.agent,
    allowedTools: args.allowedTools,
  });
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify(result, null, 2) +
        "\n\nAgent is now running. Use orra_scan to check all agents, or orra_inspect to check this one.",
    }],
  };
}
```

- [ ] **Step 4: Create orra_kill tool**

Create `src/tools/orra-kill.ts`:

```typescript
import { z } from "zod";
import type { AgentManager } from "../core/agent-manager.js";

export const orraKillSchema = z.object({
  worktree: z.string().describe("Worktree ID"),
  cleanup: z.boolean().default(true).describe("Remove worktree + delete branch"),
  closePR: z.boolean().default(false).describe("Close associated PR if draft"),
});

export async function handleOrraKill(
  manager: AgentManager,
  args: z.infer<typeof orraKillSchema>,
) {
  try {
    // Get agent info before stopping (need branch for PR closing)
    const agentInfo = await manager.getAgentStatus(args.worktree);
    const result = await manager.stopAgent(args.worktree, args.cleanup);

    // Close PR if requested
    if (args.closePR && agentInfo?.agent.branch) {
      try {
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execFileAsync = promisify(execFile);
        await execFileAsync("gh", ["pr", "close", agentInfo.agent.branch, "--delete-branch"], { timeout: 10000 });
      } catch {
        // gh CLI may not be available — non-fatal
      }
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{
        type: "text" as const,
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      }],
      isError: true,
    };
  }
}
```

- [ ] **Step 5: Create orra_message tool**

Create `src/tools/orra-message.ts`:

```typescript
import { z } from "zod";
import type { AgentManager } from "../core/agent-manager.js";

export const orraMessageSchema = z.object({
  worktree: z.string().describe("Worktree ID"),
  message: z.string().describe("The instruction or message to send"),
});

export async function handleOrraMessage(
  manager: AgentManager,
  args: z.infer<typeof orraMessageSchema>,
) {
  try {
    await manager.sendMessage(args.worktree, args.message);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ worktree: args.worktree, sent: true }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{
        type: "text" as const,
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      }],
      isError: true,
    };
  }
}
```

- [ ] **Step 6: Create orra_unblock tool**

Create `src/tools/orra-unblock.ts`:

```typescript
import { z } from "zod";
import * as fsp from "node:fs/promises";
import * as path from "node:path";

export const orraUnblockSchema = z.object({
  worktree: z.string().describe("Worktree ID"),
  allow: z.boolean().describe("Allow or deny the permission request"),
  reason: z.string().optional().describe("Explanation (shown to agent on deny)"),
});

export async function handleOrraUnblock(
  projectRoot: string,
  args: z.infer<typeof orraUnblockSchema>,
) {
  const answerPath = path.join(projectRoot, ".orra", "agents", `${args.worktree}.answer.json`);
  const tmpPath = answerPath + ".tmp";

  try {
    await fsp.writeFile(
      tmpPath,
      JSON.stringify({ allow: args.allow, reason: args.reason }),
    );
    await fsp.rename(tmpPath, answerPath);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          worktree: args.worktree,
          action: args.allow ? "allowed" : "denied",
          reason: args.reason,
        }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{
        type: "text" as const,
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      }],
      isError: true,
    };
  }
}
```

- [ ] **Step 7: Create orra_rebase tool**

Create `src/tools/orra-rebase.ts`:

```typescript
import { z } from "zod";
import type { AgentManager } from "../core/agent-manager.js";
import { WorktreeManager } from "../core/worktree.js";

export const orraRebaseSchema = z.object({
  worktree: z.string().describe("Worktree ID"),
});

export async function handleOrraRebase(
  manager: AgentManager,
  projectRoot: string,
  args: z.infer<typeof orraRebaseSchema>,
) {
  // Check if agent is running — stop it first
  const status = await manager.getAgentStatus(args.worktree);
  const wasRunning = status?.agent && ["running", "idle"].includes(status.agent.status);

  if (wasRunning) {
    await manager.stopAgent(args.worktree, false); // stop agent but keep worktree
  }

  const worktrees = new WorktreeManager(projectRoot);
  const result = await worktrees.rebase(args.worktree);

  const response: Record<string, unknown> = {
    worktree: args.worktree,
    success: result.success,
    conflicts: result.conflicts,
  };

  if (wasRunning && result.success) {
    response.note = "Agent was stopped for rebase. Spawn a new agent to continue work.";
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify(response, null, 2),
    }],
  };
}
```

- [ ] **Step 8: Update server.ts to register all 7 tools**

Replace `src/server.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentManager } from "./core/agent-manager.js";
import { orraScanSchema, handleOrraScan } from "./tools/orra-scan.js";
import { orraInspectSchema, handleOrraInspect } from "./tools/orra-inspect.js";
import { orraSpawnSchema, handleOrraSpawn } from "./tools/orra-spawn.js";
import { orraKillSchema, handleOrraKill } from "./tools/orra-kill.js";
import { orraMessageSchema, handleOrraMessage } from "./tools/orra-message.js";
import { orraUnblockSchema, handleOrraUnblock } from "./tools/orra-unblock.js";
import { orraRebaseSchema, handleOrraRebase } from "./tools/orra-rebase.js";

export function createServer(projectRoot: string): {
  server: McpServer;
  manager: AgentManager;
} {
  const server = new McpServer({
    name: "orra-mcp",
    version: "0.2.0",
  });

  const manager = new AgentManager(projectRoot);

  server.tool(
    "orra_scan",
    "Scan all worktrees — returns status summary for each (ready_to_land, needs_attention, in_progress, idle, stale) with git state, file markers, PRs, and agent status. Call this first to understand the state of all worktrees.",
    orraScanSchema.shape,
    async () => handleOrraScan(projectRoot),
  );

  server.tool(
    "orra_inspect",
    "Deep dive on one worktree — full git state, commit log, file marker contents, PR reviews, agent output tail, conflict prediction.",
    orraInspectSchema.shape,
    async (args) => handleOrraInspect(projectRoot, orraInspectSchema.parse(args)),
  );

  server.tool(
    "orra_spawn",
    "Create a worktree and launch a Claude agent with a task. Agents run independently in isolated git worktrees and report state via hooks.",
    orraSpawnSchema.shape,
    async (args) => handleOrraSpawn(manager, orraSpawnSchema.parse(args)),
  );

  server.tool(
    "orra_kill",
    "Stop agent + remove worktree + clean branch. Optionally close associated PR.",
    orraKillSchema.shape,
    async (args) => handleOrraKill(manager, orraKillSchema.parse(args)),
  );

  server.tool(
    "orra_message",
    "Send a message or instruction to a running agent. If agent is idle (between turns), this resumes it.",
    orraMessageSchema.shape,
    async (args) => handleOrraMessage(manager, orraMessageSchema.parse(args)),
  );

  server.tool(
    "orra_unblock",
    "Answer a pending permission prompt for an agent. The agent is blocked waiting for this response.",
    orraUnblockSchema.shape,
    async (args) => handleOrraUnblock(projectRoot, orraUnblockSchema.parse(args)),
  );

  server.tool(
    "orra_rebase",
    "Rebase a worktree branch on latest main. Stops agent if running, fetches main, rebases, reports conflicts.",
    orraRebaseSchema.shape,
    async (args) => handleOrraRebase(manager, projectRoot, orraRebaseSchema.parse(args)),
  );

  return { server, manager };
}
```

- [ ] **Step 9: Delete old tool files**

```bash
git rm src/tools/orra.ts src/tools/spawn-agent.ts src/tools/list-agents.ts
git rm src/tools/get-agent-status.ts src/tools/get-agent-output.ts src/tools/stop-agent.ts
git rm src/tools/send-message.ts src/tools/link-agents.ts src/tools/takeover.ts
git rm src/tools/install-hooks.ts
```

- [ ] **Step 10: Update agent-manager SpawnAgentOptions to include agent persona**

In `src/core/agent-manager.ts`, update the `SpawnAgentOptions` interface:

```typescript
export interface SpawnAgentOptions {
  task: string;
  branch?: string;
  model?: string;
  agent?: string;
  allowedTools?: string[];
}
```

And in `buildClaudeArgs`, add agent persona support:

```typescript
private buildClaudeArgs(options: SpawnAgentOptions): string[] {
  const args: string[] = [];

  if (options.agent) {
    args.push("--agent", options.agent);
  }

  if (options.model) {
    args.push("--model", options.model);
  }

  if (options.allowedTools && options.allowedTools.length > 0) {
    args.push("--allowedTools", options.allowedTools.join(","));
  }

  return args;
}
```

- [ ] **Step 11: Run build to check for compile errors**

Run: `npm run build`
Expected: PASS (no TypeScript errors)

- [ ] **Step 12: Run full test suite**

Run: `npm test`
Expected: All tests PASS. Integration tests for agent-lifecycle may need minor updates since `handleOrra` no longer exists — adjust imports.

- [ ] **Step 13: Commit**

```bash
git add src/server.ts src/tools/ src/core/agent-manager.ts
git commit -m "feat: replace consolidated orra router with 7 individual MCP tools"
```

---

### Task 10: Update State Manager

**Files:**
- Modify: `src/core/state.ts`
- Modify: `tests/unit/state.test.ts`

- [ ] **Step 1: Update state.ts to v2 schema**

In `src/core/state.ts`:
- Replace `AgentStateSchema` import with `AgentStateV2Schema` (or update the v1 schema to match v2)
- Remove `linksPath` field and all link-related methods (`saveLinks`, `loadLinks`)
- Remove `links.json` creation from `init()`
- Update `loadConfig()` to use `ConfigV2Schema` from config module
- Update `saveAgent()` / `loadAgent()` to use v2 agent schema

```typescript
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { AgentStateV2Schema, type AgentStateV2 } from "../types.js";
import { loadConfig, type ConfigV2 } from "./config.js";

function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class StateManager {
  private orraDir: string;
  private agentsDir: string;

  constructor(private projectRoot: string) {
    this.orraDir = path.join(projectRoot, ".orra");
    this.agentsDir = path.join(this.orraDir, "agents");
  }

  async init(): Promise<void> {
    await fs.mkdir(this.agentsDir, { recursive: true });
  }

  async saveAgent(agent: AgentStateV2): Promise<void> {
    const filePath = path.join(this.agentsDir, `${agent.id}.json`);
    const tmpPath = filePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(agent, null, 2));
    await fs.rename(tmpPath, filePath);
  }

  async loadAgent(id: string): Promise<AgentStateV2 | null> {
    const filePath = path.join(this.agentsDir, `${id}.json`);
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return AgentStateV2Schema.parse(JSON.parse(data));
    } catch {
      return null;
    }
  }

  async listAgents(): Promise<AgentStateV2[]> {
    try {
      const files = await fs.readdir(this.agentsDir);
      const jsonFiles = files.filter((f: string) => f.endsWith(".json"));
      const agents: AgentStateV2[] = [];
      for (const file of jsonFiles) {
        try {
          const data = await fs.readFile(path.join(this.agentsDir, file), "utf-8");
          agents.push(AgentStateV2Schema.parse(JSON.parse(data)));
        } catch {
          // Skip invalid files (e.g., answer files)
        }
      }
      return agents;
    } catch {
      return [];
    }
  }

  async appendLog(id: string, content: string): Promise<void> {
    const filePath = path.join(this.agentsDir, `${id}.log`);
    await fs.appendFile(filePath, content);
  }

  async readLog(id: string, tail?: number): Promise<string> {
    const filePath = path.join(this.agentsDir, `${id}.log`);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      if (tail === undefined) return content;
      const lines = content.split("\n").filter((l) => l.length > 0);
      return lines.slice(-tail).join("\n");
    } catch {
      return "";
    }
  }

  async readLogRange(id: string, offset: number): Promise<{ content: string; newOffset: number }> {
    const filePath = path.join(this.agentsDir, `${id}.log`);
    try {
      const stat = await fs.stat(filePath);
      if (offset >= stat.size) return { content: "", newOffset: offset };
      const handle = await fs.open(filePath, "r");
      try {
        const buffer = Buffer.alloc(stat.size - offset);
        await handle.read(buffer, 0, buffer.length, offset);
        return { content: buffer.toString("utf-8"), newOffset: stat.size };
      } finally {
        await handle.close();
      }
    } catch {
      return { content: "", newOffset: 0 };
    }
  }

  async loadConfig(): Promise<ConfigV2> {
    return loadConfig(this.projectRoot);
  }

  async reconcile(): Promise<void> {
    const agents = await this.listAgents();
    for (const agent of agents) {
      if (agent.status === "running" && !pidIsAlive(agent.pid)) {
        agent.status = "interrupted";
        agent.updatedAt = new Date().toISOString();
        await this.saveAgent(agent);
      }
    }
  }
}
```

- [ ] **Step 2: Update state tests**

Update `tests/unit/state.test.ts`:
- Remove link-related tests (`save and load links`)
- Remove `links.json` check from init test
- Update agent state fixtures to use v2 schema (add `agentPersona: null`, `pendingQuestion: null`, remove `type`)
- Update `default config` test to expect v2 config defaults (or just test that loadConfig returns valid config)

- [ ] **Step 3: Update agent-manager to use v2 types**

In `src/core/agent-manager.ts`, update `AgentState` references to `AgentStateV2`. Update the agent creation in `spawnAgent()` to include v2 fields:

```typescript
const agentState: AgentStateV2 = {
  id: agentId,
  task: options.task,
  branch,
  worktree: worktreePath,
  pid: 0,
  status: "running",
  agentPersona: options.agent ?? null,
  model: options.model ?? null,
  createdAt: now,
  updatedAt: now,
  exitCode: null,
  pendingQuestion: null,
};
```

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 5: Clean up types.ts — remove all v1-only types**

Remove from `src/types.ts`:
- `AgentStateSchema` (v1) — now using `AgentStateV2Schema`
- `ConfigSchema` (v1) — now using `ConfigV2Schema`
- Rename `AgentStateV2Schema` to `AgentStateSchema` and `AgentStateV2` to `AgentState` for cleanliness
- Rename `ConfigV2Schema` to `ConfigSchema` and `ConfigV2` to `Config`
- Update all imports across the codebase

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/state.ts src/core/agent-manager.ts src/types.ts tests/unit/state.test.ts
git commit -m "feat: update state manager to v2 schema, remove v1 types"
```

---

## Phase 4: Polish

### Task 11: Orchestrator Persona + Setup Script

**Files:**
- Create: `src/templates/orchestrator.md`
- Create: `src/bin/setup.ts`

- [ ] **Step 1: Create orchestrator agent persona template**

Create `src/templates/orchestrator.md`:

```markdown
# Orra Orchestrator

You are an AI orchestrator managing multiple Claude Code agents working in git worktrees.

## On Session Start

Call `orra_scan` immediately to understand the state of all worktrees. Present the results grouped by status:

- **Ready to Land** — PRs approved, CI green, mergeable
- **Needs Attention** — Agents blocked, PRs with change requests, CI failing
- **In Progress** — Agents actively working
- **Idle** — Worktrees with work but no active agent
- **Stale** — No activity for multiple days

## Proactive Suggestions

After presenting status, suggest concrete actions:
- Kill stale worktrees that have no PRs and no recent activity
- Unblock agents that are waiting on permission prompts
- Rebase worktrees with high drift (many commits behind main)
- Merge worktrees that are ready to land

## When Spawning Agents

- Choose appropriate agent personas from `.claude/agents/` based on the task
- Include clear, specific task descriptions
- Use `orra_spawn` — do NOT use the built-in Agent tool for worktree tasks

## Communication

- Use `orra_message` to send follow-up instructions to running agents
- Use `orra_unblock` to answer permission prompts (allow or deny)
- Use `orra_inspect` for deep dives into specific worktrees
- Use `orra_scan` to refresh the overall picture

## Rules

- Never drop into worktree terminals — communicate with agents via tools
- Present information clearly — group by status, highlight flags
- Remember worktree context across conversation turns
- When in doubt, scan first, then decide
```

- [ ] **Step 2: Create setup script**

Create `src/bin/setup.ts`:

```typescript
#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function main() {
  const projectRoot = process.cwd();

  // 1. Create .orra/config.json with defaults
  const orraDir = path.join(projectRoot, ".orra");
  fs.mkdirSync(path.join(orraDir, "agents"), { recursive: true });

  const configPath = path.join(orraDir, "config.json");
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({
      markers: ["spec.md", "PRD.md", "PLAN.md", "CHANGELOG.md"],
      staleDays: 3,
      worktreeDir: "worktrees",
      driftThreshold: 20,
      defaultModel: null,
      defaultAgent: null,
    }, null, 2));
    console.log("Created .orra/config.json");
  } else {
    console.log(".orra/config.json already exists — skipping");
  }

  // 2. Copy orchestrator.md to .claude/agents/
  const agentsDir = path.join(projectRoot, ".claude", "agents");
  fs.mkdirSync(agentsDir, { recursive: true });

  const orchestratorSrc = path.join(currentDir, "..", "templates", "orchestrator.md");
  const orchestratorDest = path.join(agentsDir, "orchestrator.md");
  if (!fs.existsSync(orchestratorDest)) {
    fs.copyFileSync(orchestratorSrc, orchestratorDest);
    console.log("Created .claude/agents/orchestrator.md");
  } else {
    console.log(".claude/agents/orchestrator.md already exists — skipping");
  }

  // 3. Add .orra/ to .gitignore
  const gitignorePath = path.join(projectRoot, ".gitignore");
  let gitignore = "";
  try { gitignore = fs.readFileSync(gitignorePath, "utf-8"); } catch {}
  if (!gitignore.includes(".orra/")) {
    fs.appendFileSync(gitignorePath, "\n# Orra MCP state\n.orra/\n");
    console.log("Added .orra/ to .gitignore");
  }

  console.log("\nSetup complete! Launch the orchestrator:");
  console.log("  claude --agent orchestrator");
}

main();
```

- [ ] **Step 3: Update package.json to add setup bin**

Add to `package.json` bins:

```json
{
  "bin": {
    "orra-mcp": "dist/index.js",
    "orra-setup": "dist/bin/setup.js"
  }
}
```

- [ ] **Step 4: Run build to verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/templates/orchestrator.md src/bin/setup.ts package.json
git commit -m "feat: add orchestrator agent persona + setup script"
```

---

### Task 12: Update Integration Tests for Scan Pipeline

**Files:**
- Create: `tests/integration/scan.test.ts`
- Modify: `tests/integration/agent-lifecycle.test.ts`

- [ ] **Step 1: Create scan integration test**

Create `tests/integration/scan.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { scanAll } from "../../src/core/awareness.js";

describe("Scan Pipeline (integration)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-scan-integ-"));
    execSync("git init", { cwd: tmpDir });
    execSync("git commit --allow-empty -m 'init'", { cwd: tmpDir });

    // Create .orra directory
    fs.mkdirSync(path.join(tmpDir, ".orra", "agents"), { recursive: true });
  });

  afterEach(() => {
    try { execSync("git worktree prune", { cwd: tmpDir }); } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return empty scan when no worktrees exist", async () => {
    const result = await scanAll(tmpDir);
    expect(result.worktrees).toHaveLength(0);
    expect(result.summary.total).toBe(0);
  });

  it("should scan a worktree with commits", async () => {
    // Create a worktree with a commit
    const wtPath = path.join(tmpDir, "worktrees", "test-feature");
    execSync(`git worktree add ${wtPath} -b feat/test-feature`, { cwd: tmpDir });
    fs.writeFileSync(path.join(wtPath, "feature.ts"), "export const x = 1;");
    execSync("git add feature.ts && git commit -m 'add feature'", { cwd: wtPath });

    const result = await scanAll(tmpDir);
    expect(result.worktrees).toHaveLength(1);
    expect(result.worktrees[0].id).toBe("test-feature");
    expect(result.worktrees[0].branch).toBe("feat/test-feature");
    expect(result.worktrees[0].git.ahead).toBe(1);
    expect(result.worktrees[0].status).toBe("idle"); // no agent, recent activity
    expect(result.summary.idle).toBe(1);
  });

  it("should detect stale worktrees", async () => {
    // Create a worktree
    const wtPath = path.join(tmpDir, "worktrees", "old-thing");
    execSync(`git worktree add ${wtPath} -b feat/old-thing`, { cwd: tmpDir });
    fs.writeFileSync(path.join(wtPath, "old.ts"), "export const old = true;");
    execSync("git add old.ts && git commit -m 'old commit'", { cwd: wtPath });

    // Backdate the commit to 5 days ago
    const oldDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    execSync(`git commit --amend --no-edit --date "${oldDate}"`, { cwd: wtPath, env: { ...process.env, GIT_COMMITTER_DATE: oldDate } });

    // Write config with 3 day stale threshold
    fs.writeFileSync(path.join(tmpDir, ".orra", "config.json"), JSON.stringify({ staleDays: 3 }));

    const result = await scanAll(tmpDir);
    expect(result.worktrees[0].status).toBe("stale");
    expect(result.summary.stale).toBe(1);
  });

  it("should detect file markers", async () => {
    const wtPath = path.join(tmpDir, "worktrees", "with-spec");
    execSync(`git worktree add ${wtPath} -b feat/with-spec`, { cwd: tmpDir });
    fs.writeFileSync(path.join(wtPath, "spec.md"), "# Spec\nThis is a spec.");
    fs.writeFileSync(path.join(wtPath, "feature.ts"), "export const y = 2;");
    execSync("git add . && git commit -m 'add spec and feature'", { cwd: wtPath });

    const result = await scanAll(tmpDir);
    expect(result.worktrees[0].markers).toContain("spec.md");
  });

  it("should detect agent with pending question as needs_attention", async () => {
    const wtPath = path.join(tmpDir, "worktrees", "blocked-agent");
    execSync(`git worktree add ${wtPath} -b feat/blocked-agent`, { cwd: tmpDir });
    fs.writeFileSync(path.join(wtPath, "file.ts"), "x");
    execSync("git add file.ts && git commit -m 'wip'", { cwd: wtPath });

    // Write agent state with pending question
    fs.writeFileSync(path.join(tmpDir, ".orra", "agents", "blocked-agent.json"), JSON.stringify({
      id: "blocked-agent",
      task: "test task",
      branch: "feat/blocked-agent",
      worktree: "worktrees/blocked-agent",
      pid: process.pid, // alive PID
      status: "waiting",
      agentPersona: null,
      model: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      exitCode: null,
      pendingQuestion: { tool: "Bash", input: { command: "git push" } },
    }));

    const result = await scanAll(tmpDir);
    expect(result.worktrees[0].status).toBe("needs_attention");
    expect(result.summary.needs_attention).toBe(1);
  });
});
```

- [ ] **Step 2: Update agent-lifecycle tests**

Update `tests/integration/agent-lifecycle.test.ts` to remove references to `linkAgents` and adjust for v2 API. The `.orra/links.json` check should be removed from the init test.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add tests/integration/scan.test.ts tests/integration/agent-lifecycle.test.ts
git commit -m "test: add scan pipeline integration tests, update agent-lifecycle tests for v2"
```

---

### Task 13: Update CLAUDE.md and Clean Up

**Files:**
- Modify: `CLAUDE.md`
- Clean up: remove any leftover v1 references

- [ ] **Step 1: Update CLAUDE.md**

Replace `CLAUDE.md`:

```markdown
# Orra MCP Development

## Project

MCP server that turns Claude Code into a multi-agent orchestrator via git worktrees.

## Architecture

**Two capabilities:**
- **Awareness** — Scan worktrees via git/filesystem/GitHub to classify status (ready_to_land, needs_attention, in_progress, idle, stale)
- **Action** — Spawn, kill, message, unblock, rebase agents in worktrees

**7 MCP tools:** orra_scan, orra_inspect, orra_spawn, orra_kill, orra_message, orra_unblock, orra_rebase

## Testing

```bash
npm test          # run all tests
npm run build     # compile TypeScript
```

## Structure

- `src/core/` — awareness engine, config, agent manager, worktree, process, state, stream-parser
- `src/tools/` — MCP tool handlers (7 individual tools)
- `src/bin/` — hook script (file-based), setup script
- `src/templates/` — orchestrator agent persona
- `tests/` — unit + integration tests
```

- [ ] **Step 2: Run build + test one final time**

Run: `npm run build && npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for v2 architecture"
```

---

## Summary

| Phase | Tasks | What happens |
|-------|-------|--------------|
| 1: Add New | Tasks 1-4 | v2 types, config, awareness engine, rebase — zero old code touched |
| 2: Switch Hooks | Tasks 5-6 | File-based hooks, delete sockets |
| 3: Remove Old | Tasks 7-10 | Delete linker, agent mode, consolidated router. Wire 7 new tools. Migrate state to v2 schema |
| 4: Polish | Tasks 11-13 | Orchestrator persona, setup script, integration tests, docs |

**Total: 13 tasks, ~70 steps**

Tests pass after every task. Git history tells a clear refactoring story.
