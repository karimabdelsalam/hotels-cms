#!/bin/sh
# Writes .env from the template and fills in the secrets.
#
#   ./infra/docker/setup-env.sh ihotel.planova.com.eg ihotel-admin.planova.com.eg you@example.com
#
# Editing the template by hand is the step people get wrong: compose treats an
# empty value exactly like a missing one, so a key left as "" fails the same
# way as a key never written, and the error names the variable without saying
# it is sitting right there in the file, blank.
#
# Refuses to overwrite an existing .env — that file holds the only copy of the
# session secret and the database password.
set -eu

if [ -f .env ]; then
  echo "✗ .env already exists. Delete it first if you really mean to start over." >&2
  echo "  (Doing that with the stack already running orphans the database:" >&2
  echo "   the volume keeps the old password, the new .env has a new one.)" >&2
  exit 1
fi

if [ $# -ne 3 ]; then
  echo "usage: $0 <public-domain> <admin-domain> <acme-email>" >&2
  exit 2
fi

PUBLIC_DOMAIN=$1
ADMIN_DOMAIN=$2
ACME_EMAIL=$3

for d in "$PUBLIC_DOMAIN" "$ADMIN_DOMAIN"; do
  case "$d" in
    *.*) ;;
    *) echo "✗ '$d' does not look like a hostname" >&2; exit 2 ;;
  esac
done

cp .env.docker.example .env

# hex, not base64: base64 emits + / and =, which need correct quoting in a
# dotenv file and are easy to mangle when copied through a terminal.
set_var() {
  sed -i "/^$1=/d" .env
  printf '%s=%s\n' "$1" "$2" >> .env
}

set_var PUBLIC_DOMAIN     "$PUBLIC_DOMAIN"
set_var ADMIN_DOMAIN      "$ADMIN_DOMAIN"
set_var ACME_EMAIL        "$ACME_EMAIL"
set_var POSTGRES_PASSWORD "$(openssl rand -hex 24)"
set_var AUTH_SECRET       "$(openssl rand -hex 32)"
set_var REVALIDATE_SECRET "$(openssl rand -hex 24)"
set_var PAYMENT_TEST_SECRET "$(openssl rand -hex 24)"

chmod 600 .env

echo "✓ .env written"
sed -nE 's/^(PUBLIC_DOMAIN|ADMIN_DOMAIN|ACME_EMAIL|POSTGRES_PASSWORD|AUTH_SECRET|REVALIDATE_SECRET)=(.{8}).*/  \1=\2…/p' .env

echo
echo "Both hostnames must already resolve to this server, or Let's Encrypt"
echo "cannot issue certificates. Check before starting:"
echo "  dig +short $PUBLIC_DOMAIN"
echo "  dig +short $ADMIN_DOMAIN"
echo
echo "Then:  docker compose up -d --build"
