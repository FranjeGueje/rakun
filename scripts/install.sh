#!/bin/bash
# Installs relicd from a release tarball:
#   scripts/install.sh dist/relicd-0.1.0-linux-x64.tar.gz
#   scripts/install.sh https://example.org/relicd-0.1.0-linux-x64.tar.gz
# If a .sha256 file sits next to the tarball (or next to the URL) it is checked.
#
# It installs to ~/.local/opt/relicd and links ~/.local/bin/relicd. It does not
# create any service: start relicd yourself (see the end of this script's output).
set -euo pipefail

SOURCE="${1:-}"
[ -n "$SOURCE" ] || {
    echo "Uso: $0 <relicd-X.Y.Z-linux-x64.tar.gz | URL>" >&2
    exit 1
}

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
