import { describe, it, expect, afterEach } from "vitest";
import { ProcessManager, type ManagedProcess } from "../../src/core/process.js";

describe("ProcessManager", () => {
  let pm: ProcessManager;
  const processes: ManagedProcess[] = [];

  afterEach(() => {
    for (const proc of processes) {
      try {
        proc.kill();
      } catch {}
    }
    processes.length = 0;
  });

  it("should spawn a process and capture output", async () => {
    pm = new ProcessManager();
    const output: string[] = [];

    const proc = pm.spawn({
      command: "echo",
      args: ["hello from orra"],
      cwd: "/tmp",
      onData: (data) => output.push(data),
      onExit: () => {},
    });
    processes.push(proc);

    // Wait for process to finish
    await new Promise<void>((resolve) => {
      const orig = proc.onExit;
      proc.onExit = (code) => {
        orig(code);
        resolve();
      };
    });

    expect(output.join("")).toContain("hello from orra");
  });

  it("should report exit code", async () => {
    pm = new ProcessManager();
    let exitCode: number | undefined;

    const proc = pm.spawn({
      command: "/bin/sh",
      args: ["-c", "exit 42"],
      cwd: "/tmp",
      onData: () => {},
      onExit: (code) => {
        exitCode = code;
      },
    });
    processes.push(proc);

    await new Promise<void>((resolve) => {
      const orig = proc.onExit;
      proc.onExit = (code) => {
        orig(code);
        resolve();
      };
    });

    expect(exitCode).toBe(42);
  });

  it("should write to stdin", async () => {
    pm = new ProcessManager();
    const output: string[] = [];

    const proc = pm.spawn({
      command: "/bin/cat",
      args: [],
      cwd: "/tmp",
      onData: (data) => output.push(data),
      onExit: () => {},
    });
    processes.push(proc);

    proc.write("test input\n");

    // Give cat time to echo back, then kill
    await new Promise((r) => setTimeout(r, 500));
    proc.kill();

    expect(output.join("")).toContain("test input");
  });

  it("should kill a process", async () => {
    pm = new ProcessManager();
    let exited = false;

    const proc = pm.spawn({
      command: "sleep",
      args: ["60"],
      cwd: "/tmp",
      onData: () => {},
      onExit: () => {
        exited = true;
      },
    });
    processes.push(proc);

    proc.kill();
    await new Promise((r) => setTimeout(r, 1000));
    expect(exited).toBe(true);
  });

  it("should report pid", () => {
    pm = new ProcessManager();

    const proc = pm.spawn({
      command: "sleep",
      args: ["60"],
      cwd: "/tmp",
      onData: () => {},
      onExit: () => {},
    });
    processes.push(proc);

    expect(proc.pid).toBeGreaterThan(0);
  });
});
