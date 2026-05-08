import { z } from "zod";

export const BlockerSchema = z.object({
  id: z.string().min(1),
  identifier: z.string().min(1),
  state: z.string().optional(),
});

export const NormalizedIssueSchema = z.object({
  id: z.string().min(1),
  identifier: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.number().int().nullable().optional(),
  state: z.string().optional().transform((v) => (v == null ? v : v.toLowerCase())),
  branch_name: z.string().optional(),
  url: z.string().optional(),
  labels: z.array(z.string()).optional().transform((v) => (v == null ? v : v.map((s) => s.toLowerCase()))),
  blocked_by: z.array(BlockerSchema).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type NormalizedIssue = z.infer<typeof NormalizedIssueSchema>;
export type Blocker = z.infer<typeof BlockerSchema>;
