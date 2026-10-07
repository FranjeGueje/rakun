#!/bin/bash
# Builds dist/relicd-<version>-linux-<arch>.tar.gz (+ .sha256) for x64, arm64 or both:
#   relicd/relicd        launcher
#   relicd/node          Node runtime of that architecture (SteamOS does not ship one)
#   relicd/relicd.cjs    the bundled daemon
#   relicd/relicctl      launcher of the command line client (relicctl.cjs)
#   relicd/public/bin/   helper binaries: <arch>/linux, x64/win32 (they run inside
#                        Wine/Proton, so both architectures need them), umu and zoom
#
# Usage: scripts/package.sh [x64|arm64|all]      (default: all)
#   RELICD_NODE_BINARY=/path/to/node   use this node instead of downloading it
#                                      (only with a single architecture)
set -euo pipefail

cd "$(dirname "$0")/.."

NODE_VERSION="24.16.0"
VERSION=$(node -p "require('./package.json').version")
OUT_DIR="dist"
CACHE="build/cache"

case "${1:-all}" in
    x64) ARCHS=(x64) ;;
    arm64) ARCHS=(arm64) ;;
    all) ARCHS=(x64 arm64) ;;
    *)
        echo "Uso: $0 [x64|arm64|all]" >&2
        exit 1
        ;;
esac

if [ -n "${RELICD_NODE_BINARY:-}" ] && [ "${#ARCHS[@]}" -ne 1 ]; then
    echo "Error: RELICD_NODE_BINARY solo vale con una arquitectura (x64 o arm64)." >&2
    exit 1
fi

# Node's own name for the architecture
node_arch() { [ "$1" = x64 ] && echo x64 || echo arm64; }

fetch_node() { # arch, stage
    if [ -n "${RELICD_NODE_BINARY:-}" ]; then
        cp "$RELICD_NODE_BINARY" "$2/node"
        return
    fi

    local dist="node-v${NODE_VERSION}-linux-$(node_arch "$1")"
    mkdir -p "$CACHE"
    local archive="$CACHE/$dist.tar.xz"
    if [ ! -f "$archive" ]; then
        echo "Downloading Node $NODE_VERSION ($1)..."
        curl -fsSL -o "$archive" "https://nodejs.org/dist/v${NODE_VERSION}/$dist.tar.xz"
    fi

    local expected actual
    expected=$(curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" |
        awk -v f="$dist.tar.xz" '$2 == f { print $1 }')
    actual=$(sha256sum "$archive" | cut -d' ' -f1)
    if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
        rm -f "$archive"
        echo "Error: the Node archive does not match its published checksum." >&2
        exit 1
    fi

    tar -xJf "$archive" -C "$CACHE" "$dist/bin/node"
    cp "$CACHE/$dist/bin/node" "$2/node"
}

check_binaries() { # arch
    for required in "public/bin/$1/linux/legendary" public/bin/x64/win32 public/bin/zoom/zoom-platform.sh; do
        [ -e "$required" ] || {
            echo "Error: missing $required. Run: pnpm download-helper-binaries" >&2
            exit 1
        }
    done
}

# Steam's runtime environment can break the bundled Node, so start clean.
make_launcher() { # stage, name of the launcher and of the bundle it runs
    cat >"$1/$2" <<LAUNCHER
#!/bin/bash
DIR="\$(cd "\$(dirname "\$(readlink -f "\$0")")" && pwd)"
unset LD_PRELOAD LD_LIBRARY_PATH
exec "\$DIR/node" "\$DIR/$2.cjs" "\$@"
LAUNCHER
    chmod +x "$1/$2"
}

stage_package() { # arch, stage
    local bin="$2/relicd/public/bin"
    mkdir -p "$bin/$1"
    cp build/relicd.cjs build/relicctl.cjs "$2/relicd/"
    cp -r "public/bin/$1/linux" "$bin/$1/"
    cp -r public/bin/umu public/bin/zoom public/bin/legendary.LICENSE "$bin/"
    mkdir -p "$bin/x64"
    cp -r public/bin/x64/win32 "$bin/x64/"
    cp COPYING API.md "$2/relicd/"
    fetch_node "$1" "$2/relicd"
    make_launcher "$2/relicd" relicd
    make_launcher "$2/relicd" relicctl
    chmod +x "$2/relicd/node"
}

package_arch() { # arch
    local tarball="$OUT_DIR/relicd-${VERSION}-linux-$1.tar.gz"
    local stage="$OUT_DIR/stage-$1"
    check_binaries "$1"
    echo "[$1] Staging..."
    rm -rf "$stage" "$tarball" "$tarball.sha256"
    mkdir -p "$stage/relicd"
    stage_package "$1" "$stage"
    echo "[$1] Creating $tarball..."
    tar -czf "$tarball" -C "$stage" relicd
    rm -rf "$stage"
    (cd "$OUT_DIR" && sha256sum "$(basename "$tarball")" >"$(basename "$tarball").sha256")
    echo "[$1] Done: $tarball ($(du -h "$tarball" | cut -f1))"
}

echo "Building the bundle..."
pnpm build
mkdir -p "$OUT_DIR"
for arch in "${ARCHS[@]}"; do
    package_arch "$arch"
done
