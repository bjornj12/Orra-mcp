import { z } from "zod";
import { ok, fail, toMcpContent } from "../core/envelope.js";
import { loadDirective } from "../core/directives.js";
import type { SubagentSpec } from "../types.js";

export const orraTickSchema = z.object({
  directive_id: z.string().describe("Directive to tick (must exist under .orra/directives/<id>.md)."),
});

const DEFAULT_ALLOWED_TOOLS = [
  "Bash",
  "Read",
  "Grep",
  "Glob",
  "mcp__orra__orra_cache_write",
];

export async function handleOrraTick(
  projectRoot: string,
  args: z.infer<typeof orraTickSchema>,
) {
  let directive;
  try {
    directive = await loadDirective(projectRoot, args.directive_id);
  } catch (err) {
    return toMcpContent(fail(err instanceof Error ? err.message : String(err)));
  }

  if (!directive.frontmatter.lean) {
    return toMcpContent(
      ok({
        mode: "inline" as const,
        directive_id: args.directive_id,
        body: directive.body.trim(),
      }),
    );
  }

  const cs = directive.frontmatter.cache_schema;
  if (!cs) {
    return toMcpContent(
      fail(
        "Directive declares lean:true but is missing cache_schema. Add cache_schema.fields and cache_schema.summary_facets to the frontmatter.",
      ),
    );
  }

  const escalate_when = directive.frontmatter.escalate_when ?? [];
  const allowed_tools = directive.frontmatter.allowed_tools ?? DEFAULT_ALLOWED_TOOLS;

  const prompt = buildSubagentPrompt({
    directive_id: args.directive_id,
    body: directive.body.trim(),
    cache_schema: cs,
    escalate_when,
  });

  const spec: SubagentSpec = {
    directive_id: args.directive_id,
    prompt,
    allowed_tools,
    cache_schema: cs,
    escalate_when,
  };

  return toMcpContent(ok({ mode: "subagent" as const, spec }));
}

function buildSubagentPrompt(args: {
  directive_id: string;
  body: string;
  cache_schema: { fields: string[]; summary_facets: string[] };
  escalate_when: string[];
}): string {
  return [
    `You are an Orra lean-tick subagent for directive: ${args.directive_id}`,
    "",
    "# Directive",
    args.body,
    "",
    "# Contract (cache_schema)",
    `- Normalize your results into rows with fields: [${args.cache_schema.fields.join(", ")}].`,
    `- Call mcp__orra__orra_cache_write ONCE with: {directive_id, digest, rows, index}.`,
    `  - index.facets MUST include counts for: [${args.cache_schema.summary_facets.join(", ")}].`,
    `  - digest MUST (a) state counts broken down by [${args.cache_schema.summary_facets.join(", ")}], (b) inline any row matching: [${args.escalate_when.join(", ") || "(none)"}], (c) stay under 150 tokens.`,
    "- Return ONLY the digest string as your final message. No preamble, no raw provider output.",
    "",
    "# Example digest shape",
    `"30 items: 18 high (5 new), 10 med, 2 low. Escalations: ID-412 (breached), ID-389 (breached). Cached."`,
  ].join("\n");
}
