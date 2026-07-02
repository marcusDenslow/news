#!/usr/bin/env sh
# One-command setup. Generates secrets (once), starts everything, and mints the
# Miniflux API token automatically. Safe to re-run — it never clobbers existing
# secrets or a working token.
set -eu
cd "$(dirname "$0")"

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

echo "building + starting the reader..."
docker compose up -d --build web

IP=$(hostname -I 2>/dev/null | awk '{print $1}'); IP=${IP:-localhost}
echo ""
echo "Ready."
echo "  Reader:        http://$IP:3000"
echo "  Miniflux:      http://$IP:8080"
echo "  Capture token: $(getval CAPTURE_TOKEN)"
echo "    (use it in the extension / \`cli/newshub config\` to link subscriptions)"
