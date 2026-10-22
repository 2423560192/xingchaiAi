#!/usr/bin/env bash
# ============================================================================
# new-api production deploy (run ON the server; normally invoked by
# scripts/deploy.ps1 from a workstation).
#
# Usage: bash deploy-remote.sh [web_dist.tgz]
#   with web_dist.tgz : replace web/dist with the uploaded build
#   without           : keep the existing web/dist (backend-only change)
#
# Steps: verify branch/worktree -> git fast-forward pull -> replace web/dist
#        -> go build -> backup old binary -> swap -> restart -> health check
#        (automatic rollback on failure)
#
# Optional env overrides:
#   NEWAPI_REPO / NEWAPI_BUILD_DIR / NEWAPI_BACKUP_DIR / NEWAPI_SERVICE
#   NEWAPI_BRANCH / NEWAPI_PORT / NEWAPI_PUBLIC_URL / GO_BIN
# ============================================================================
set -euo pipefail

REPO="${NEWAPI_REPO:-/root/huidanqing/new-api}"
BUILD_DIR="${NEWAPI_BUILD_DIR:-/root/builds}"
BACKUP_DIR="${NEWAPI_BACKUP_DIR:-/root/backups}"
SERVICE="${NEWAPI_SERVICE:-new-api}"
BRANCH="${NEWAPI_BRANCH:-test}"
PORT="${NEWAPI_PORT:-3000}"
PUBLIC_URL="${NEWAPI_PUBLIC_URL:-https://inko.dev}"
GO_BIN="${GO_BIN:-/usr/local/go/bin/go}"
WEB_TGZ="${1:-}"

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

log "===== new-api deploy start ====="
[ -d "$REPO/.git" ] || fail "repo not found: $REPO"
[ -x "$GO_BIN" ] || fail "go not found: $GO_BIN"

cd "$REPO"

# ---------------------------------------------------------------- 1) pull
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$CURRENT_BRANCH" = "$BRANCH" ] || fail "current branch $CURRENT_BRANCH != expected $BRANCH"
DIRTY="$(git status --porcelain --untracked-files=no | grep -v '^ M VERSION$' || true)"
if [ -n "$DIRTY" ]; then
  echo "$DIRTY"
  fail "working tree has uncommitted changes, abort"
fi

log "fetching origin/$BRANCH ..."
git fetch -q origin "$BRANCH"
git merge --ff-only "origin/$BRANCH" >/dev/null || fail "cannot fast-forward, resolve divergence manually"
TARGET="$(git rev-parse --short HEAD)"
log "target commit: $(git log -1 --format='%h %s')"

# ---------------------------------------------------------------- 2) web dist
if [ -n "$WEB_TGZ" ]; then
  [ -f "$WEB_TGZ" ] || fail "web dist archive not found: $WEB_TGZ"
  log "replacing web/dist from $WEB_TGZ ..."
  rm -rf web/dist
  mkdir -p web/dist
  tar -xzf "$WEB_TGZ" -C web/dist
else
  log "no web dist archive given, keeping existing web/dist"
fi
[ -f web/dist/index.html ] || fail "web/dist/index.html missing, build frontend first"

# ---------------------------------------------------------------- 3) version
VERSION="$(cat VERSION 2>/dev/null | tr -d '[:space:]' || true)"
if [ -z "$VERSION" ]; then
  VERSION="v1.0.0-rc.41"
  printf '%s' "$VERSION" > VERSION
fi
log "version: $VERSION"

# ---------------------------------------------------------------- 4) build
mkdir -p "$BUILD_DIR"
BIN="$BUILD_DIR/new-api-$TARGET"
log "building $BIN ..."
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 "$GO_BIN" build \
  -ldflags "-s -w -X 'github.com/QuantumNous/new-api/common.Version=$VERSION'" \
  -o "$BIN" . || fail "go build failed"
ls -l "$BIN"

# ---------------------------------------------------------------- 5) swap
mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
PREV_BIN="$BACKUP_DIR/new-api.bin.$TS"
cp -a new-api "$PREV_BIN"
log "previous binary backed up: $PREV_BIN"

rollback() {
  log "!! health check failed, rolling back ..."
  systemctl stop "$SERVICE" || true
  cp -a "$PREV_BIN" new-api
  chmod 755 new-api
  systemctl start "$SERVICE" || true
  sleep 3
  log "service after rollback: $(systemctl is-active "$SERVICE" || true)"
  exit 1
}

systemctl stop "$SERVICE"
cp -a "$BIN" new-api
chmod 755 new-api
systemctl start "$SERVICE"
sleep 6

# ---------------------------------------------------------------- 6) health
OK=0
for _ in $(seq 1 20); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://127.0.0.1:$PORT/api/status" || true)"
  if [ "$CODE" = "200" ]; then OK=1; break; fi
  sleep 1
done
[ "$OK" = "1" ] || rollback

PUB="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$PUBLIC_URL/api/status" || true)"
log "public $PUBLIC_URL/api/status => $PUB"
[ "$PUB" = "200" ] || rollback

log "service: $(systemctl is-active "$SERVICE")"
log "version header: $(curl -sI -m 10 "$PUBLIC_URL/api/status" | grep -i 'x-new-api-version' | tr -d '\r' || true)"
log "===== deploy done: $(git log -1 --format='%h %s') ====="
echo "DEPLOY_OK commit=$TARGET backup=$PREV_BIN version=$VERSION"
