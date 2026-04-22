import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { loadDirective } from "../../../src/core/directives.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orra-dir-"));
  await fs.mkdir(path.join(tmp, ".orra", "directives"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("directives", () => {
  it("loads a directive with no frontmatter", async () => {
    await fs.writeFile(
      path.join(tmp, ".orra", "directives", "plain.md"),
      "# plain\nbody text",
    );
    const d = await loadDirective(tmp, "plain");
    expect(d.id).toBe("plain");
    expect(d.frontmatter).toEqual({});
    expect(d.body.trim()).toContain("body text");
  });

  it("parses lean:true + cache_schema + escalate_when + allowed_tools", async () => {
    const content = `---
lean: true
cache_schema:
  fields: [id, title, priority]
  summary_facets: [priority]
escalate_when:
  - "priority == high"
allowed_tools: ["Bash(gh:*)", "mcp__orra__orra_cache_write"]
---

Directive body here.`;
    await fs.writeFile(path.join(tmp, ".orra", "directives", "lean.md"), content);
    const d = await loadDirective(tmp, "lean");
    expect(d.frontmatter.lean).toBe(true);
    expect(d.frontmatter.cache_schema?.fields).toEqual(["id", "title", "priority"]);
    expect(d.frontmatter.cache_schema?.summary_facets).toEqual(["priority"]);
    expect(d.frontmatter.escalate_when).toEqual(["priority == high"]);
    expect(d.frontmatter.allowed_tools).toEqual(["Bash(gh:*)", "mcp__orra__orra_cache_write"]);
    expect(d.body.trim()).toBe("Directive body here.");
  });

  it("parses frontmatter with CRLF line endings", async () => {
    const content =
      "---\r\nlean: true\r\ncache_schema:\r\n  fields: [id]\r\n  summary_facets: [id]\r\n---\r\nBody.\r\n";
    await fs.writeFile(path.join(tmp, ".orra", "directives", "crlf.md"), content);
    const d = await loadDirective(tmp, "crlf");
    expect(d.frontmatter.lean).toBe(true);
    expect(d.frontmatter.cache_schema?.fields).toEqual(["id"]);
  });

  it("rejects directive ids with path separators", async () => {
    await expect(loadDirective(tmp, "../../etc/passwd")).rejects.toThrow(/Invalid directive id/);
    await expect(loadDirective(tmp, "foo/bar")).rejects.toThrow(/Invalid directive id/);
  });

  it("throws when directive file is missing", async () => {
    await expect(loadDirective(tmp, "nope")).rejects.toThrow(/not found/);
  });
});
