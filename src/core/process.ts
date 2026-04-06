import * as pty from "node-pty";

export interface SpawnOptions {
  command: string;
  args: string[];
  cwd: string;
  onData: (data: string) => void;
  onExit: (exitCode: number) => void;
  env?: Record<string, string>;
}

export interface ManagedProcess {
  pid: number;
  write: (data: string) => void;
  kill: (signal?: string) => void;
  onExit: (exitCode: number) => void;
}

export class ProcessManager {
  spawn(options: SpawnOptions): ManagedProcess {
    const ptyProcess = pty.spawn(options.command, options.args, {
      name: "xterm-256color",
      cols: 200,
      rows: 50,
      cwd: options.cwd,
      env: { ...process.env, ...options.env } as Record<string, string>,
    });

    const managed: ManagedProcess = {
      pid: ptyProcess.pid,
      write: (data: string) => ptyProcess.write(data),
      kill: (signal?: string) => {
        try {
          ptyProcess.kill(signal);
        } catch {
          // Process may already be dead
        }
      },
      onExit: options.onExit,
    };

    ptyProcess.onData((data) => {
      options.onData(data);
    });

    ptyProcess.onExit(({ exitCode }) => {
      managed.onExit(exitCode);
    });

    return managed;
  }
}
