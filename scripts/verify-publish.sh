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

echo "==> import check"
node --input-type=module -e "
  const mod = await import('orra-mcp');
  if (!mod) throw new Error('module did not load');
  console.log('IMPORT OK');
"

echo "==> binaries present"
test -x ./node_modules/.bin/orra-mcp && echo "  orra-mcp ✓"
test -x ./node_modules/.bin/orra-setup && echo "  orra-setup ✓"

echo
echo "All checks passed. Safe to npm publish."
