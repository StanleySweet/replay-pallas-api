#!/usr/bin/env bash
# Builds and runs the Replay Pallas stack on podman.
#
# Topology: the only published port is the web container. The API stays on the
# internal network and is reached through nginx, so it has no host exposure.
#
#   browser -> :$WEB_PORT (nginx) -> static SPA
#                            \-> /users /replays /local-ratings /health -> api
#                                          api -> volume at /app/dist/cache
#
# Usage: ./run.sh [up|down|logs|rebuild]
set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$API_DIR/../replay-pallas" && pwd)"

NETWORK=pallas
VOLUME=replay-pallas-data
API_IMAGE=localhost/replay-pallas-api
WEB_IMAGE=localhost/replay-pallas-web
API_CONTAINER=replay-pallas-api
WEB_CONTAINER=replay-pallas-web

ENV_FILE="$API_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
    set -a; source "$ENV_FILE"; set +a
fi
: "${JOSE_SECRET:?JOSE_SECRET is required. Copy $API_DIR/.env.example to $ENV_FILE and set it (openssl rand -base64 48).}"
WEB_PORT="${WEB_PORT:-8080}"

# The bcrypt salts are public constants compiled into the browser bundle, so
# they are build args rather than runtime env. Fall back to the tracked .env.bak
# so a fresh clone builds without extra setup.
if [[ -z "${VITE_PASSWORD_SALT:-}" || -z "${VITE_EMAIL_SALT:-}" ]]; then
    if [[ -f "$WEB_DIR/.env.bak" ]]; then
        VITE_PASSWORD_SALT="$(grep '^VITE_PASSWORD_SALT=' "$WEB_DIR/.env.bak" | cut -d= -f2- | tr -d '"' | sed 's/\\//g')"
        VITE_EMAIL_SALT="$(grep '^VITE_EMAIL_SALT=' "$WEB_DIR/.env.bak" | cut -d= -f2- | tr -d '"' | sed 's/\\//g')"
    fi
fi
: "${VITE_PASSWORD_SALT:?VITE_PASSWORD_SALT not set and no $WEB_DIR/.env.bak to read it from}"
: "${VITE_EMAIL_SALT:?VITE_EMAIL_SALT not set and no $WEB_DIR/.env.bak to read it from}"

build() {
    # --format docker is required: podman silently drops HEALTHCHECK from OCI
    # images, so the container would never report its own health.
    echo "==> building api image"
    podman build --format docker -t "$API_IMAGE" "$API_DIR"

    echo "==> building web image"
    podman build --format docker -t "$WEB_IMAGE" \
        --build-arg "VITE_API_URL=" \
        --build-arg "VITE_PASSWORD_SALT=$VITE_PASSWORD_SALT" \
        --build-arg "VITE_EMAIL_SALT=$VITE_EMAIL_SALT" \
        "$WEB_DIR"
}

up() {
    build
    podman network exists "$NETWORK" || podman network create "$NETWORK"
    podman volume exists "$VOLUME" || podman volume create "$VOLUME"

    # Resolved inside podman's own storage, so this is a valid path for podman
    # commands and for the emptiness check below, but on macOS it lives inside
    # the Linux VM and is NOT reachable from the host filesystem directly.
    local volume_path
    volume_path="$(podman volume inspect "$VOLUME" --format '{{.Mountpoint}}')"

    # On first boot the volume is empty, so there is no database and no users.
    # Migrations 001-009 run at startup and build the schema from scratch;
    # register a user through the UI afterwards.
    if [[ ! -f "$volume_path/replay-pallas.sqlite3" ]]; then
        echo "==> empty volume: database will be created by migrations on first boot"
    fi

    podman rm -f "$API_CONTAINER" "$WEB_CONTAINER" 2>/dev/null || true

    # CWD is /app because the API resolves dist/cache, src/migrations and
    # src/local-ratings/types/options.json relative to the working directory.
    podman run -d --name "$API_CONTAINER" \
        --network "$NETWORK" \
        --network-alias api \
        --env-file "$ENV_FILE" \
        -e JOSE_SECRET \
        -v "$VOLUME:/app/dist/cache" \
        "$API_IMAGE"

    podman run -d --name "$WEB_CONTAINER" \
        --network "$NETWORK" \
        -p "$WEB_PORT:80" \
        "$WEB_IMAGE"

    echo
    podman ps --filter "name=replay-pallas"
    echo
    echo "  app:   http://localhost:$WEB_PORT"
    echo "  db:    volume '$VOLUME' -> /app/dist/cache/replay-pallas.sqlite3"
    echo "         (inside the podman VM; reach it with 'podman exec replay-pallas-api ...')"
}

down() {
    podman rm -f "$WEB_CONTAINER" "$API_CONTAINER" 2>/dev/null || true
    echo "==> containers removed. Volume '$VOLUME' kept; use 'podman volume rm $VOLUME' to discard the database."
}

case "${1:-up}" in
    up)      up ;;
    down)    down ;;
    logs)    podman logs -f "$API_CONTAINER" ;;
    rebuild) down; up ;;
    *)       echo "usage: $0 [up|down|logs|rebuild]" >&2; exit 1 ;;
esac
