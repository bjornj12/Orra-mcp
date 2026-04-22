import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { handleOrraTick, orraTickSchema } from "../../../src/tools/orra-tick.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orra-tick-"));
  await fs.mkdir(path.join(tmp, ".orra", "directives"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("orra_tick", () => {
  it("returns subagent_spec for a lean directive", async () => {
    const dir = `---
lean: true
cache_schema:
  fields: [id, state]
  summary_facets: [state]
escalate_when:
  - "state == breached"
allowed_tools: ["Bash(gh:*)", "mcp__orra__orra_cache_write"]
---

Fetch PRs and classify them.`;
    await fs.writeFile(path.join(tmp, ".orra", "directives", "pr-shepherd.md"), dir);

    const res = await handleOrraTick(tmp, orraTickSchema.parse({ directive_id: "pr-shepherd" }));
    const body = JSON.parse(res.content[0].text);
    expect(body.ok).toBe(true);
    expect(body.data.mode).toBe("subagent");
    expect(body.data.spec.directive_id).toBe("pr-shepherd");
    expect(body.data.spec.allowed_tools).toContain("mcp__orra__orra_cache_write");
    expect(body.data.spec.prompt).toContain("Fetch PRs and classify them.");
    expect(body.data.spec.prompt).toContain("cache_schema");
    expect(body.data.spec.cache_schema.fields).toEqual(["id", "state"]);
    expect(body.data.spec.escalate_when).toEqual(["state == breached"]);
  });

  it("returns mode:'inline' for non-lean directives", async () => {
    await fs.writeFile(
      path.join(tmp, ".orra", "directives", "cheap.md"),
      "# cheap\n\nRun this inline.",
    );
    const res = await handleOrraTick(tmp, orraTickSchema.parse({ directive_id: "cheap" }));
    const body = JSON.parse(res.content[0].text);
    expect(body.ok).toBe(true);
    expect(body.data.mode).toBe("inline");
    expect(body.data.body).toContain("Run this inline.");
  });

  it("errors when directive missing", async () => {
    const res = await handleOrraTick(tmp, orraTickSchema.parse({ directive_id: "missing" }));
    const body = JSON.parse(res.content[0].text);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("not found");
  });

  it("errors when lean:true but cache_schema missing", async () => {
    const dir = `---
lean: true
---

broken`;
    await fs.writeFile(path.join(tmp, ".orra", "directives", "bad.md"), dir);
    const res = await handleOrraTick(tmp, orraTickSchema.parse({ directive_id: "bad" }));
    const body = JSON.parse(res.content[0].text);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("cache_schema");
  });
});
