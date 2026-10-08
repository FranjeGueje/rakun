#!/bin/bash
# Builds dist/rakun-<version>-linux-<arch>.tar.gz (+ .sha256) for x64, arm64 or both:
#   rakun/rakun        launcher
#   rakun/node          Node runtime of that architecture (SteamOS does not ship one)
#   rakun/rakun.cjs    the bundled daemon
#   rakun/rakunctl      launcher of the command line client (rakunctl.cjs)
#   rakun/web/          the web rakun serves on its port (built from web/ by `pnpm build`)
#   rakun/THIRD_PARTY   the helper binaries rakun runs, their origin and licences
#                        (the texts of the licences travel only with the -full tarball,
#                        the one that carries the programs)
#
# That is the normal tarball: it has NO helper binaries, `rakunctl helpers update`
# downloads them (the versions rakun was tested with, checked by sha256). With
# --full it also builds rakun-<version>-linux-<arch>-full.tar.gz, which carries them
# and the texts of their licences (rakun/licenses/):
#   rakun/public/bin/   legendary, gogdl and nile for <arch>/linux, the x64/win32 ones
#                        (they run inside Wine/Proton, so both architectures need
#                        them, comet.exe among them), umu and zoom
#
# Usage: scripts/package.sh [x64|arm64|all] [--full]      (default: all, normal only)
#   RAKUN_NODE_BINARY=/path/to/node   use this node instead of downloading it
#                                      (only with a single architecture)
set -euo pipefail

cd "$(dirname "$0")/.."

NODE_VERSION="24.16.0"
VERSION=$(node -p "require('./package.json').version")
OUT_DIR="dist"
CACHE="build/cache"

FULL=0
TARGET=all
for arg in "$@"; do
    case "$arg" in
        --full) FULL=1 ;;
        x64 | arm64 | all) TARGET="$arg" ;;
        *)
            echo "Usage: $0 [x64|arm64|all] [--full]" >&2
            exit 1
            ;;
    esac
done

case "$TARGET" in
    x64) ARCHS=(x64) ;;
    arm64) ARCHS=(arm64) ;;
    all) ARCHS=(x64 arm64) ;;
esac

if [ -n "${RAKUN_NODE_BINARY:-}" ] && [ "${#ARCHS[@]}" -ne 1 ]; then
    echo "Error: RAKUN_NODE_BINARY only works with a single architecture (x64 or arm64)." >&2
    exit 1
fi

# Node's own name for the architecture
node_arch() { [ "$1" = x64 ] && echo x64 || echo arm64; }

# The only native binaries that ship. public/bin is not tracked by git, so a leftover
# of an old download (the native Comet, say) must not travel just because it is there.
LINUX_HELPERS=(legendary gogdl nile)

fetch_node() { # arch, stage
    if [ -n "${RAKUN_NODE_BINARY:-}" ]; then
        cp "$RAKUN_NODE_BINARY" "$2/node"
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
    local helper
    for helper in "${LINUX_HELPERS[@]}"; do
        [ -e "public/bin/$1/linux/$helper" ] || {
            echo "Error: missing public/bin/$1/linux/$helper. Run: pnpm download-helper-binaries" >&2
            exit 1
        }
    done
    for required in public/bin/x64/win32 public/bin/zoom/zoom-platform.sh; do
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

stage_helpers() { # arch, stage: what the full tarball adds
    local helper bin="$2/rakun/public/bin"
    mkdir -p "$bin/$1/linux"
    for helper in "${LINUX_HELPERS[@]}"; do
        cp "public/bin/$1/linux/$helper" "$bin/$1/linux/"
    done
    cp -r public/bin/umu public/bin/zoom "$bin/"
    mkdir -p "$bin/x64"
    cp -r public/bin/x64/win32 "$bin/x64/"
    cp public/bin/.release_tags "$bin/"
    cp -r licenses "$2/rakun/licenses"
}

stage_package() { # arch, stage, full (0 or 1)
    cp build/rakun.cjs build/rakunctl.cjs "$2/rakun/"
    if [ "$3" -eq 1 ]; then stage_helpers "$1" "$2"; fi
    cp COPYING AUTHORS API.md THIRD_PARTY "$2/rakun/"
    cp -r build/web "$2/rakun/web"
    fetch_node "$1" "$2/rakun"
    make_launcher "$2/rakun" rakun
    make_launcher "$2/rakun" rakunctl
    chmod +x "$2/rakun/node"
}

package_arch() { # arch, full (0 or 1)
    local suffix=""
    if [ "$2" -eq 1 ]; then suffix="-full"; fi
    local tarball="$OUT_DIR/rakun-${VERSION}-linux-$1$suffix.tar.gz"
    local stage="$OUT_DIR/stage-$1$suffix"
    if [ "$2" -eq 1 ]; then check_binaries "$1"; fi
    echo "[$1$suffix] Staging..."
    rm -rf "$stage" "$tarball" "$tarball.sha256"
    mkdir -p "$stage/rakun"
    stage_package "$1" "$stage" "$2"
    echo "[$1$suffix] Creating $tarball..."
    tar -czf "$tarball" -C "$stage" rakun
    rm -rf "$stage"
    (cd "$OUT_DIR" && sha256sum "$(basename "$tarball")" >"$(basename "$tarball").sha256")
    echo "[$1$suffix] Done: $tarball ($(du -h "$tarball" | cut -f1))"
}

echo "Building the bundle..."
pnpm build
mkdir -p "$OUT_DIR"
for arch in "${ARCHS[@]}"; do
    package_arch "$arch" 0
    if [ "$FULL" -eq 1 ]; then package_arch "$arch" 1; fi
done
