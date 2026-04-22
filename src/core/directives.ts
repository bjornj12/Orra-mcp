import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { z } from "zod";
import { CacheSchemaDefSchema } from "../types.js";
import { assertSafeDirectiveId } from "./validation.js";

export const DirectiveFrontmatterSchema = z.object({
  lean: z.boolean().optional(),
  cache_schema: CacheSchemaDefSchema.optional(),
  escalate_when: z.array(z.string()).optional(),
  allowed_tools: z.array(z.string()).optional(),
}).passthrough();
export type DirectiveFrontmatter = z.infer<typeof DirectiveFrontmatterSchema>;

export type LoadedDirective = {
  id: string;
  frontmatter: DirectiveFrontmatter;
  body: string;
};

export function directiveDir(projectRoot: string): string {
  return path.join(projectRoot, ".orra", "directives");
}

export async function loadDirective(
  projectRoot: string,
  id: string,
): Promise<LoadedDirective> {
  assertSafeDirectiveId(id);
  const p = path.join(directiveDir(projectRoot), `${id}.md`);
  let raw: string;
  try {
    raw = await fsp.readFile(p, "utf8");
  } catch (err) {
    throw new Error(`Directive '${id}' not found at ${p}`);
  }
  return parseDirective(id, raw);
}

export function parseDirective(id: string, raw: string): LoadedDirective {
  const normalized = raw.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(normalized);
  if (!match) {
    return { id, frontmatter: {}, body: normalized };
  }
  const frontmatter = DirectiveFrontmatterSchema.parse(yaml.load(match[1]) ?? {});
  return { id, frontmatter, body: match[2] };
}
