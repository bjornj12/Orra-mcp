import { z } from "zod";

export const AgentStatus = z.enum([
  "running",
  "idle",
  "waiting",
  "completed",
  "failed",
  "interrupted",
  "killed",
]);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const AgentStateSchema = z.object({
  id: z.string(),
  type: z.enum(["spawned", "external"]).default("spawned"),
  task: z.string(),
  branch: z.string(),
  worktree: z.string(),
  pid: z.number(),
  status: AgentStatus,
  createdAt: z.string(),
  updatedAt: z.string(),
  exitCode: z.number().nullable(),
  model: z.string().nullable(),
  allowedTools: z.array(z.string()).nullable(),
});
export type AgentState = z.infer<typeof AgentStateSchema>;

export const ConfigSchema = z.object({
  defaultModel: z.string().nullable(),
  defaultAllowedTools: z.array(z.string()).nullable(),
  spawnCommand: z.string().nullable().default(null),
});
export type Config = z.infer<typeof ConfigSchema>;

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
