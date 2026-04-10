import { z } from "zod";
import * as fsp from "node:fs/promises";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.join(currentDir, "..", "templates", "directives");

export const orraDirectiveSchema = z.object({
  action: z.enum(["add", "list", "remove", "examples", "install"]).describe(
    "add: create a new directive, list: show active directives, remove: delete a directive, examples: show available example directives, install: install an example directive by name"
  ),
  name: z.string().optional().describe("Directive name (for add/remove/install). Alphanumeric + hyphens."),
  content: z.string().optional().describe("Markdown content for the directive (for add). Describe what the orchestrator should do."),
});

function directivesDir(projectRoot: string): string {
  return path.join(projectRoot, ".orra", "directives");
}

function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export async function handleOrraDirective(
  projectRoot: string,
  args: z.infer<typeof orraDirectiveSchema>,
) {
  const dirPath = directivesDir(projectRoot);
  await fsp.mkdir(dirPath, { recursive: true });

  switch (args.action) {
    case "add": {
      if (!args.name) return error("'name' is required for add");
      if (!args.content) return error("'content' is required for add");

      const fileName = `${sanitizeName(args.name)}.md`;
      const filePath = path.join(dirPath, fileName);
      await fsp.writeFile(filePath, args.content);

      return ok({
        added: true,
        name: sanitizeName(args.name),
        file: fileName,
        directive: args.content,
        instruction: "IMPORTANT: Follow this directive immediately in the current session. It has also been saved to disk so future sessions will load it automatically.",
      });
    }

    case "list": {
      try {
        const files = await fsp.readdir(dirPath);
        const directives = files.filter(f => f.endsWith(".md")).map(f => f.replace(".md", ""));
        return ok({ directives, count: directives.length, path: dirPath });
      } catch {
        return ok({ directives: [], count: 0, path: dirPath });
      }
    }

    case "remove": {
      if (!args.name) return error("'name' is required for remove");

      const fileName = `${sanitizeName(args.name)}.md`;
      const filePath = path.join(dirPath, fileName);

      if (!fs.existsSync(filePath)) {
        return error(`Directive "${args.name}" not found`);
      }

      await fsp.unlink(filePath);
      return ok({
        removed: true,
        name: sanitizeName(args.name),
        hint: "Restart the orchestrator session to apply.",
      });
    }

    case "examples": {
      try {
        const files = await fsp.readdir(examplesDir);
        const examples = await Promise.all(
          files.filter(f => f.endsWith(".md")).map(async (f) => {
            const content = await fsp.readFile(path.join(examplesDir, f), "utf-8");
            const firstLine = content.split("\n").find(l => l.trim().length > 0) ?? "";
            return {
              name: f.replace(".md", ""),
              description: firstLine.replace(/^#+\s*/, ""),
            };
          }),
        );
        return ok({ examples, count: examples.length, hint: "Use action 'install' with a name to install one." });
      } catch {
        return ok({ examples: [], count: 0 });
      }
    }

    case "install": {
      if (!args.name) return error("'name' is required for install");

      const srcFile = path.join(examplesDir, `${sanitizeName(args.name)}.md`);
      if (!fs.existsSync(srcFile)) {
        return error(`Example directive "${args.name}" not found. Use action 'examples' to see available ones.`);
      }

      const content = await fsp.readFile(srcFile, "utf-8");
      const destFile = path.join(dirPath, `${sanitizeName(args.name)}.md`);
      await fsp.writeFile(destFile, content);

      return ok({
        installed: true,
        name: sanitizeName(args.name),
        directive: content,
        instruction: "IMPORTANT: Follow this directive immediately in the current session. It has also been saved to disk so future sessions will load it automatically.",
      });
    }
  }
}

function ok(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function error(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}
