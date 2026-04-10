import { z } from "zod";

// --- Provider config schemas ---

export const HttpProviderConfigSchema = z.object({
  type: z.literal("http"),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  timeout: z.number().default(5000),
  followRedirects: z.boolean().default(true),
  maxRedirects: z.number().default(5),
  minProtocolVersion: z.string().optional(),
});
export type HttpProviderConfig = z.infer<typeof HttpProviderConfigSchema>;

export const FileProviderConfigSchema = z.object({
  type: z.literal("file"),
  path: z.string(),
  minProtocolVersion: z.string().optional(),
});
export type FileProviderConfig = z.infer<typeof FileProviderConfigSchema>;

export const CommandProviderConfigSchema = z.object({
  type: z.literal("command"),
  command: z.array(z.string()),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  timeout: z.number().default(10000),
  minProtocolVersion: z.string().optional(),
});
export type CommandProviderConfig = z.infer<typeof CommandProviderConfigSchema>;

export const ProviderConfigSchema = z.discriminatedUnion("type", [
  HttpProviderConfigSchema,
  FileProviderConfigSchema,
  CommandProviderConfigSchema,
]);
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const ProviderCacheConfigSchema = z.object({
  ttl: z.number().default(5000),
});
export type ProviderCacheConfig = z.infer<typeof ProviderCacheConfigSchema>;

// --- Shared schemas (also exported from root types.ts) ---

export const StageInfoSchema = z.object({
  name: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type StageInfo = z.infer<typeof StageInfoSchema>;

export const ProviderStatusSchema = z.object({
  used: z.array(z.string()),
  failed: z.array(z.object({ provider: z.string(), error: z.string() })),
  cacheHits: z.array(z.string()),
});
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;

// --- Protocol result schemas ---
// Note: ProviderWorktreeSchema uses partial inline schemas to avoid circular
// dependencies with root types.ts. The full schemas live in types.ts.

export const ProviderWorktreeSchema = z.object({
  id: z.string(),
  path: z.string(),
  branch: z.string(),
  git: z.object({
    ahead: z.number(),
    behind: z.number(),
    uncommitted: z.number(),
    lastCommit: z.string(),
    diffStat: z.string(),
  }).partial().optional(),
  pr: z.object({
    number: z.number(),
    state: z.string(),
    reviews: z.string(),
    ci: z.string(),
    mergeable: z.boolean(),
  }).nullable().optional(),
  agent: z.object({
    id: z.string(),
    task: z.string(),
    branch: z.string(),
    worktree: z.string(),
    pid: z.number(),
    status: z.string(),
    agentPersona: z.string().nullable(),
    model: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    exitCode: z.number().nullable(),
    pendingQuestion: z.unknown().nullable(),
  }).partial().optional().nullable(),
  stage: StageInfoSchema.nullable().optional(),
  markers: z.array(z.string()).optional(),
  flags: z.array(z.string()).optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
});
export type ProviderWorktree = z.infer<typeof ProviderWorktreeSchema>;

export const ProviderMetaSchema = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
  generatedAt: z.string().optional(),
});

export const ProviderResultSchema = z.object({
  orraProtocolVersion: z.string().default("1.0"),
  worktrees: z.array(ProviderWorktreeSchema),
  provider: ProviderMetaSchema.optional(),
});
export type ProviderResult = z.infer<typeof ProviderResultSchema>;

// --- Provider interface ---

export interface StateProvider {
  name: string;
  config: ProviderConfig;
  fetch(): Promise<ProviderResult>;
}
