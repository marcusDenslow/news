#!/usr/bin/env sh
# One-command setup. Generates secrets (once), starts everything, and mints the
# Miniflux API token automatically. Safe to re-run.
#
# Usage: ./setup.sh [--port N] [--profile heavy]
#   --port N          publish the reader on host port N (default 3000)
#   --profile heavy   also run the Chromium renderer (for JS-rendered paywalls)
set -eu
cd "$(dirname "$0")"

HEAVY=0
PORT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --profile) [ "${2:-}" = "heavy" ] && HEAVY=1; shift; [ $# -gt 0 ] && shift ;;
    --heavy) HEAVY=1; shift ;;
    --port) PORT="${2:-}"; shift; [ $# -gt 0 ] && shift ;;
    --port=*) PORT="${1#--port=}"; shift ;;
    -h | --help) echo "usage: ./setup.sh [--port N] [--profile heavy]"; exit 0 ;;
    *) echo "unknown arg: $1 (see --help)"; exit 1 ;;
  esac
done

gen() { openssl rand -hex "$1" 2>/dev/null || head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
getval() { grep "^$1=" .env 2>/dev/null | head -n1 | cut -d= -f2-; }
setval() {
  touch .env
  { grep -v "^$1=" .env 2>/dev/null || true; printf '%s=%s\n' "$1" "$2"; } > .env.tmp
  mv .env.tmp .env
}
ensure_secret() {
  v=$(getval "$1")
  if [ -z "$v" ] || [ "$v" = "placeholder" ]; then setval "$1" "$(gen "$2")"; echo "  generated $1"; fi
}

[ -f .env ] || { cp .env.example .env; echo "created .env from .env.example"; }

echo "securing secrets..."
ensure_secret CAPTURE_TOKEN 24
ensure_secret NEWSHUB_SECRET_KEY 32
[ -n "$(getval MINIFLUX_TOKEN)" ] || setval MINIFLUX_TOKEN placeholder

[ -n "$PORT" ] && { setval WEB_PORT "$PORT"; echo "  reader port -> $PORT"; }
WEB_PORT=$(getval WEB_PORT); WEB_PORT=${WEB_PORT:-3000}

# --profile heavy is sticky: once the renderer URL is set it stays on across re-runs.
[ -n "$(getval NEWSHUB_RENDERER_URL)" ] && HEAVY=1
[ "$HEAVY" = "1" ] && { setval NEWSHUB_RENDERER_URL "http://renderer:4000"; echo "  Chromium renderer: on"; }

echo "starting db + miniflux..."
docker compose up -d db miniflux

if [ "$(getval MINIFLUX_TOKEN)" = "placeholder" ]; then
  ADMIN_USER=$(getval ADMIN_USERNAME); ADMIN_USER=${ADMIN_USER:-admin}
  ADMIN_PASS=$(getval ADMIN_PASSWORD); ADMIN_PASS=${ADMIN_PASS:-changeme123}

  printf "waiting for miniflux"
  i=0
  until curl -sf http://localhost:8080/healthcheck >/dev/null 2>&1; do
    i=$((i + 1)); [ "$i" -ge 90 ] && { echo " timeout"; exit 1; }
    printf "."; sleep 1
  done
  echo " ready"

  TOKEN=""; n=0
  while [ "$n" -lt 10 ]; do
    TOKEN=$(curl -s -u "$ADMIN_USER:$ADMIN_PASS" -X POST http://localhost:8080/v1/api-keys \
      -H "Content-Type: application/json" -d "{\"description\":\"newshub-$(date +%s)\"}" \
      | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    [ -n "$TOKEN" ] && break
    n=$((n + 1)); sleep 2
  done
  [ -n "$TOKEN" ] || { echo "could not mint Miniflux token — create one in the UI and put it in .env"; exit 1; }
  setval MINIFLUX_TOKEN "$TOKEN"
  echo "minted Miniflux API token"
fi

if [ "$HEAVY" = "1" ]; then
  echo "building + starting reader + Chromium renderer..."
  docker compose --profile heavy up -d --build web renderer
else
  echo "building + starting the reader..."
  docker compose up -d --build web
fi

IP=$(hostname -I 2>/dev/null | awk '{print $1}'); IP=${IP:-localhost}
echo ""
echo "Ready."
echo "  Reader:        http://$IP:$WEB_PORT"
echo "  Miniflux:      http://$IP:8080"
echo "  Capture token: $(getval CAPTURE_TOKEN)"
echo "    (use it in the extension / \`cli/newshub config\` to link subscriptions)"
