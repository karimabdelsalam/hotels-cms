#!/usr/bin/env bash
#
# Nightly backup: the database, and the media directory.
#
#   0 3 * * *  /home/fantazia/app/infra/backup.sh >> /var/log/fantazia/backup.log 2>&1
#
# The database alone is not a backup of this system — every image lives on disk
# and is referenced by a row. Restoring one without the other gives a site full
# of broken pictures.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/fantazia/backups}"
MEDIA_DIR="${MEDIA_DIR:-/home/fantazia/media}"
DB_NAME="${DB_NAME:-fantazia}"
DB_USER="${DB_USER:-fantazia}"
KEEP_DAYS="${KEEP_DAYS:-30}"

stamp="$(date +%Y-%m-%d_%H%M)"
mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/media"

echo "[$(date -Is)] dumping $DB_NAME"
pg_dump --format=custom --no-owner --no-privileges \
  --username="$DB_USER" "$DB_NAME" \
  > "$BACKUP_DIR/db/$DB_NAME-$stamp.dump"

echo "[$(date -Is)] syncing media"
# Hard-linked against the previous run, so thirty days of history costs about
# one copy on disk plus whatever actually changed.
rsync -a --delete \
  --link-dest="$BACKUP_DIR/media/latest" \
  "$MEDIA_DIR/" "$BACKUP_DIR/media/$stamp/"
ln -sfn "$BACKUP_DIR/media/$stamp" "$BACKUP_DIR/media/latest"

echo "[$(date -Is)] pruning older than $KEEP_DAYS days"
find "$BACKUP_DIR/db" -name '*.dump' -mtime "+$KEEP_DAYS" -delete
find "$BACKUP_DIR/media" -maxdepth 1 -type d -mtime "+$KEEP_DAYS" -exec rm -rf {} +

echo "[$(date -Is)] done — $(du -sh "$BACKUP_DIR" | cut -f1) total"
echo "Copy this off the server. A backup that only exists on the machine it"
echo "protects is not a backup."
