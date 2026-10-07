#!/bin/bash
# Installs rakun from a release tarball of THIS machine's architecture (x64 or arm64):
#   scripts/install.sh                      the newest one in this checkout's dist/
#   scripts/install.sh <folder>             the newest one in that folder
#   scripts/install.sh <file | URL>         that tarball (rakun-<v>-linux-<arch>.tar.gz)
# If a .sha256 file sits next to the tarball (or next to the URL) it is checked.
#
# It installs to ~/.local/opt/rakun and links ~/.local/bin/rakun. It does not
# create any service: start rakun yourself (see the end of this script's output).
set -euo pipefail

machine_arch() {
    case "$(uname -m)" in
        x86_64) echo x64 ;;
        aarch64 | arm64) echo arm64 ;;
        *)
            echo "Error: unsupported architecture: $(uname -m) (x64 and arm64 are available)." >&2
            exit 1
            ;;
    esac
}

ARCH=$(machine_arch)

# The newest rakun-*-linux-$ARCH.tar.gz of a folder
newest_tarball() {
    local dir="$1" found
    found=$(ls "$dir"/rakun-*-linux-"$ARCH".tar.gz 2>/dev/null | sort -V | tail -n 1 || true)
    [ -n "$found" ] || {
        echo "Error: there is no rakun-*-linux-$ARCH.tar.gz in $dir." >&2
        echo "       Build it with: pnpm package $ARCH" >&2
        exit 1
    }
    echo "$found"
}

# A name that says it is for another architecture is refused before anything else
refuse_other_arch() {
    local name other
    name=$(basename "$1")
    for other in x64 arm64; do
        if [ "$other" != "$ARCH" ] && [[ "$name" == *"-linux-$other."* ]]; then
            echo "Error: $name is for $other and this machine is $ARCH." >&2
            exit 1
        fi
    done
}

SOURCE="${1:-}"
if [ -z "$SOURCE" ]; then
    SOURCE=$(newest_tarball "$(cd "$(dirname "$0")/.." && pwd)/dist")
elif [ -d "$SOURCE" ]; then
    SOURCE=$(newest_tarball "$SOURCE")
fi
refuse_other_arch "$SOURCE"
echo "Installing $(basename "$SOURCE") (${ARCH})"

PREFIX="$HOME/.local/opt/rakun"
BIN_DIR="$HOME/.local/bin"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

TARBALL="$WORK/rakun.tar.gz"
case "$SOURCE" in
    http://* | https://*)
        echo "Downloading $SOURCE..."
        curl -fsSL -o "$TARBALL" "$SOURCE"
        curl -fsSL -o "$WORK/rakun.sha256" "$SOURCE.sha256" 2>/dev/null || true
        ;;
    *)
        [ -f "$SOURCE" ] || {
            echo "Error: $SOURCE does not exist" >&2
            exit 1
        }
        cp "$SOURCE" "$TARBALL"
        [ -f "$SOURCE.sha256" ] && cp "$SOURCE.sha256" "$WORK/rakun.sha256"
        ;;
esac

if [ -f "$WORK/rakun.sha256" ]; then
    expected=$(cut -d' ' -f1 "$WORK/rakun.sha256")
    actual=$(sha256sum "$TARBALL" | cut -d' ' -f1)
    [ "$expected" = "$actual" ] || {
        echo "Error: the checksum does not match." >&2
        exit 1
    }
    echo "Checksum OK."
else
    echo "Warning: no .sha256 file, the integrity is not checked."
fi

tar -xzf "$TARBALL" -C "$WORK"
[ -x "$WORK/rakun/rakun" ] || {
    echo "Error: the tarball does not contain rakun/rakun." >&2
    exit 1
}
# A tarball of another architecture (or a broken one) is found here, before the
# installation that works is replaced
"$WORK/rakun/node" --version >/dev/null 2>&1 || {
    echo "Error: the Node of the tarball does not run on this machine ($ARCH)." >&2
    exit 1
}

mkdir -p "$(dirname "$PREFIX")" "$BIN_DIR"
rm -rf "$PREFIX.new"
mv "$WORK/rakun" "$PREFIX.new"
rm -rf "$PREFIX"
mv "$PREFIX.new" "$PREFIX"
ln -sf "$PREFIX/rakun" "$BIN_DIR/rakun"
ln -sf "$PREFIX/rakunctl" "$BIN_DIR/rakunctl"

cat <<MSG

rakun installed in $PREFIX (links: $BIN_DIR/rakun and $BIN_DIR/rakunctl).

Start it whenever you need it:
  rakun                                    in the foreground (Ctrl+C stops it)
  rakunctl start                           in the background
  rakunctl install-service                 as a user service, started at every login

Check it:
  rakunctl status         (or: curl http://127.0.0.1:17370/health)

The web, in a browser on this machine:  http://127.0.0.1:17370
  By default only this machine can open it. For the whole network (WITHOUT
  protection, home use only) or to turn it off:  rakunctl start --web network | off
  With the saved setting:                        rakunctl config webAccess network | off
MSG
