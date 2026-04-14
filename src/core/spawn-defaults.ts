export const DEFAULT_HEADLESS_ALLOWED_TOOLS: string[] = [
  // Read-only file access
  "Read", "Glob", "Grep",
  // File modification (scoped to wherever claude is running)
  "Edit", "Write",
  // Git — read
  "Bash(git status:*)",
  "Bash(git log:*)",
  "Bash(git diff:*)",
  "Bash(git show:*)",
  "Bash(git branch:*)",
  "Bash(git fetch:*)",
  // Git — write (scoped to current branch)
  "Bash(git add:*)",
  "Bash(git commit:*)",
  "Bash(git rebase:*)",
  "Bash(git checkout:*)",
  "Bash(git stash:*)",
  "Bash(git merge:*)",
  "Bash(git pull:*)",
  "Bash(git push:*)",
  // Common build / test / lint
  "Bash(npm test*)",
  "Bash(npm run lint*)",
  "Bash(npm run build*)",
  "Bash(npm run typecheck*)",
  "Bash(npx tsc*)",
  "Bash(npx vitest*)",
  "Bash(npx jest*)",
];

export class ConcurrencyLimitError extends Error {
  override readonly name = "ConcurrencyLimitError";
  constructor(public readonly current: number, public readonly limit: number) {
    super(`Headless spawn concurrency limit reached: ${current}/${limit} agents already running`);
  }
}
