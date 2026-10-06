#!/bin/bash
set -euo pipefail

echo "=== relicd Review Script ==="
echo

STEPS=7

# 1. Clean caches and build artifacts
echo "[1/$STEPS] Cleaning caches and build artifacts..."
rm -rf ./build ./node_modules ./.eslintcache
if [ -d ./dist ]; then
  find ./dist -mindepth 1 ! -name '*.md' -exec rm -rf {} +
fi
echo "       Done."
echo

# 2. Install dependencies
echo "[2/$STEPS] Installing dependencies..."
pnpm install
echo "       Done."
echo

# 3. Refresh helper binaries (public/bin is gitignored, so it can be stale)
echo "[3/$STEPS] Refreshing helper binaries..."
pnpm download-helper-binaries
echo "       OK."
echo

# 4. Code check (TypeScript)
echo "[4/$STEPS] Running codecheck (tsc --noEmit)..."
pnpm codecheck
echo "       OK."
echo

# 5. Lint + Prettier
echo "[5/$STEPS] Running lint and prettier..."
pnpm lint
pnpm prettier
echo "       OK."
echo

# 6. Tests
echo "[6/$STEPS] Running tests..."
pnpm test:ci
echo "       OK."
echo

# 7. Package
echo "[7/$STEPS] Packaging..."
pnpm package
echo "       Done."
echo

echo "=== Review complete ==="
