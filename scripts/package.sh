#!/bin/bash
# Builds dist/relicd-<version>-linux-x64.tar.gz (+ .sha256):
#   relicd/relicd        launcher
#   relicd/node          Node runtime (SteamOS does not ship one)
#   relicd/relicd.cjs    the bundled daemon
#   relicd/public/       helper binaries (bin/) and translations (locales/)
#
# Usage: scripts/package.sh
#   RELICD_NODE_BINARY=/path/to/node   use this node instead of downloading it
set -euo pipefail

cd "$(dirname "$0")/.."

NODE_VERSION="24.16.0"
NODE_DIST="node-v${NODE_VERSION}-linux-x64"
VERSION=$(node -p "require('./package.json').version")
OUT_DIR="dist"
STAGE="$OUT_DIR/relicd"
TARBALL="$OUT_DIR/relicd-${VERSION}-linux-x64.tar.gz"
CACHE="build/cache"

fetch_node() {
    if [ -n "${RELICD_NODE_BINARY:-}" ]; then
        cp "$RELICD_NODE_BINARY" "$STAGE/node"
        return
    fi

    mkdir -p "$CACHE"
    local archive="$CACHE/$NODE_DIST.tar.xz"
    if [ ! -f "$archive" ]; then
        echo "Downloading Node $NODE_VERSION..."
        curl -fsSL -o "$archive" "https://nodejs.org/dist/v${NODE_VERSION}/$NODE_DIST.tar.xz"
    fi

    local expected actual
    expected=$(curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" |
        awk -v f="$NODE_DIST.tar.xz" '$2 == f { print $1 }')
    actual=$(sha256sum "$archive" | cut -d' ' -f1)
    if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
        rm -f "$archive"
        echo "Error: the Node archive does not match its published checksum." >&2
        exit 1
    fi

    tar -xJf "$archive" -C "$CACHE" "$NODE_DIST/bin/node"
    cp "$CACHE/$NODE_DIST/bin/node" "$STAGE/node"
}

for required in public/bin/x64/linux/legendary public/bin/zoom/zoom-platform.sh; do
    [ -f "$required" ] || {
        echo "Error: missing $required. Run: pnpm download-helper-binaries" >&2
        exit 1
    }
done

echo "[1/4] Building the bundle..."
pnpm build

echo "[2/4] Staging $STAGE..."
rm -rf "$STAGE"
mkdir -p "$STAGE/public/bin"
cp build/relicd.cjs "$STAGE/relicd.cjs"
cp -r public/locales "$STAGE/public/locales"
# x64 only: the arm64 helper binaries are not part of this release
cp -r public/bin/x64 public/bin/umu public/bin/zoom public/bin/legendary.LICENSE "$STAGE/public/bin/"
cp COPYING API.md "$STAGE/"
fetch_node

cat >"$STAGE/relicd" <<'LAUNCHER'
#!/bin/bash
# Steam's runtime environment can break the bundled Node, so start clean.
DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
unset LD_PRELOAD LD_LIBRARY_PATH
exec "$DIR/node" "$DIR/relicd.cjs" "$@"
LAUNCHER
chmod +x "$STAGE/relicd" "$STAGE/node"

echo "[3/4] Creating $TARBALL..."
rm -f "$TARBALL" "$TARBALL.sha256"
tar -czf "$TARBALL" -C "$OUT_DIR" relicd

echo "[4/4] Checksum..."
(cd "$OUT_DIR" && sha256sum "$(basename "$TARBALL")" >"$(basename "$TARBALL").sha256")

echo "Done: $TARBALL ($(du -h "$TARBALL" | cut -f1))"
