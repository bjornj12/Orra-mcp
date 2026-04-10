import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadPipeline, detectStage } from "../../src/core/pipeline.js";

describe("loadPipeline", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-pipeline-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return null when no pipeline.json exists", async () => {
    expect(await loadPipeline(tmpDir)).toBeNull();
  });

  it("should load pipeline definition", async () => {
    const orraDir = path.join(tmpDir, ".orra");
    fs.mkdirSync(orraDir, { recursive: true });
    fs.writeFileSync(path.join(orraDir, "pipeline.json"), JSON.stringify({
      name: "Test",
      stages: [
        { name: "spec", detect: { marker: "spec.md" } },
        { name: "implement", detect: { all: [{ marker: "PRD.md" }, { notMarker: "done.md" }] } },
      ],
    }));

    const result = await loadPipeline(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.stages).toHaveLength(2);
  });
});

describe("detectStage", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orra-detect-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should match single marker", async () => {
    fs.writeFileSync(path.join(tmpDir, "spec.md"), "# Spec");
    const stage = await detectStage(
      { path: tmpDir, branch: "feat/x" },
      { name: "Test", stages: [{ name: "spec", detect: { marker: "spec.md" } }] },
    );
    expect(stage?.name).toBe("spec");
  });

  it("should match all combinator", async () => {
    fs.writeFileSync(path.join(tmpDir, "spec.md"), "# Spec");
    fs.writeFileSync(path.join(tmpDir, "PRD.md"), "# PRD");
    const stage = await detectStage(
      { path: tmpDir, branch: "feat/x" },
      { name: "Test", stages: [{ name: "both", detect: { all: [{ marker: "spec.md" }, { marker: "PRD.md" }] } }] },
    );
    expect(stage?.name).toBe("both");
  });

  it("should fail all combinator when one is missing", async () => {
    fs.writeFileSync(path.join(tmpDir, "spec.md"), "# Spec");
    const stage = await detectStage(
      { path: tmpDir, branch: "feat/x" },
      { name: "Test", stages: [{ name: "both", detect: { all: [{ marker: "spec.md" }, { marker: "PRD.md" }] } }] },
    );
    expect(stage).toBeNull();
  });

  it("should match any combinator", async () => {
    fs.writeFileSync(path.join(tmpDir, "PRD.md"), "# PRD");
    const stage = await detectStage(
      { path: tmpDir, branch: "feat/x" },
      { name: "Test", stages: [{ name: "started", detect: { any: [{ marker: "spec.md" }, { marker: "PRD.md" }] } }] },
    );
    expect(stage?.name).toBe("started");
  });

  it("should match notMarker", async () => {
    fs.writeFileSync(path.join(tmpDir, "spec.md"), "# Spec");
    const stage = await detectStage(
      { path: tmpDir, branch: "feat/x" },
      { name: "Test", stages: [{ name: "pre-review", detect: { all: [{ marker: "spec.md" }, { notMarker: "review.md" }] } }] },
    );
    expect(stage?.name).toBe("pre-review");
  });

  it("should match branchPattern", async () => {
    const stage = await detectStage(
      { path: tmpDir, branch: "feat/auth-fix" },
      { name: "Test", stages: [{ name: "feature", detect: { branchPattern: "^feat/" } }] },
    );
    expect(stage?.name).toBe("feature");
  });

  it("should return first matching stage (top-down)", async () => {
    fs.writeFileSync(path.join(tmpDir, "spec.md"), "# Spec");
    fs.writeFileSync(path.join(tmpDir, "PRD.md"), "# PRD");
    const stage = await detectStage(
      { path: tmpDir, branch: "feat/x" },
      { name: "Test", stages: [
        { name: "spec", detect: { marker: "spec.md" } },
        { name: "prd", detect: { marker: "PRD.md" } },
      ]},
    );
    expect(stage?.name).toBe("spec");
  });

  it("should return null when no stage matches", async () => {
    const stage = await detectStage(
      { path: tmpDir, branch: "main" },
      { name: "Test", stages: [{ name: "spec", detect: { marker: "spec.md" } }] },
    );
    expect(stage).toBeNull();
  });
});
