import { z } from "zod";

export const AgentStatus = z.enum([
  "running",
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

export const AgentStateSchema = z.object({
  id: z.string(),
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
