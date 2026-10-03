#!/usr/bin/env bash
# Regenerates the Bruno collection from the live OpenAPI spec, so the requests
# follow the routes instead of drifting away from them.
#
#   ./test/bruno/regenerate.sh
#
# Overwrites test/bruno, including any hand written request. Environments are
# kept, put anything manual in there.
set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_URL="${API_URL:-http://localhost:8080}"
OUT="$API_DIR/test/bruno"

SPEC="$(mktemp)"
trap 'rm -f "$SPEC"' EXIT

# The spec is only built once the API finished booting, which takes a while on a
# cold local ratings cache.
for _ in $(seq 1 60); do
    if curl -fsS "$API_URL/swagger/json" -o "$SPEC"; then
        break
    fi
    sleep 2
done

test -s "$SPEC" || { echo "could not read the spec from $API_URL/swagger/json" >&2; exit 1; }

rm -rf "${OUT:?}/Replays" "${OUT:?}/Users" "${OUT:?}/Local_Ratings" "${OUT:?}/Lobby_Users" "${OUT:?}/Health"
npx --yes @usebruno/cli@latest import openapi -s "$SPEC" -o "$OUT" -g tags -n "Replay Pallas API"

echo "==> collection regenerated in $OUT"