#!/bin/bash
# Captures what legendary, gogdl and nile print (and their exit codes) in the cases
# rakun depends on, into src/backend/storeManagers/__tests__/helper_fixtures/<helper>-<tag>/.
# `pnpm test` fails when the tag in src/backend/rakun/helpers/manifest.ts has no
# fixtures: run this after bumping a helper, then READ THE DIFF (a changed line is
# a change in what the helper prints, and the parsers may need to change with it).
#
#   scripts/capture-helper-fixtures.sh
#
# It uses EMPTY temporary config folders: no login, no credentials and nothing of
# your own is read or written. The cases are the ones that need no session. The
# output is passed through a filter for temporary paths and process ids; still,
# look at the files before committing them.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/src/backend/storeManagers/__tests__/helper_fixtures"
MANIFEST="$ROOT/src/backend/rakun/helpers/manifest.ts"

case "$(uname -m)" in
    x86_64) ARCH=x64 ;;
    aarch64 | arm64) ARCH=arm64 ;;
    *) echo "Error: unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

BIN="${RAKUN_BIN:-$HOME/.local/share/rakun/bin}/$ARCH/linux"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# The tag a helper is pinned to in the manifest
tag_of() {
    sed -n "/export const RELEASE_TAGS/,/^}/p" "$MANIFEST" | sed -n "s/^ *'\{0,1\}$1'\{0,1\}: '\(.*\)',\{0,1\}\$/\1/p" | head -1
}

# case <helper> <name> <command...>: runs it with empty configs and writes <name>.json
capture() {
    local helper="$1" name="$2"
    shift 2
    local tag dir
    tag=$(tag_of "$helper")
    dir="$OUT/$helper-$tag"
    mkdir -p "$dir"
    local stdout="$TMP/stdout" stderr="$TMP/stderr" code=0
    ( cd "$TMP" && timeout 60 "$@" >"$stdout" 2>"$stderr" ) || code=$?
    node -e '
        const fs = require("fs")
        const [, tmp, file, name, helper, code, ...args] = process.argv
        // Temporary paths and process ids change at every run: they must not show up as a diff
        const clean = (text) =>
          text
            .split(tmp).join("<TMP>")
            .replace(/PYI-\d+/g, "PYI-<pid>")
            .replace(/_MEI[A-Za-z0-9_]+/g, "_MEI<id>")
            .replace(/0x[0-9a-f]{6,}/g, "0x<addr>")
            .replace(new RegExp(process.env.HOME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "<HOME>")
        fs.writeFileSync(file, JSON.stringify({
          helper, case: name, args: args.map(clean),
          exit: Number(code),
          stdout: clean(fs.readFileSync(tmp + "/stdout", "utf8")),
          stderr: clean(fs.readFileSync(tmp + "/stderr", "utf8"))
        }, null, 2) + "\n")
    ' "$TMP" "$dir/$name.json" "$name" "$helper" "$code" "${@:2}"
    echo "  $helper-$tag/$name.json (exit $code)"
}

export LEGENDARY_CONFIG_PATH="$TMP/legendary" GOGDL_CONFIG_PATH="$TMP/gogdl" NILE_CONFIG_PATH="$TMP/nile"
mkdir -p "$TMP/legendary" "$TMP/gogdl" "$TMP/nile"

echo "legendary"
capture legendary version "$BIN/legendary" --version
capture legendary install-no-session "$BIN/legendary" install fakeapp -y
echo "gogdl"
capture gogdl version "$BIN/gogdl" --version
capture gogdl auth-no-session "$BIN/gogdl" --auth-config-path "$TMP/gogdl/auth.json" auth
capture gogdl download-no-session "$BIN/gogdl" --auth-config-path "$TMP/gogdl/auth.json" download 123 --platform windows --path "$TMP/g" --support "$TMP/s" --lang en-US
echo "nile"
capture nile version "$BIN/nile" --version
capture nile list-updates-nothing-installed "$BIN/nile" list-updates --json
capture nile install-no-session "$BIN/nile" install --base-path "$TMP/n" fakeid

echo
echo "Done. Read the files before committing them: $OUT"
