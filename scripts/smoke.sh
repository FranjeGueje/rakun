#!/bin/bash
# Quick check of a running rakun: scripts/smoke.sh [channel [json-args]]
#   scripts/smoke.sh                       health + a few read-only calls
#   scripts/smoke.sh getLibrary '["gog"]'  call one channel
#   scripts/smoke.sh --events              follow /events
set -euo pipefail

CREDS="${RAKUN_API_FILE:-$HOME/.config/rakun/api.json}"
[ -r "$CREDS" ] || { echo "No $CREDS: is rakun running?" >&2; exit 1; }

PORT=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['port'])" "$CREDS")
TOKEN=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['token'])" "$CREDS")
BASE="http://127.0.0.1:$PORT"

call() { # channel [json args]
    local body="${2:-[]}"
    local reply status
    reply=$(curl -sS -w '\n%{http_code}' -X POST -H "x-rakun-token: $TOKEN" \
        -H 'Content-Type: application/json' -d "{\"args\": $body}" "$BASE/api/$1")
    status=${reply##*$'\n'}
    printf '%s\n' "${reply%$'\n'*}"
    if [ "$status" != 200 ]; then
        echo "HTTP $status" >&2
        [ "$status" = 400 ] && echo "(args must be valid JSON: strings need double quotes, e.g. '[\"gog\"]')" >&2
        return 1
    fi
}

case "${1:-}" in
    --events)
        exec curl -fsSN -H "x-rakun-token: $TOKEN" "$BASE/events"
        ;;
    "")
        echo "== health";  curl -fsS "$BASE/health"; echo
        echo "== version"; call getRakunVersion
        echo "== queue";   call getDMQueueInformation
        echo "== accounts"; call getAccounts
        echo "== library (first 300 chars)"; call getLibrary '["all"]' | head -c 300; echo
        echo "== not exposed (expect 403)"
        curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "x-rakun-token: $TOKEN" "$BASE/api/quit"
        ;;
    *)
        call "$1" "${2:-[]}"
        ;;
esac
