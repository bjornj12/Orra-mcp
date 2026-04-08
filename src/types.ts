import { z } from "zod";

export type OrraMode = "orchestrator" | "agent";

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

export const LinkTrigger = z.enum(["success", "failure", "any"]);
export type LinkTrigger = z.infer<typeof LinkTrigger>;

export const LinkStatus = z.enum(["pending", "fired", "expired"]);
export type LinkStatus = z.infer<typeof LinkStatus>;

export const AgentType = z.enum(["spawned", "external"]);
export type AgentType = z.infer<typeof AgentType>;

export const AgentStateSchema = z.object({
  id: z.string(),
  type: AgentType.default("spawned"),
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

export const LinkToSchema = z.object({
  task: z.string(),
  branch: z.string().optional(),
  model: z.string().optional(),
});
export type LinkTo = z.infer<typeof LinkToSchema>;

export const LinkSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: LinkToSchema,
  on: LinkTrigger,
  status: LinkStatus,
  firedAgentId: z.string().nullable(),
  createdAt: z.string(),
});
export type Link = z.infer<typeof LinkSchema>;

export const ConfigSchema = z.object({
  defaultModel: z.string().nullable(),
  defaultAllowedTools: z.array(z.string()).nullable(),
  spawnCommand: z.string().nullable().default(null),
});
export type Config = z.infer<typeof ConfigSchema>;

// Socket protocol messages

const RegisterMessage = z.object({
  type: z.literal("register"),
  task: z.string(),
  branch: z.string().optional(),
});

const OutputMessage = z.object({
  type: z.literal("output"),
  data: z.string(),
});

const StatusMessage = z.object({
  type: z.literal("status"),
  status: z.enum(["completed", "failed"]),
  exitCode: z.number(),
});

const RegisteredMessage = z.object({
  type: z.literal("registered"),
  agentId: z.string(),
});

const MessageMessage = z.object({
  type: z.literal("message"),
  content: z.string(),
});

const StopMessage = z.object({
  type: z.literal("stop"),
  reason: z.string(),
});

const QuestionMessage = z.object({
  type: z.literal("question"),
  agentId: z.string(),
  tool: z.string(),
  input: z.record(z.string(), z.unknown()),
});

const TurnCompleteMessage = z.object({
  type: z.literal("turn_complete"),
  agentId: z.string(),
});

const AnswerMessage = z.object({
  type: z.literal("answer"),
  allow: z.boolean(),
  reason: z.string().optional(),
});

export const SocketMessageSchema = z.discriminatedUnion("type", [
  RegisterMessage,
  OutputMessage,
  StatusMessage,
  RegisteredMessage,
  MessageMessage,
  StopMessage,
  QuestionMessage,
  TurnCompleteMessage,
  AnswerMessage,
]);
export type SocketMessage = z.infer<typeof SocketMessageSchema>;

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
