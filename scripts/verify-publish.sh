#!/usr/bin/env bash
# Pre-publish verification: build, test, pack, install tarball into a
# scratch dir, and confirm the entry point loads. Run before `npm publish`.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRATCH="$(mktemp -d -t orra-verify-XXXXXX)"
trap 'rm -rf "$SCRATCH"' EXIT

cd "$ROOT"

echo "==> build"
npm run build

echo "==> test"
npm test

echo "==> pack"
TARBALL_NAME="$(npm pack --silent)"
TARBALL="$ROOT/$TARBALL_NAME"
trap 'rm -rf "$SCRATCH" "$TARBALL"' EXIT

echo "==> tarball contents (top-level)"
tar -tzf "$TARBALL" | awk -F/ '{print $2}' | sort -u

echo "==> smoke install in $SCRATCH"
cd "$SCRATCH"
npm init -y >/dev/null
npm install --silent "$TARBALL"

echo "==> bin executable check (catches missing chmod +x in tarball)"
for bin in orra-mcp orra-setup; do
  REAL_PATH="$(readlink -f ./node_modules/.bin/$bin 2>/dev/null || readlink ./node_modules/.bin/$bin)"
  REAL_PATH="${REAL_PATH:-./node_modules/.bin/$bin}"
  # Resolve relative readlink targets against bin dir
  if [[ "$REAL_PATH" != /* ]]; then
    REAL_PATH="./node_modules/.bin/$REAL_PATH"
  fi
  if [[ ! -x "$REAL_PATH" ]]; then
    echo "  FAIL: $bin → $REAL_PATH is not executable"
    ls -la "$REAL_PATH"
    exit 1
  fi
  echo "  $bin → $REAL_PATH ✓"
done

echo "==> boot check (invoke bin via npx, wait for marker, kill)"
BOOT_LOG="$SCRATCH/boot.log"
npx --no-install orra-mcp >"$BOOT_LOG" 2>&1 </dev/null &
BOOT_PID=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 0.5
  if grep -q "orra-mcp: running" "$BOOT_LOG" 2>/dev/null; then
    break
  fi
done
kill "$BOOT_PID" 2>/dev/null || true
wait "$BOOT_PID" 2>/dev/null || true
if grep -q "orra-mcp: running" "$BOOT_LOG"; then
  echo "  server booted via npx ✓"
else
  echo "  FAIL: server did not print boot marker within 5s"
  echo "  --- boot log ---"
  cat "$BOOT_LOG"
  exit 1
fi

echo
echo "All checks passed. Safe to npm publish."
