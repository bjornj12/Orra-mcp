import { z } from "zod";
import {
  StageInfoSchema,
  ProviderStatusSchema,
  ProviderConfigSchema,
  ProviderCacheConfigSchema,
} from "./core/providers/types.js";

export { StageInfoSchema, ProviderStatusSchema };
export type { StageInfo, ProviderStatus } from "./core/providers/types.js";

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

export const ConfigSchema = z.object({
  markers: z.array(z.string()).default(["spec.md", "PRD.md", "PLAN.md", "CHANGELOG.md"]),
  staleDays: z.number().default(3),
  worktreeDir: z.string().default("worktrees"),
  driftThreshold: z.number().default(20),
  defaultModel: z.string().nullable().default(null),
  defaultAgent: z.string().nullable().default(null),
  providers: z.array(ProviderConfigSchema).default([]),
  providerCache: ProviderCacheConfigSchema.default({ ttl: 5000 }),
  headlessSpawnConcurrency: z.number().int().min(0).default(3),
});
export type Config = z.infer<typeof ConfigSchema>;

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

export const AgentStateSchema = z.object({
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
export type AgentState = z.infer<typeof AgentStateSchema>;

export const AgentSummarySchema = z.object({
  agentId: z.string(),
  summarizedAt: z.string(),
  logMtime: z.string(),
  schemaVersion: z.literal(1),
  oneLine: z.string(),
  needsAttentionScore: z.number().min(0).max(100),
  likelyStuckReason: z.string().nullable(),
  lastTestResult: z.enum(["pass", "fail", "unknown"]),
  lastFileEdited: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
  tailLines: z.array(z.string()),
});
export type AgentSummary = z.infer<typeof AgentSummarySchema>;

export const WorktreeScanEntrySchema = z.object({
  id: z.string(),
  path: z.string(),
  branch: z.string(),
  status: WorktreeStatusSchema,
  git: GitStateSchema,
  markers: z.array(z.string()),
  pr: PrStateSchema.nullable(),
  agent: AgentStateSchema.nullable(),
  flags: z.array(z.string()),
  stage: StageInfoSchema.nullable().optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
  summary: AgentSummarySchema.optional(),
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
  providerStatus: ProviderStatusSchema.optional(),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

// ─── Context management ─────────────────────────────────────────────────────

export const CacheSchemaDefSchema = z.object({
  fields: z.array(z.string()),
  summary_facets: z.array(z.string()),
});
export type CacheSchemaDef = z.infer<typeof CacheSchemaDefSchema>;

export const SubagentSpecSchema = z.object({
  directive_id: z.string(),
  prompt: z.string(),
  allowed_tools: z.array(z.string()),
  cache_schema: CacheSchemaDefSchema,
  escalate_when: z.array(z.string()).default([]),
});
export type SubagentSpec = z.infer<typeof SubagentSpecSchema>;

export const OpenThreadSchema = z.object({
  id: z.string(),
  topic: z.string(),
  status: z.string(),
  since: z.string(),
});
export type OpenThread = z.infer<typeof OpenThreadSchema>;

export const PressureSchema = z.object({
  score: z.number(),
  recommend_compact: z.boolean(),
  reason: z.string().optional(),
});
export type Pressure = z.infer<typeof PressureSchema>;

export const SessionStateSchema = z.object({
  schema_version: z.literal(1),
  session_id: z.string(),
  session_started_at: z.string(),
  last_resume_at: z.string(),
  last_checkpoint_at: z.string().nullable().default(null),
  tick_count: z.number().int().nonnegative().default(0),
  pressure: PressureSchema.default({ score: 0, recommend_compact: false }),
  seen: z.record(z.string(), z.union([
    z.array(z.string()),
    z.record(z.string(), z.string()),
  ])).default({}),
  last_surfaced: z.record(z.string(), z.object({
    suggestion_id: z.string(),
    at: z.string(),
  })).default({}),
  open_threads: z.array(OpenThreadSchema).default([]),
  directive_notes: z.record(z.string(), z.string()).default({}),
});
export type SessionState = z.infer<typeof SessionStateSchema>;

export const CurrentSessionSchema = z.object({
  session_id: z.string(),
  started_at: z.string(),
});
export type CurrentSession = z.infer<typeof CurrentSessionSchema>;

export const CacheIndexSchema = z.object({
  directive_id: z.string(),
  fetched_at: z.string(),
  total: z.number().int().nonnegative(),
  facets: z.record(z.string(), z.record(z.string(), z.number())).default({}),
  fields: z.array(z.string()),
});
export type CacheIndex = z.infer<typeof CacheIndexSchema>;

export const CacheFileSchema = z.object({
  directive_id: z.string(),
  fetched_at: z.string(),
  rows: z.array(z.record(z.string(), z.unknown())),
});
export type CacheFile = z.infer<typeof CacheFileSchema>;

export const TickLogEntrySchema = z.object({
  ts: z.string(),
  directive_id: z.string(),
  digest: z.string(),
  cache_bytes: z.number().int().nonnegative(),
  subagent_tokens: z.number().int().nonnegative().optional(),
  subagent_duration_ms: z.number().int().nonnegative().optional(),
  ok: z.boolean(),
});
export type TickLogEntry = z.infer<typeof TickLogEntrySchema>;

export const ResumeResultSchema = z.object({
  resumed: z.boolean(),
  age_seconds: z.number().int().nonnegative(),
  session_id: z.string(),
  open_threads: z.array(OpenThreadSchema),
  pressure: PressureSchema,
  resume_md: z.string(),
});
export type ResumeResult = z.infer<typeof ResumeResultSchema>;
