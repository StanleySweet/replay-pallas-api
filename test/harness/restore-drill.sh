#!/bin/bash
# Restore drill: proves a backup of the production database restores into a working API.
#
#   test/harness/restore-drill.sh /path/to/replay-pallas.sqlite3
#
# Copies the backup into a scratch folder laid out like the container, runs the integrity check, boots
# the API on it with a made up JOSE_SECRET (never the production one), and captures every endpoint with
# test/harness/capture.cjs. Needs a build (npx tsc -p tsconfig.json), sqlite3 and curl; Node 22 like the
# Docker image, or a Node whose better-sqlite3 build matches. The scratch folder holds real nicknames:
# it is deleted at the end, and nothing of it belongs in a repository.
set -euo pipefail
BACKUP=${1:?usage: restore-drill.sh BACKUP_DB}
API_DIR=$(cd "$(dirname "$0")/../.." && pwd)
RUN=$(mktemp -d)
PORT=${DRILL_PORT:-18098}
trap 'kill $SERVER_PID 2>/dev/null || true; if [ -n "${DRILL_KEEP:-}" ]; then echo "kept: $RUN"; else rm -rf "$RUN"; fi' EXIT

mkdir -p "$RUN/dist"
cp -R "$API_DIR/dist/." "$RUN/dist/"
rm -rf "$RUN/dist/cache"; mkdir -p "$RUN/dist/cache"
cp "$BACKUP" "$RUN/dist/cache/replay-pallas.sqlite3"
for name in src node_modules package.json; do ln -s "$API_DIR/$name" "$RUN/$name"; done
DB="$RUN/dist/cache/replay-pallas.sqlite3"

# On the copy, not read only: a WAL database opened read only needs its -shm file to exist already.
echo "integrity: $(sqlite3 "$DB" 'PRAGMA integrity_check;' | head -3 | tr '\n' ' ')"
echo "replays: $(sqlite3 "$DB" 'select count(*) from replays;') players: $(sqlite3 "$DB" 'select count(*) from lobby_players;') users: $(sqlite3 "$DB" 'select count(*) from users;')"

cd "$RUN"
START=$(date +%s)
JOSE_SECRET=drill API_PORT=$PORT node dist/index.js > server.log 2>&1 &
SERVER_PID=$!
disown
for _ in $(seq 1 600); do curl -fsS -o /dev/null "http://localhost:$PORT/swagger/json" 2>/dev/null && break; sleep 1; done
echo "api answered after $(( $(date +%s) - START )) s"

MID=$(sqlite3 -readonly "$DB" 'select match_id from replays order by creation_date desc limit 1;')
LID=$(sqlite3 -readonly "$DB" 'select lobby_player_id from replay_lobby_player_link limit 1;')
API=http://localhost:$PORT JOSE_SECRET=drill MID=$MID LID=$LID OUT="$RUN/out" node "$API_DIR/test/harness/capture.cjs" | grep -E '"/replays/(latest-list-items|all-list-items|latest)"|"zip"|"/local-ratings/users"|"/replays/releases"|"/users/GetDetails/1"' || true
echo "errors in the server log: $(grep -c '"level":50' server.log || true)"
echo "restore drill finished"
