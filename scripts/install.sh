#!/bin/bash
# Installs relicd from a release tarball of THIS machine's architecture (x64 or arm64):
#   scripts/install.sh                      the newest one in this checkout's dist/
#   scripts/install.sh <folder>             the newest one in that folder
#   scripts/install.sh <file | URL>         that tarball (relicd-<v>-linux-<arch>.tar.gz)
# If a .sha256 file sits next to the tarball (or next to the URL) it is checked.
#
# It installs to ~/.local/opt/relicd and links ~/.local/bin/relicd. It does not
# create any service: start relicd yourself (see the end of this script's output).
set -euo pipefail

machine_arch() {
    case "$(uname -m)" in
        x86_64) echo x64 ;;
        aarch64 | arm64) echo arm64 ;;
        *)
            echo "Error: arquitectura no soportada: $(uname -m) (hay x64 y arm64)." >&2
            exit 1
            ;;
    esac
}

ARCH=$(machine_arch)

# The newest relicd-*-linux-$ARCH.tar.gz of a folder
newest_tarball() {
    local dir="$1" found
    found=$(ls "$dir"/relicd-*-linux-"$ARCH".tar.gz 2>/dev/null | sort -V | tail -n 1 || true)
    [ -n "$found" ] || {
        echo "Error: no hay ningún relicd-*-linux-$ARCH.tar.gz en $dir." >&2
        echo "       Constrúyelo con: pnpm package $ARCH" >&2
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
            echo "Error: $name es para $other y esta máquina es $ARCH." >&2
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
echo "Instalando $(basename "$SOURCE") (${ARCH})"

PREFIX="$HOME/.local/opt/relicd"
BIN_DIR="$HOME/.local/bin"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

TARBALL="$WORK/relicd.tar.gz"
case "$SOURCE" in
    http://* | https://*)
        echo "Descargando $SOURCE..."
        curl -fsSL -o "$TARBALL" "$SOURCE"
        curl -fsSL -o "$WORK/relicd.sha256" "$SOURCE.sha256" 2>/dev/null || true
        ;;
    *)
        [ -f "$SOURCE" ] || {
            echo "Error: no existe $SOURCE" >&2
            exit 1
        }
        cp "$SOURCE" "$TARBALL"
        [ -f "$SOURCE.sha256" ] && cp "$SOURCE.sha256" "$WORK/relicd.sha256"
        ;;
esac

if [ -f "$WORK/relicd.sha256" ]; then
    expected=$(cut -d' ' -f1 "$WORK/relicd.sha256")
    actual=$(sha256sum "$TARBALL" | cut -d' ' -f1)
    [ "$expected" = "$actual" ] || {
        echo "Error: el checksum no coincide." >&2
        exit 1
    }
    echo "Checksum correcto."
else
    echo "Aviso: sin .sha256, no se verifica la integridad."
fi

tar -xzf "$TARBALL" -C "$WORK"
[ -x "$WORK/relicd/relicd" ] || {
    echo "Error: el tarball no contiene relicd/relicd." >&2
    exit 1
}
# A tarball of another architecture (or a broken one) is found here, before the
# installation that works is replaced
"$WORK/relicd/node" --version >/dev/null 2>&1 || {
    echo "Error: el Node del tarball no se ejecuta en esta máquina ($ARCH)." >&2
    exit 1
}

mkdir -p "$(dirname "$PREFIX")" "$BIN_DIR"
rm -rf "$PREFIX.new"
mv "$WORK/relicd" "$PREFIX.new"
rm -rf "$PREFIX"
mv "$PREFIX.new" "$PREFIX"
ln -sf "$PREFIX/relicd" "$BIN_DIR/relicd"
ln -sf "$PREFIX/relicctl" "$BIN_DIR/relicctl"

cat <<MSG

relicd instalado en $PREFIX (enlaces: $BIN_DIR/relicd y $BIN_DIR/relicctl).

Arrancarlo, cuando lo necesites:
  relicd                                    en primer plano (Ctrl+C lo para)
  systemd-run --user --unit=relicd $PREFIX/relicd   en segundo plano, sin instalar nada
                                            (systemctl --user stop relicd lo para)

Comprobarlo:
  relicctl status         (o: curl http://127.0.0.1:17370/health)
MSG
