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
