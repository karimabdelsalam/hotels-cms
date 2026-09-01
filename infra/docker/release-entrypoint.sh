#!/bin/sh
# Makes the media volume writable by the application user, then becomes that
# user and runs the release.
#
# The image creates /media owned by node, and Docker is supposed to carry that
# ownership onto a new named volume mounted there. It does not do so reliably —
# an empty source directory, or another service mounting the same volume from
# an image that has no /media of its own (caddy), can leave the volume root
# owned by root, and the first write fails with EACCES partway through seeding.
#
# So do not depend on it. This runs as root, fixes the volume, and drops back
# to node before anything touches the database. Only this one service is ever
# root, and only for the two lines above the exec.
set -eu

if [ "$(id -u)" = "0" ]; then
  chown -R node:node /media
  # HOME set explicitly: pnpm writes its cache under it, and su's rules for
  # which variables survive are not worth relying on.
  exec su node -s /bin/sh -c 'HOME=/home/node exec /usr/local/bin/release.sh'
fi

# Already unprivileged — either the volume was fine or someone ran this by
# hand. Nothing to fix, and nothing to drop to.
exec /usr/local/bin/release.sh
