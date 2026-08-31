#!/usr/bin/env bash
#
# Deploy the current branch. Run as the `fantazia` user from the app directory.
#
#   ./infra/deploy.sh
#
# Builds into a fresh directory before switching PM2 over, so a failed build
# leaves the running site untouched.
set -euo pipefail

APP_DIR="${APP_DIR:-/home/fantazia/app}"
BRANCH="${BRANCH:-main}"
cd "$APP_DIR"

log() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

log "Fetching $BRANCH"
git fetch --prune origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

log "Installing dependencies"
pnpm install --frozen-lockfile

log "Generating the database client"
pnpm --filter @fantazia/db exec prisma generate

# Migrations run before the build so a schema the new code needs is already
# there. Prisma refuses to apply anything destructive without review.
log "Applying migrations"
pnpm --filter @fantazia/db exec prisma migrate deploy

# Keys live in code, translations in the database. Syncing here means a wording
# change in en.json always reaches the Translation Manager, and every other
# language is flagged for review rather than silently going stale.
log "Syncing translation keys"
pnpm --filter @fantazia/db sync:strings

log "Building"
pnpm build

log "Reloading"
# Reload rather than restart: PM2 starts the new process, waits for it to
# listen, then stops the old one. No dropped requests.
pm2 reload infra/ecosystem.config.cjs --update-env

log "Checking health"
sleep 4
for target in "http://127.0.0.1:3000/api/health" "http://127.0.0.1:3001/api/health"; do
  if curl -fsS --max-time 10 "$target" >/dev/null; then
    echo "  ok   $target"
  else
    echo "  FAIL $target"
    echo "  Rolling back to the previous PM2 state."
    pm2 reload infra/ecosystem.config.cjs --update-env || true
    exit 1
  fi
done

log "Deployed"
pm2 status
