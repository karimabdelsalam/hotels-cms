#!/bin/sh
# Runs once before the apps start, every time the stack comes up.
#
# Migrations are idempotent by design, so re-running them is free. Seeding is
# not, so it is guarded: the seeds run only when the database holds no resorts,
# which means a fresh volume. Restarting the stack never touches your content.
set -eu

echo "→ waiting for postgres"
until node -e "
  const net = require('net');
  const s = net.connect(5432, 'db');
  s.on('connect', () => { s.end(); process.exit(0); });
  s.on('error', () => process.exit(1));
" 2>/dev/null; do
  sleep 1
done

echo "→ applying migrations"
pnpm --filter @fantazia/db exec prisma migrate deploy

# Run from inside the db package. pnpm does not hoist @prisma/client to the
# workspace root, so `node -e "require('@prisma/client')"` from /app fails to
# resolve it. Single-quoted so the shell leaves $disconnect alone.
#
# No catch: if this query fails the answer is unknown, and guessing "empty"
# would re-seed a database that already has content.
echo "→ checking whether this is a fresh database"
RESORTS=$(pnpm --filter @fantazia/db exec node -e '
  const { PrismaClient } = require("@prisma/client");
  const p = new PrismaClient();
  p.resort.count()
    .then((n) => { console.log(n); return p.$disconnect(); })
    .catch((e) => { console.error(e.message); process.exit(1); });
')

if [ "$RESORTS" = "0" ]; then
  echo "→ empty database, seeding"
  pnpm --filter @fantazia/db seed
  pnpm --filter @fantazia/db seed:booking

  if [ "${SEED_DEMO_CONTENT:-yes}" = "yes" ]; then
    # Draws its own images, so this is the slow part of a first run.
    echo "→ seeding demo content and images"
    pnpm --filter @fantazia/db seed:demo
  fi
else
  echo "→ database already holds $RESORTS resorts, leaving it alone"
fi

# After the seed, never before it. This tops up interface strings added since
# a database was created, and every string is keyed to a locale row — on a
# fresh database those rows do not exist until the seed creates them, and the
# insert dies on the foreign key.
echo "→ syncing interface strings"
pnpm --filter @fantazia/db sync:strings

echo "→ ready"
