#!/usr/bin/env bash
#
# Writes the Apache proxy configuration into cPanel's userdata include
# directories, with the placeholders filled in.
#
# Hand-editing four copies of two templates is the step most likely to go
# wrong, and it goes wrong quietly: a missed port sends the admin's traffic to
# the public site, and a missed path makes /_next/static 404 so the site loads
# unstyled. This does the substitution once and checks the result.
#
# Run as root, after the apps are built and PM2 has them online.
#
#   ./install.sh \
#     --user planova \
#     --app /home/planova/ihotel-app \
#     --public ihotel.planova.com.eg     --public-port 3100 \
#     --admin  ihotel-admin.planova.com.eg --admin-port 3101
#
set -euo pipefail

USER_NAME="" APP_DIR="" PUBLIC_HOST="" ADMIN_HOST="" PUBLIC_PORT=3000 ADMIN_PORT=3001
USERDATA="/etc/apache2/conf.d/userdata"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user)        USER_NAME="$2"; shift 2 ;;
    --app)         APP_DIR="$2"; shift 2 ;;
    --public)      PUBLIC_HOST="$2"; shift 2 ;;
    --admin)       ADMIN_HOST="$2"; shift 2 ;;
    --public-port) PUBLIC_PORT="$2"; shift 2 ;;
    --admin-port)  ADMIN_PORT="$2"; shift 2 ;;
    --userdata)    USERDATA="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

for required in USER_NAME APP_DIR PUBLIC_HOST ADMIN_HOST; do
  if [[ -z "${!required}" ]]; then
    echo "Missing --${required,,}" | tr '_' '-' >&2
    exit 2
  fi
done

if [[ $EUID -ne 0 ]]; then
  echo "Run this as root — it writes under /etc/apache2." >&2
  exit 1
fi

# Fail before writing anything rather than half-way through.
[[ -d "$APP_DIR/infra/apache" ]] || { echo "No $APP_DIR/infra/apache — is --app right?" >&2; exit 1; }
[[ -d "$APP_DIR/apps/web/.next/static" ]] || {
  echo "No built assets at $APP_DIR/apps/web/.next/static — run 'pnpm build' first." >&2; exit 1; }
[[ -d "$USERDATA" ]] || {
  echo "No $USERDATA. Check the path in WHM > Apache Configuration > Include Editor," >&2
  echo "then pass it with --userdata." >&2; exit 1; }

id "$USER_NAME" >/dev/null 2>&1 || { echo "No such system user: $USER_NAME" >&2; exit 1; }

fill() {
  # $1 template, $2 destination, $3 port, $4 which app's static directory
  sed -e "s|<user>|${USER_NAME}|g" \
      -e "s|/home/${USER_NAME}/app/|${APP_DIR}/|g" \
      -e "s|/home/<user>/app/|${APP_DIR}/|g" \
      -e "s|127\.0\.0\.1:${4}|127.0.0.1:${3}|g" \
      "$1" > "$2"
}

echo "Writing configuration:"
for host_port in "${PUBLIC_HOST}:${PUBLIC_PORT}:fantazia.conf:3000" \
                 "${ADMIN_HOST}:${ADMIN_PORT}:fantazia-admin.conf:3001"; do
  IFS=: read -r host port template default_port <<< "$host_port"
  for scope in std ssl; do
    dir="${USERDATA}/${scope}/2_4/${USER_NAME}/${host}"
    mkdir -p "$dir"
    fill "$APP_DIR/infra/apache/$template" "$dir/fantazia.conf" "$port" "$default_port"
    echo "  $dir/fantazia.conf"
  done
done

# A leftover placeholder means a path that does not exist, which fails as a 404
# rather than as an error — worth catching here.
if grep -rl "<user>" "${USERDATA}"/*/2_4/"${USER_NAME}"/{"$PUBLIC_HOST","$ADMIN_HOST"}/ 2>/dev/null | head -1 | grep -q .; then
  echo "A <user> placeholder survived the substitution. Check the templates." >&2
  exit 1
fi

echo
echo "Rebuilding vhost includes"
/scripts/ensure_vhost_includes --all-users

echo "Testing the configuration"
apachectl configtest

echo
echo "Restart Apache to apply:  systemctl restart httpd"
echo
echo "Then:"
echo "  curl -sI https://${PUBLIC_HOST}/en   | head -1"
echo "  curl -sI https://${ADMIN_HOST}/login | head -1"
