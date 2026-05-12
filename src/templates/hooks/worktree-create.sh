#!/usr/bin/env bash
# Sample WorktreeCreate hook installed by orra setup. Customize freely.
#
# Receives the new worktree path via stdin JSON (Claude Code WorktreeCreate event)
# and/or environment variables. Runs setup tasks for the new worktree:
#   (a) Symlinks credential files from the main repo if present
#   (b) Copies .claude/ config from the main repo if not already present
#   (c) Kicks off background install if a package.json exists
#
# Idempotent. Exits 0 even on partial failure to avoid blocking worktree creation.

set -euo pipefail

# ── Resolve the worktree path ────────────────────────────────────────────────
# Try stdin JSON first (Claude Code passes event data on stdin).
WT=""
if command -v jq >/dev/null 2>&1; then
  STDIN_JSON=$(cat 2>/dev/null || true)
  WT=$(printf '%s' "$STDIN_JSON" | jq -r '.worktree_path // .worktreePath // .cwd // empty' 2>/dev/null || true)
fi

# Fall back to env vars and positional args.
if [ -z "$WT" ] || [ ! -d "$WT" ]; then
  WT="${CLAUDE_PROJECT_DIR:-}"
fi
if [ -z "$WT" ] || [ ! -d "$WT" ]; then
  WT="${1:-}"
fi
if [ -z "$WT" ] || [ ! -d "$WT" ]; then
  WT="$PWD"
fi

# Bail out if we still cannot find a valid directory.
if [ ! -d "$WT" ]; then
  echo "orra worktree-create hook: could not determine worktree path, skipping" >&2
  exit 0
fi

# ── Find the main repo ───────────────────────────────────────────────────────
# git --git-common-dir returns <mainrepo>/.git  (or .git for plain repos)
GIT_COMMON=$(git -C "$WT" rev-parse --git-common-dir 2>/dev/null || true)
if [ -z "$GIT_COMMON" ]; then
  echo "orra worktree-create hook: not a git repo at $WT, skipping" >&2
  exit 0
fi
# Normalise to absolute path of the main repo root.
MAIN_REPO=$(cd "$GIT_COMMON/.." 2>/dev/null && pwd || true)
if [ -z "$MAIN_REPO" ] || [ "$MAIN_REPO" = "$WT" ]; then
  # Worktree path IS the main repo (shouldn't happen on WorktreeCreate, but be safe)
  exit 0
fi

# ── (a) Symlink credential files from main repo ──────────────────────────────
for CRED in .env .env.local .npmrc; do
  SRC="$MAIN_REPO/$CRED"
  DST="$WT/$CRED"
  if [ -e "$SRC" ] && [ ! -e "$DST" ]; then
    ln -sf "$SRC" "$DST" 2>/dev/null || true
  fi
done

# ── (b) Copy .claude/ config if the worktree lacks one ───────────────────────
if [ -d "$MAIN_REPO/.claude" ] && [ ! -d "$WT/.claude" ]; then
  cp -r "$MAIN_REPO/.claude" "$WT/.claude" 2>/dev/null || true
fi

# ── (c) Background install if package.json exists ────────────────────────────
if [ -f "$WT/package.json" ]; then
  ( cd "$WT" && npm install && npm run build ) >/dev/null 2>&1 &
fi

exit 0
