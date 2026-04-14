import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { handleOrraDirective } from "../../src/tools/orra-directive.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "orra-directive-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function listDirectives(): Promise<string[]> {
  try {
    const files = await fs.readdir(path.join(tmpDir, ".orra", "directives"));
    return files.filter((f) => f.endsWith(".md")).sort();
  } catch {
    return [];
  }
}

function parseResult(result: { content: { type: string; text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0].text);
}

describe("orra_directive — install-all", () => {
  it("installs every example directive on a fresh project", async () => {
    const result = await handleOrraDirective(tmpDir, { action: "install-all" });
    const data = parseResult(result);

    expect(data.installedAll).toBe(true);
    expect(typeof data.count).toBe("number");
    expect(data.count).toBeGreaterThan(0);
    expect(Array.isArray(data.installed)).toBe(true);
    expect(Array.isArray(data.skipped)).toBe(true);
    expect((data.skipped as string[]).length).toBe(0);

    // Each installed entry should be a real file on disk
    const onDisk = await listDirectives();
    expect(onDisk.length).toBe(data.count);

    // The set should include the canonical directives we ship
    const onDiskNames = onDisk.map((f) => f.replace(".md", ""));
    expect(onDiskNames).toContain("morning-briefing");
    expect(onDiskNames).toContain("shutdown-ritual");
    expect(onDiskNames).toContain("memory-recall");
    expect(onDiskNames).toContain("auto-remediator");
    expect(onDiskNames).toContain("monitor-agents");
  });

  it("skips existing directives on second run (preserves user customization)", async () => {
    // First install: copies everything
    await handleOrraDirective(tmpDir, { action: "install-all" });
    const firstCount = (await listDirectives()).length;

    // User customizes one
    const customPath = path.join(tmpDir, ".orra", "directives", "morning-briefing.md");
    await fs.writeFile(customPath, "## My customized morning briefing\n\nDo whatever I say.\n");

    // Second install
    const result = await handleOrraDirective(tmpDir, { action: "install-all" });
    const data = parseResult(result);

    expect(data.installedAll).toBe(true);
    expect(data.count).toBe(0); // nothing new was installed
    expect((data.installed as string[]).length).toBe(0);
    expect((data.skipped as string[]).length).toBe(firstCount);

    // The customized file should be untouched
    const content = await fs.readFile(customPath, "utf-8");
    expect(content).toContain("My customized morning briefing");
    expect(content).toContain("Do whatever I say");
  });

  it("does not include the deprecated daily-focus directive", async () => {
    await handleOrraDirective(tmpDir, { action: "install-all" });
    const onDisk = await listDirectives();
    expect(onDisk).not.toContain("daily-focus.md");
  });
});

describe("orra_directive — examples", () => {
  it("lists every shipped directive", async () => {
    const result = await handleOrraDirective(tmpDir, { action: "examples" });
    const data = parseResult(result);

    expect(Array.isArray(data.examples)).toBe(true);
    const names = (data.examples as { name: string }[]).map((e) => e.name);
    expect(names).toContain("morning-briefing");
    expect(names).toContain("auto-remediator");
    expect(names).not.toContain("daily-focus");
  });
});
